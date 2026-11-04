# Playmobil Love&Faith — V2 (modélisé dans Blender)

Figurine reconstruite de zéro dans Blender 5.2. Référence principale : `Mockups/Planche reference 3D Love&Faith V3.png` (planche orthographique) ; première planche : `Mockups/Planche personnage Playmobil Love&Faith.png`.
Toute la géométrie est générée par script, ce qui la rend reproductible et modifiable en changeant les valeurs des tables de sections.

| Fichier | Contenu |
|---|---|
| `LoveFaith_Playmobil_V2.blend` | modèle complet et éditable + studio (fond, lumières, caméra) |
| `LoveFaith_Playmobil_V2.glb` | export glTF (12,6 Mo, textures incluses), dans le repère du site — à compresser (meshopt) avant usage web |
| `textures/` | textures graphiques (visage, inscription, ceinture, baskets), bisou d'origine, cuissons bonnet/jean |
| `renders/` | 6 angles (orthographiques), 8 gros plans, `planche-rendu.png`, `comparaison-planche.png`, `superposition-silhouettes.png` |
| `scripts/` | génération complète (voir ci-dessous) |

## Régénérer

```bash
node scripts/make_textures.cjs                       # textures graphiques (SVG → PNG)
# dans Blender ouvert (MCP) ou : D:/blender.exe LoveFaith_Playmobil_V2.blend -P scripts/build_figure.py
#   build_figure.py  → reconstruit la figurine et le studio
#   render_views.py  → rendus Cycles (args : views, res, samples, out)
D:/blender.exe -b LoveFaith_Playmobil_V2.blend -P scripts/export_glb.py      # GLB (cuisson bonnet + jean)
D:/blender.exe -b --factory-startup -P scripts/verify_glb.py -- <glb> <dossier>  # contrôle du GLB réimporté
node scripts/make_sheet.cjs                          # planche de rendu
node scripts/compare.cjs renders comparaison.png     # planche de référence / rendus, vue par vue
```

## Contrôle de fidélité

- `scripts/silhouette.py` + `scripts/overlay.cjs` : silhouettes orthographiques du modèle, à l'échelle exacte de la planche,
  dont le contour (cyan) est superposé aux vues de face, de profil et de dos → `renders/superposition-silhouettes.png`.
- `scripts/render_views.py` avec `"clay": true` : rendu « argile » gris, sans textures, pour juger les volumes.
- `versions/` : itérations précédentes conservées (.blend, .glb, script, planche).
- `node scripts/overlay.cjs <dossier> <sortie> [v3|v1]` : superposition sur la planche V3 (défaut) ou la première planche.

## Construction

- Unité de travail : le pixel de la planche (figurine = 460 px). L'Empty `LoveFaith_Figure` ramène l'ensemble à
  1,05 unité, Y glTF de −0,512 à 0,538, face vers +Z, maillage `Sweat` : c'est le repère attendu par
  `src/three/figure/LoveFaithFigure.jsx`.
- Chaque pièce est un « loft » de sections superellipses (UV propres), puis lissée par subdivision.
  Le jean (bassin + jambes) est fusionné par remaillage voxel, puis lissé.
- Les surpiqûres sont de vrais tirets 3D posés sur le jean par lancer de rayons (poches avant en J, poches arrière, empiècement,
  braguette, coutures latérales et intérieures, ourlets).
- Visage, logo et inscription du bonnet : décalcomanies épousant la surface, avec leurs propres matières.
  Le bisou provient du fichier d'origine `public/brand/beanie-kiss.png`.

## Matières

Peau · Yeux · Sourcils_Moustache · Bonnet (tricot + mouchetures « textile » + bandes, procédural) · Logo_Bonnet ·
Inscription_Bonnet · Sweat · Jean (denim procédural) · Surpiqures · Ceinture · Ceinture_Pointe · Boucle_Doree ·
Baskets · Semelles · Lacets.

## Écarts assumés

- **Pas d'impression sur le sweat** : la planche le montre uni (le petit motif rouge de l'image détourée n'y figure pas).
  Sur le site, les impressions de chaque création sont projetées à la volée sur `Sweat`.
- **Pas de virgule Nike** sur les baskets : seul le style (bout perforé, empiècements, semelle épaisse) est repris.
- **Pose neutre uniquement** : les 7 poses de la planche nécessiteraient un squelette (non fait).
- Dans le GLB, le relief procédural (maille, sergé, grain du sweat) n'est pas exporté : seule la couleur est cuite.
