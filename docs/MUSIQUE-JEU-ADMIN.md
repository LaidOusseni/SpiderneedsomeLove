# Le son de l'amour, Jouer avec l'amour et tableau de bord

Migration : `supabase/migrations/20261125120000_music_game_admin.sql` (additive : aucune table existante modifiée).

## 1. Mettre en place l'accès administrateur

L'accès à `/admin` est vérifié **dans la base** (`public.is_admin()`, `public.admin_dashboard()` → erreur 42501 / HTTP 403
sinon). Aucun mot de passe ni clé de service dans le code.

1. Appliquer la migration (Supabase → SQL Editor, ou `supabase db query --remote -f <fichier>`).
2. Supabase → **Authentication → Users → Add user** : ton e-mail + un mot de passe fort, « Auto confirm user ».
3. SQL Editor : `select lf_admin.grant_admin('ton-adresse@exemple.fr');`
4. Recommandé : **Authentication → Sign In / Providers → désactiver « Allow new users to sign up »**.
   (Un compte créé par un inconnu n'aurait de toute façon aucun accès : `admin_dashboard` refuse tout compte absent de
   `lf_private.admin_users`.)
5. Se connecter sur `https://www.lov-and-faith.com/admin`.

Retirer un accès : `select lf_admin.revoke_admin('adresse@exemple.fr');`

## 2. Mesure d'audience (RGPD)

Conçue pour l'exemption de consentement de la CNIL (mesure d'audience strictement nécessaire) :

- identifiant de visiteur **aléatoire** (stockage local, renouvelé tous les 13 mois), aucun cookie, aucun service tiers ;
- **aucune** adresse IP, aucun nom, aucun e-mail, pas de fingerprinting ;
- événements conservés **25 mois** (purge automatique dans `public.track_events`) ;
- refus possible sur la page Politique de confidentialité ; « Do Not Track » et « Global Privacy Control » respectés ;
- robots, navigateurs automatisés et pages `/admin` jamais comptés.

Écriture uniquement via `public.track_events(jsonb)` (25 événements max par appel, 600 par visite et par heure,
types et formats vérifiés par la base). Table privée `lf_private.analytics_events` : aucune lecture publique.

| Événement | Quand | `value` |
|---|---|---|
| `page_view` | changement de page (un paramètre `?c=` ne compte pas) | — |
| `page_time` | en quittant la page : temps passé, onglet visible uniquement (max 1 h) | secondes |
| `game_open` | page du jeu ouverte et 51games.fr joignable : session de jeu ouverte depuis Love&Faith | — |
| `game_ready` | message `ready` reçu de 51 Wheeling (origine vérifiée), une fois par chargement | — |
| `game_run_end` | message `run_end` reçu de 51 Wheeling | score (`mode` = mode de jeu) |
| `game_fullscreen` | clic sur « Plein écran » | — |
| `game_external` | clic vers 51games.fr | — |
| `music_start` | **lecture** : premier démarrage effectif d'un morceau chargé | — |
| `music_listen` | **écoute significative** : 30 s réellement écoutées (ou la moitié d'un morceau plus court) | — |
| `music_complete` | morceau écouté jusqu'à la fin | — |
| `music_time` | secondes réellement jouées (à la pause, au changement, en quittant la page) | secondes |
| `music_pause` | pause demandée par l'auditeur | — |
| `music_skip` | passage à un autre morceau avant la fin | — |

Définitions du tableau de bord : **visiteurs uniques** = identifiants distincts sur la période ; **visiteurs (cumul
journalier)** = visiteurs uniques de chaque jour additionnés ; **session** = visite (nouvelle après 30 min sans activité) ;
**pages vues** = `page_view`. Votes, précommandes et newsletter sont lus dans leurs tables existantes (aucune copie).

Limites : le bouton « Jouer » est dans le jeu (51games.fr) : ses clics ne sont pas visibles depuis Love&Faith. Les
parties terminées ne sont connues que si 51 Wheeling envoie `run_end`.

## 3. Le son de l'amour : ajouter un morceau

1. Déposer le fichier dans `Music/` sous le nom `Artiste - Titre.ext` (MP3 ou AAC, même avec une extension `.mpeg` / `.mp4`).
2. `npm run music:import` : copie à l'identique dans `public/music/` avec la bonne extension, pochette intégrée extraite,
   durée lue ; régénère `src/constants/music.js` et `supabase/seed_music_tracks.sql`.
3. Exécuter `supabase/seed_music_tracks.sql` dans Supabase (ajoute les nouveaux morceaux sans toucher aux autres).
4. Retirer un morceau sans le supprimer : `update public.music_tracks set is_published = false where id = '…';`

## 4. Jouer avec l'amour

Le jeu reste servi par `https://www.51games.fr` (jamais copié) dans une iframe dont l'adresse est celle du widget
officiel : `/?embed=1&partner=loveandfaith&host=<domaine>`. Le serveur du jeu autorise l'intégration
(`Content-Security-Policy: frame-ancestors *`, `Permissions-Policy` plein écran / manette / capteurs).
Les messages du jeu ne sont acceptés que s'ils viennent de `https://www.51games.fr` **et** de l'iframe du site.

Tests : `npm run build && npx vite preview --port 4173`, puis `node scripts/e2e-music-game-admin.mjs`
(`ONLY=music|game|admin|analytics|nav` pour une partie).
