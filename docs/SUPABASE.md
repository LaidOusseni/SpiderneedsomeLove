# Supabase — mise en place du vote communautaire

> **État au 31/10/2026** : le site est branché sur le projet `tpvmpbofkwmsjqnkuirq`
> (`.env` local ; l'ancienne configuration est conservée dans `.env.ancien-projet.local`).
> **Ce projet est vide : aucune table ni fonction n'existe encore.** Tant que les scripts ci-dessous ne sont pas
> exécutés, le site fonctionne mais affiche « les résultats ne sont pas disponibles » et ne propose pas le vote.
> Les scripts sont testés localement sur une base vierge (PostgreSQL embarqué, `npm test`).

## 1. Exécuter les scripts (une seule fois, dans cet ordre)

Dashboard Supabase → projet `tpvmpbofkwmsjqnkuirq` → **SQL Editor** → *New query* → coller → **Run** :

1. `supabase/migrations/20261029120000_community_vote.sql` — créations, drop, votes, fonctions de vote
2. `supabase/migrations/20261031120000_newsletter.sql` — table newsletter (inscription seule)
3. `supabase/seed_creations.sql` — les 7 créations + le drop (en « préparation »)

Les trois scripts peuvent être relancés sans risque (aucune donnée écrasée, aucun doublon, rien de supprimé).

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

## 4. Ouvrir, clôturer, annoncer

Dans le SQL Editor :

```sql
-- Ouvrir le vote
update public.drop_settings set vote_status = 'open', opens_at = now() where id = 1;

-- (optionnel) Clôture automatique à une date choisie
update public.drop_settings set closes_at = '2026-12-01 20:00+01' where id = 1;

-- Clôturer (les jauges restent visibles avec les résultats définitifs ; les boutons de vote disparaissent)
update public.drop_settings set vote_status = 'closed' where id = 1;

-- Désigner officiellement la création retenue (y compris pour départager une égalité)
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

## 5. Consulter les votes (vous seul·e)

Table Editor du dashboard (connecté en administrateur), ou :

```sql
select c.name, count(v.*) as votes
from public.creations c left join public.votes v on v.creation_id = c.id
group by c.name order by votes desc;

select count(distinct instagram_normalized) as personnes_distinctes from public.votes;
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
