# Figurine Love&Faith (modèle 3D du site)

## Modèle actuel du site : figurine V2 articulée (7 poses)

Depuis le 2026-10-30, `public/models/lovefaith-figure.glb` est la figurine V2 riggée
(`Mockups/LoveFaith_Playmobil_V2/LoveFaith_Playmobil_V2_rig.blend` : armature `LF_Rig`, 7 clips de pose).
L'ancien modèle statique est sauvegardé dans `Mockups/backup-site-models/`.

```bash
# 1. export Blender (armature, skins, 7 clips, tabouret de la pose assise ; le .blend n'est pas modifié)
cd Mockups/LoveFaith_Playmobil_V2
D:/blender.exe -b LoveFaith_Playmobil_V2_rig.blend -P scripts/export_rig_glb.py -- "$PWD/LoveFaith_Playmobil_V2_rig.glb"
D:/blender.exe -b --factory-startup -P scripts/verify_rig_glb.py -- "$PWD/LoveFaith_Playmobil_V2_rig.glb"  # contrôle
# 2. compression meshopt → public/models/lovefaith-figure.glb
npm run figurine:rig
# 3. tests navigateur (après npm run build && npx vite preview --port 4173)
npm run check:poses
```

Côté site : `src/three/figure/poses.js` (pose ↔ clip), `src/three/figure/LoveFaithFigure.jsx` (lecture des clips,
transition, tabouret, impressions attachées à l'os du torse), `src/components/PoseSelector/` (icônes),
`src/components/GarmentViewer/` (état de la pose, caméra). La figurine démarre en pose neutre et ne change de pose
que sur clic ; la caméra est indépendante (rotation automatique supprimée).

## Ancien pipeline (modèle statique, conservé)

Transforme `Mockups/Personnage 3D.glb` (maillage brut, sans matériau) en figurine Playmobil texturée :

- `public/models/lovefaith-figure.glb` — modèle chargé par la vue 3D du site (`src/three/figure/LoveFaithFigure.jsx`) ;
- `Mockups/LoveFaith_Playmobil_Textured.glb` — même fichier, livrable ;
- `Mockups/LoveFaith_Playmobil_Textures/` — textures cuites (JPEG) ;
- `Mockups/LoveFaith_Playmobil_Apercus/` — rendus Cycles aux angles de la planche (`blender-vues-planche.png`)
  et aperçus Three.js du GLB **réimporté** (`vues-face-34-profil-dos.png`, `gros-plans.png`).

```bash
npm run figurine                    # = node scripts/figurine/run.cjs --preview (rendus Cycles : quelques minutes)
node scripts/figurine/run.cjs       # sans rendus ni aperçus
```

Prérequis : Google Chrome (`CHROME_PATH`) et Blender 4.2 ou plus récent (`BLENDER_PATH`, par défaut `D:/blender.exe`
s'il existe, sinon `blender`). Aucun serveur n'est ouvert.

| Fichier | Rôle |
|---|---|
| `classify.js` | Règles de découpage du maillage en parties (positions relevées sur des rendus gradués) |
| `build.js` | Étape 1 (Chrome) : corrections de forme, découpage, allègement, UV, cuisson des textures |
| `blender_finish.py` | Étape 2 (Blender) : mains, manchettes, boucle, passants, matériaux, export, rendus Cycles |
| `compress.mjs` | Étape 3 : compression `EXT_meshopt_compression` pour le web (sans quantification) |
| `run.cjs` | Enchaîne les étapes, écrit les fichiers et produit les aperçus |

## Étape 1 — `build.js`

1. Suppression des débris (7 petits morceaux détachés).
2. Corrections de forme locales :
   - le visage est lissé (lèvres sculptées supprimées), car il est imprimé ;
   - l'ovale sculpté du bonnet, en miroir de la planche, est aplani ;
   - les franges sculptées du bas du sweat et des manches sont lissées.
3. Classement des sommets (`classify.js`). Les triangles à cheval sur deux parties sont coupés sur la limite exacte.
4. Allègement de chaque partie (meshoptimizer, bords verrouillés) : 430 000 → environ 100 000 triangles.
5. UV et **cuisson** : chaque texel reçoit la couleur calculée à partir de sa position 3D.
   - Visage imprimé.
   - Bonnet : tricot moucheté, bande blanche, bisou d'origine (`public/brand/beanie-kiss.png`) et « LOVE&FAITH » vertical au dos.
   - Jean noir délavé : surpiqûres, poches arrière, braguette, poches avant, ourlet.
   - Ceinture en cuir.
   - Baskets : bout rapporté perforé, pare-boue, contrefort, laçage. Semelles surpiquées.

## Étape 2 — `blender_finish.py`

- **Mains Playmobil en « C »** : anneau épais ouvert vers le corps, extrémités arrondies. Elles remplacent les boules percées du modèle d'origine.
- **Manchettes** : le bout de manche sculpté (feuille ouverte et déchiquetée) est coupé et remplacé par une manchette ovale, mesurée sur la manche.
  - Elle est fondue dans le maillage « Sweat » et prend donc la couleur de chaque création.
- **Boucle dorée** (cadre, barre, ardillon) et **passants**, posés sur la ceinture par lancer de rayons.
- Matériaux PBR réglés partie par partie : plastique satiné, « coat » exporté en `KHR_materials_clearcoat`.
- Export GLB avec textures JPEG. Avec `--preview`, rendus Cycles des 6 angles de la planche.

Étapes ajoutées pour la version finale (`LoveFaith_Playmobil_Final.glb`) :
- **playmobil** : col rond côtelé (fondu dans le sweat), semelles épaissies (× 1,45), sweat lissé pour l'aspect plastique moulé (les raccords restent fixes).
- **proportions** (mesures prises sur la planche, rapportées à la largeur du torse) :
  - jambes du jean élargies (× 1,25) et droites dès la cuisse ;
  - baskets agrandies (× 1,3) ;
  - tête et bonnet agrandis depuis la base du cou (× 1,12).

## Travail dans Blender ouvert, via MCP

Serveur : https://github.com/djeada/blender-mcp-server, installé sur `D:\dev-cache\blender-mcp-server`. Sous Windows :
- l'environnement virtuel est créé avec le Python 64 bits de Blender, `cryptography` n'ayant pas de paquet pour le Python 32 bits du système ;
- l'extension « Blender MCP Bridge » est installée avec `blender -c extension install-file -r user_default -e`.

Le serveur est enregistré dans Claude Code pour ce projet sous le nom `blender` (portée locale).

1. Ouvrir Blender : l'extension écoute sur `127.0.0.1:9876`.
2. Lancer :

   ```bash
   D:\dev-cache\blender-mcp-server\.venv\Scripts\python.exe scripts/figurine/mcp_session.py <texture.glb> D:\dev-cache\figurine-final
   ```

   `mcp_session.py` appelle les outils MCP : `blender_python_exec` pour les étapes de `blender_finish.py`, `blender_render_still` pour les 6 rendus de contrôle, plus le contrôle de la scène, la sauvegarde du `.blend`, l'export et la vérification par réimport.
3. Compresser l'export avec `compress.mjs` vers `Mockups/LoveFaith_Playmobil_Final.glb` et `public/models/lovefaith-figure.glb`.

Fichiers de travail (disque D:) : `D:\dev-cache\figurine-final\` contient `LoveFaith_Playmobil_Final.blend` (scène éditable, modificateurs non appliqués), l'export brut et `rendus/`. La sauvegarde des versions précédentes est dans `D:\dev-cache\figurine-sauvegarde-2026-10-30\`.

## Réglages utiles

- Visage, bisou, bande : objets `SH`, `KISS`, `BAND` dans `build.js`.
- Poches, braguette, baskets : `BACK_POCKETS`, `FLY`, `FEET` dans `build.js`.
- Mains, manchettes, matériaux : `HANDS`, `R_MAJOR`…, `CUFF_TOP`, `TUNING` dans `blender_finish.py`.
- Zone d'impression des motifs sur le torse : `PRINT_AREA` dans `src/three/figure/LoveFaithFigure.jsx`.
