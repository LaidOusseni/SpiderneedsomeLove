# Love&Faith — site interactif

Intro immersive → sélection des créations façon écran de personnages → vêtement 3D manipulable →
histoire de la création → vote communautaire (Supabase) → jauges de progression.

**Stack** : React 18 · Vite 5 · CSS Modules · React Router 7 · Supabase JS 2 ·
Three.js 0.169 + React Three Fiber 8 + drei 9 (3D) · déployé sur Vercel.

## Lancer en local

```bash
npm install
cp .env.example .env      # puis renseigner l'URL et la clé PUBLIQUE Supabase
npm run dev               # http://localhost:3000
```

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production (`dist/`) |
| `npm test` | Tests unitaires + tests SQL (la vraie migration exécutée dans PostgreSQL embarqué) |
| `npm run assets` | Régénère les visuels web à partir de `Intro/`, `Icon/`, `Mockups/` |
| `npm run check:e2e` | Parcours complet dans Chrome headless (après `npm run build && npx vite preview --port 4173`) |

> Cache npm déplacé sur `D:\dev-cache\npm` (le disque C: était plein).

## Supabase

Voir **[docs/SUPABASE.md](docs/SUPABASE.md)** : migration à exécuter, ouverture / clôture du vote,
désignation du gagnant, vérifications de sécurité.

### Drop actuel et prochaines créations

- Le premier drop Love&Faith est le Batman (`batman-drop-01`) : il est mis en avant comme produit disponible à la précommande.
- `Love in Darkness` et les autres candidates restent en compétition pour le prochain drop.
- Masks & Hearts est historique et le Batman est exclu du classement communautaire.
- Les formulaires de précommande sont gérés côté frontend avec sauvegarde locale en secours si la table Supabase `preorders` n'est pas encore créée.

## Déploiement Vercel

1. Vercel → Project → Settings → Environment Variables : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   (Production + Preview). Ne jamais y mettre la clé `service_role`.
2. Build command `npm run build`, output `dist` (inchangé). `vercel.json` gère le rafraîchissement des routes.
3. Exécuter la migration Supabase **avant** d'ouvrir le vote.

## Organisation

```
src/
  constants/
    creations.js          ← configuration centrale des créations (nom, statut, coupe, couleur, textures)
    creationStories.js    ← histoires des créations (texte seul)
    generated/prints.json ← position des motifs (généré par npm run assets)
    about.js, socials.js, site.js, navigation.js
  sections/               ← pages : Intro, Propager (sélection), CreationDetail, About, Journey (/chemin)
  components/             ← NavBar, GarmentViewer, VoteForm, ProgressGauge, StatusBadge, Modal
  three/                  ← moteur 3D : géométrie procédurale du vêtement, matériaux, environnement
  services/               ← appels Supabase (voteService, newsletterService)
  context/                ← résultats de vote partagés (actualisés toutes les 45 s)
  utils/                  ← normalisation Instagram, statistiques, statuts
scripts/                  ← préparation des ressources, vérification e2e
supabase/                 ← migration + initialisation des créations
public/creations/<slug>/  ← icon.webp, front.webp, back.webp, print-front.png, print-back.png
public/brand/             ← logo 3D, logo 2D détouré, vidéo d'intro allégée
```

### Ajouter une création

1. `scripts/creation-sources.mjs` : déclarer l'icône et les mockups → `npm run assets`.
2. `src/constants/creations.js` : ajouter l'entrée (même `slug`).
3. `src/constants/creationStories.js` : ajouter son histoire.
4. Supabase : `insert into public.creations (slug, name, is_candidate, status) values ('mon-slug', 'Nom', true, 'candidate');`

### Remplacer une texture (ex. fichier d'impression HD)

Déposer un PNG transparent dans `public/creations/<slug>/print-front.png` (ou `print-back.png`).
Si le cadrage change, préciser `garment.prints.front.rect` dans `creations.js`
(rectangle du motif dans la silhouette du vêtement, valeurs 0→1 : `[gauche, haut, droite, bas]`).

### La figurine 3D (vue 3D) et la vue 2D

Sur « Propager l'amour », le sélecteur **Vue 3D / Vue 2D** (mémorisé pour chaque visiteur) affiche soit
la **figurine Love&Faith**, soit les mockups devant / dos. Si la 3D n'est pas disponible, la 2D reste accessible.

La figurine est un **modèle 3D construit en code** d'après `Mockups/Planche personnage … .png` :
`src/three/figure/figureGeometry.js` (tête, visage, bonnet, bras, mains, ceinture, jean, baskets),
`figureTextures.js` (bonnet moucheté + bisou + « LOVE&FAITH », denim surpiqué, cuir),
`LoveFaithFigure.jsx` (assemblage et matériaux « plastique moulé »). Le corps est construit une seule fois ;
seule la tenue change avec la création : sweat (`src/three/garmentGeometry.js`, coupe `longsleeve` ou `tee`)
et impressions projetées sur le torse (`src/three/PrintDecal.jsx`, proportions des motifs conservées).
Interactions (`src/components/GarmentViewer`) : rotation 360° souris / doigt, zoom molette / pincement
(borné pour ne pas traverser le modèle), bouton « Recentrer », flottement discret au repos.
