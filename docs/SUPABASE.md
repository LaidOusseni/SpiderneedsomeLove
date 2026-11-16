# Supabase — mise en place du vote communautaire

> **État au 15/11/2026** : le site est configuré pour le projet `tpvmpbofkwmsjqnkuirq`
> (`.env` local ; l'ancienne configuration est conservée dans `.env.ancien-projet.local`).
> L'API du projet répond, mais `get_drop_overview` n'est pas encore présente dans le cache de schéma PostgREST.
> `supabase-setup.sql` ne crée que les anciennes tables `preorders` et `newsletter` : il ne suffit pas pour le vote.
> Appliquer les migrations ci-dessous dans l'ordre depuis le SQL Editor Supabase. Elles ont été testées localement
> sur PostgreSQL embarqué ; l'accès administratif au projet distant doit être fait depuis le dashboard.

## 1. Exécuter les scripts (une seule fois, dans cet ordre)

Dashboard Supabase → projet `tpvmpbofkwmsjqnkuirq` → **SQL Editor** → *New query* → coller → **Run** :

1. `supabase/migrations/20261029120000_community_vote.sql` — créations, drop, votes, fonctions de vote
2. `supabase/migrations/20261031120000_newsletter.sql` — table newsletter (inscription seule)
3. `supabase/seed_creations.sql` — les 7 créations + le drop (en « préparation »)
4. `supabase/migrations/20261105120000_preorders.sql` — collecte des précommandes Batman
5. `supabase/migrations/20261105130000_open_candidate_vote.sql` — Batman en drop actuel et vote ouvert pour toutes les candidates
6. `supabase/migrations/20261114120000_drops_votes_newsletter.sql` — table `drops`, `votes` renommée `drop_votes`,
   statuts de candidature, vue `drop_vote_totals`, table `newsletter_subscribers`, fonctions d'administration `lf_admin`
7. `supabase/migrations/20261114130000_preorder_registrations.sql` — fourchette de prix, intentions de précommande,
   agrégats, limitation de fréquence et fonctions d'administration
8. `supabase/migrations/20261115160000_preorder_identity.sql` — nom et Instagram facultatif pour les intentions ;
   révocation de l'ancien point d'entrée de précommande
9. `supabase/migrations/20261115170000_open_voting_without_batman_candidate.sql` — conserve les anciens votes,
   exclut « Love in Darkness » du vote (même T-shirt que Batman) et ouvre le vote pour les autres candidates

Les migrations peuvent être relancées. La migration 6 archive le gagnant annoncé (s'il y en a un), ouvre le vote sans date de fermeture et conserve toutes les lignes de votes existantes. La migration 7 conserve également la table et les données de l'ancien formulaire `preorders`.

## 2. Mettre la configuration en ligne (Vercel)

Vercel → projet → **Settings → Environment Variables** (Production + Preview) :

| Variable | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | `https://tpvmpbofkwmsjqnkuirq.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_DI3nRQPagTyRLlZrIvDUsA_9yjuF5pD` (clé **publique** uniquement) |

Puis redéployer (les variables `VITE_*` sont intégrées au moment du build).
**Ne jamais** mettre la clé secrète / `service_role` dans ces variables ni dans le code.

## 3. Ce que créent les scripts

| Élément | Rôle | Accès depuis le site (clé publique) |
|---|---|---|
| `creations` | slug, nom, description, visuels, `is_active`, `is_candidate`, `status`, dates | lecture des créations actives |
| `drop_settings` | statut du vote (`preparing` / `open` / `closed` / `announced`), dates, gagnant **désigné explicitement** | lecture seule |
| `votes` | prénom, nom, Instagram (saisi + normalisé), date, empreinte IP salée | **aucun** (ni lecture, ni écriture directe) |
| `newsletter` | e-mail, date | insertion seule (ni lecture, ni modification, ni suppression) |
| `cast_vote(...)` | seule porte d'entrée du vote : valide les champs, normalise l'Instagram, vérifie création + vote ouvert, limite à 15 votes / 10 min par connexion, insère, gère les doublons (même simultanés) | exécution |
| `get_drop_overview()` | statut du drop + **nombre** de votes par création, sans aucune donnée personnelle | exécution |

Sécurité (RLS + privilèges) : le site ne peut ni lire les votants, ni modifier/supprimer un vote, ni changer un
compteur (les compteurs sont calculés par `count(*)` sur les votes réels), ni ouvrir/fermer le vote, ni désigner un
gagnant : ces actions ne sont possibles que depuis le dashboard (rôle administrateur).

**Règle de vote** : un vote par création et par compte Instagram (contrainte `UNIQUE (creation_id,
instagram_normalized)` en base). Une personne peut soutenir plusieurs créations. Pour passer à « un seul vote par
personne pour tout le drop », il faudrait remplacer cette contrainte par `UNIQUE (instagram_normalized)` — décision à
prendre avant l'ouverture du vote (le site et les textes seraient à ajuster en conséquence).

## 4. Fermer manuellement, annoncer

Le vote reste ouvert tant que vous ne le fermez pas. La migration met `closes_at` à `NULL` et interdit les dates de fermeture automatique en base.
Dans le SQL Editor du dashboard Supabase, exécuter manuellement :

```sql
-- Fermer les votes. Les jauges restent visibles et les votes existants sont conservés.
update public.drop_settings set vote_status = 'closed' where id = 1;

-- Après clôture, désigner officiellement la création retenue.
update public.drop_settings
  set vote_status = 'announced',
      winner_creation_id = (select id from public.creations where slug = 'world-love'),
      winner_announced_at = now()
where id = 1;

-- Retirer / remettre une création dans la compétition
update public.creations set is_candidate = false, status = 'preparing' where slug = 'plva';
update public.creations set is_candidate = true,  status = 'candidate' where slug = 'plva';
```

Ce que montre « Le chemin de l'amour » selon le statut :

| Statut | Affichage |
|---|---|
| `preparing` | « Le vote se prépare » + créations en lice, **aucun chiffre** |
| `open` | jauges réelles (votes ÷ total × 100), création en tête « provisoire », égalité signalée |
| `closed` | résultats définitifs ; « termine en tête » ou « égalité en tête » — **pas** de gagnant officiel |
| `announced` | création officiellement retenue (celle de `winner_creation_id`, jamais déduite du classement) |

Actualisation : à l'arrivée sur la page, après chaque vote, puis toutes les 45 s quand l'onglet est visible.

Batman (`batman-drop-01`) est le drop actuel et Masks & Hearts reste historique. Les deux sont exclus du vote et du classement. « Love in Darkness » reprend le même T-shirt et la même histoire que Batman : il est retiré de la liste des candidates. Ses éventuels votes précédents restent dans `drop_votes`, mais ne figurent plus dans le classement. Les cinq candidates restantes sont comptées depuis leurs votes réels.

## 5. Consulter les votes (vous seul·e)

Table Editor du dashboard (connecté en administrateur), ou :

```sql
select c.name, count(v.*) as votes
from public.creations c left join public.drop_votes v on v.candidate_id = c.id
group by c.name order by votes desc;

select count(distinct instagram_normalized) as personnes_distinctes from public.drop_votes;
```

## 6. Vérifications après exécution

```bash
U=https://tpvmpbofkwmsjqnkuirq.supabase.co; K=sb_publishable_DI3nRQPagTyRLlZrIvDUsA_9yjuF5pD
# Doit être refusé (permission denied) : lecture des votants
curl "$U/rest/v1/votes?select=*" -H "apikey: $K"
# Doit être refusé : lecture de la newsletter
curl "$U/rest/v1/newsletter?select=*" -H "apikey: $K"
# Doit renvoyer le statut et les compteurs, sans nom ni Instagram
curl -X POST "$U/rest/v1/rpc/get_drop_overview" -H "apikey: $K" -H "Content-Type: application/json" -d '{}'
```

## 7. Limites connues

- Un identifiant Instagram ne prouve pas l'identité d'une personne : quelqu'un peut voter avec plusieurs comptes ou
  l'identifiant d'un autre. Pour renforcer : connexion par lien magique (Supabase Auth) ou vérification par message
  Instagram. Non mis en place.
- La limitation de fréquence repose sur l'IP transmise par l'API ; un réseau partagé (école, 4G) partage la même
  limite (15 votes / 10 min).
- Anti-robot : champ piège + validation serveur + limitation. Un CAPTCHA (Cloudflare Turnstile) pourra être ajouté.
- Politique de confidentialité (`/confidentialite`) : l'identité légale du responsable et les durées de conservation
  sont à valider dans `src/constants/privacy.js`.


## 8. Organisation depuis le 14/11/2026 (migration 20261114120000)

| Objet | Rôle | Accès public (clé anon) |
|---|---|---|
| `drops` | drops commerciaux : `slug`, `name`, `description`, `status` (`upcoming` / `current` / `archived`), `front_image`, `back_image`, `banner_image`, `price`, `is_featured`, `preorder_open`, `is_vote_candidate`, `creation_id`, dates. Batman = `current` (précommandes ouvertes), Masks & Hearts = `archived`. Un seul `current` à la fois. | lecture |
| `creations.vote_status` | statut de candidature : `candidate` / `voting_open` / `voting_closed` / `selected` (NULL = pas candidate) | lecture |
| `drop_votes` | ex-table `votes`, renommée sans perte : `id`, `candidate_id`, `first_name`, `last_name`, `instagram_handle`, `instagram_normalized` (= identifiant du votant), `client_hash`, `created_at`. Anti-doublon : `UNIQUE (candidate_id, instagram_normalized)` | aucun |
| `drop_vote_totals` (vue) | `candidate_id`, `slug`, `name`, `image`, `front_mockup_path`, `vote_status`, `votes`, `rank` (égalité = même rang), `position` (ordre stable). Calculée par `count(*)` sur `drop_votes` ; exclut drop actuel, anciens drops et non-candidates | lecture |
| `newsletter_subscribers` | `id`, `email` (unique, minuscules), `status` (`subscribed` / `unsubscribed`), `consent_at`, `source`, `unsubscribe_token`, `unsubscribed_at`, `client_hash`, dates. Les adresses de l'ancienne table `newsletter` y sont copiées (`source = legacy_newsletter`) ; l'ancienne table est conservée | aucun |
| `newsletter_subscribe(email, consent, website)` | inscription : validation, consentement obligatoire, anti-doublon, 10 essais / 10 min par connexion | exécution |
| `newsletter_unsubscribe(token)` | désinscription par jeton | exécution |

### Fermer / rouvrir les votes (SQL Editor)

```sql
select lf_admin.close_voting();                  -- ferme : plus de vote, classement et scores conservés
select lf_admin.open_voting();                   -- rouvre (aucune fermeture automatique)
select lf_admin.set_candidate('plva', false);    -- retire une création (ses votes sont conservés)
select lf_admin.select_creation('world-love');   -- désigne la création retenue (ferme aussi les votes)
```

Alternative sans SQL : Table Editor → `drop_settings` → `vote_status` = `closed` (ou `open`). Un déclencheur met à jour
les statuts des candidates. Le schéma `lf_admin` n'est pas exposé par l'API : le site ne peut pas appeler ces fonctions.

### Retrouver les inscrits

Table Editor → `newsletter_subscribers` (filtrer `status = subscribed`), ou :

```sql
select email, consent_at, source from public.newsletter_subscribers where status = 'subscribed' order by created_at;
```

Lien de désinscription à placer dans chaque lettre : `https://<domaine>/newsletter/desinscription?jeton=<unsubscribe_token>`.

## 9. Intentions de précommande (migration 20261114130000)

Le formulaire Batman recueille un intérêt, pas une commande : aucun paiement ni conversion en commande n'est déclenché.
Le prix final reste vide jusqu'à décision explicite. La fourchette initiale est de 25 à 35 €.

| Élément | Rôle | Accès public (clé anon) |
|---|---|---|
| `drops.price_min`, `price_max`, `final_price`, `preorders_closed_at` | Fourchette indicative, tarif définitif facultatif, date de fermeture | lecture de `drops` déjà publique |
| `preorder_registrations` | Une ligne par personne et par drop : prénom, nom, e-mail normalisé, identifiant Instagram facultatif, consentement, statut, empreinte IP salée, dates | aucun |
| `preorder_registration_items` | Une ligne par taille et par inscription, avec quantité | aucun |
| `preorder_stats_by_drop` | Nombre de personnes intéressées distinct du total de T-shirts | aucun |
| `preorder_size_breakdown` | Répartition agrégée par taille (personnes et T-shirts) | aucun |
| `register_preorder_with_identity(...)` | Valide prénom, nom, Instagram facultatif, consentement, ouverture, champ piège et fréquence ; même e-mail = mise à jour des tailles et de l'identité | exécution |
| `count_preorder_registrations(slug)` | Nombre de personnes intéressées seulement | exécution |

Les tables personnelles n'accordent aucun privilège à `anon` ou `authenticated` (RLS activée, aucune politique publique).
La migration révoque également l'ancien droit d'insertion sur `preorders` sans supprimer ni modifier ses lignes.
Les deux vues détaillées sont réservées à l'administration ; la fonction publique de compteur ne renvoie aucune donnée personnelle.
La limitation est de 5 envois par empreinte IP salée sur 10 minutes (empreinte d'e-mail si l'IP n'est pas transmise).
Le champ anti-robot n'est jamais stocké. La contrainte `UNIQUE (drop_id, email)` évite les doublons ;
une nouvelle demande remplace la répartition des tailles enregistrée pour cette personne.

### Actions d'administration (SQL Editor)

```sql
select lf_admin.close_preorders('batman-drop-01');
select lf_admin.open_preorders('batman-drop-01');
select lf_admin.set_drop_status('batman-drop-01', 'archived'); -- upcoming | current | archived
select lf_admin.set_final_price('batman-drop-01', 29.90);      -- refuse tout prix hors 25–35 €

-- Données nominatives et tailles (administration uniquement)
select * from public.preorder_registrations order by created_at desc;
select * from public.preorder_registration_items;
select * from public.preorder_stats_by_drop;
select * from public.preorder_size_breakdown order by slug, size;
```

Le tarif final ne s'affiche pas tant qu'il n'est pas défini. Fermer un drop ne supprime aucune inscription.
Les fonctions d'administration sont dans `lf_admin`, un schéma non exposé aux rôles de l'API.
