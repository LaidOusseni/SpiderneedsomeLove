# Rig et poses — Playmobil Love&Faith

Fichier : `LoveFaith_Playmobil_V2_rig.blend` (figurine + armature `LF_Rig` + 7 poses).
Le modèle validé sans rig reste intact : `LoveFaith_Playmobil_V2.blend` (copie aussi dans `versions/V2_valide_avant_rig.blend`).

## Squelette `LF_Rig`

20 os, rangés en 4 collections d'os (Corps, Bras.L, Bras.R, Jambes). `.L` = gauche du personnage.

```
racine ─ bassin ─ torse ─ cou ─ tete
                    ├─ epaule.L ─ bras.L (épaule) ─ avant_bras.L (coude) ─ main.L (poignet)
                    └─ epaule.R ─ bras.R ─ avant_bras.R ─ main.R ─ pouce.R
         bassin ─ cuisse.L (hanche) ─ tibia.L (genou) ─ pied.L (cheville)
                └─ cuisse.R ─ tibia.R ─ pied.R
```

Liaison au personnage :
- **Pièces rigides** (aucune déformation, motifs intacts) : `tete` porte la tête, le bonnet (logo et inscription) et le visage ; `cou` porte le cou ; `bassin` porte la ceinture, la pointe, la boucle et les passants ; `pied.L` / `pied.R` portent chaque basket complète (tige, renforts, semelle, perforations, lacets) ; `pouce.R` porte le pouce.
- **Pièces déformées** (modificateur « Squelette », placé avant la subdivision, avec préservation du volume) : Sweat, Jean, Surpiqures, Mains. Les pondérations sont calculées depuis la géométrie : chaque manche suit son épaule, son bras et son avant-bras (transition douce au coude), chaque jambe suit sa cuisse et son tibia, l'entrejambe et la ceinture du jean restent au bassin, et chaque main reste rigide sur `main.*`.
- **Pouce** (pose 4) : petite pièce cachée dans l'épaisseur de la main droite au repos ; elle n'apparaît que si l'on tourne et fait coulisser `pouce.R`.

La pose neutre du rig reproduit le modèle validé à l'identique : l'écart mesuré par rapport à la position de repos est inférieur à 0,001 mm sur tous les maillages.

## Utiliser le rig dans Blender

1. Sélectionner `LF_Rig` (outliner > LoveFaith_Figure), puis passer en **Pose Mode** (Ctrl+Tab).
2. Tourner un os avec **R** (R puis X, Y ou Z pour un axe). Pour la racine, utiliser aussi **G** (déplacement).
3. **Appliquer une pose enregistrée** : Action Editor (Dope Sheet > Action Editor), sélecteur d'action, puis choisir `Pose_1_Neutre` … `Pose_7_Assis`.
   On peut aussi utiliser l'action `Poses_Planche` : l'image *n* correspond à la pose *n*, avec des marqueurs nommés sur la timeline.
4. **Revenir au neutre** : action `Pose_1_Neutre`, ou en Pose Mode **A** puis **Alt+R / Alt+G**.
5. Le tabouret (collection `Accessoires_Poses`, attaché à la racine) ne sert qu'à la pose assise ; on l'affiche ou le masque dans l'outliner.

Les poses sont des actions marquées « fake user » : elles restent dans le fichier après sa fermeture. J'ai vérifié qu'elles sont toujours présentes et appliquables après réouverture.

## Scripts (`scripts/`)

| Script | Rôle |
|---|---|
| `rig_figure.py` | Crée l'armature, parente les pièces rigides et pondère les maillages. Relançable sans doublons (il défait le rig précédent). À lancer après `build_figure.py`. |
| `poses.py` | Définit les 7 poses. `{"do":"store"}` les (ré)enregistre comme actions, `{"do":"apply","pose":…}` en applique une, `{"do":"preview","out":…}` produit des aperçus rapides. |
| `render_poses.py` | Rendus Cycles des poses à partir des actions enregistrées, avec gros plans optionnels (`close`). |
| `compare_poses.cjs` | Planche de comparaison : la planche de référence en haut, le rig en bas. |

Une pose est une liste d'opérations par os : rotation (`'X'|'Y'|'Z'`, degrés, axes du corps au repos), visée d'une direction du corps (`'aim'`, utile pour les bras), rotation sur l'axe de l'os (`'twist'`) ou coulissement le long de l'os (`'slide'`). Le déplacement de la racine se règle avec `racine_loc`.
Pour créer une 8e pose : ajouter une entrée dans `POSES` (`poses.py`), puis relancer `{"do":"store"}`.

Lancer les rendus Cycles par lots de 3 au maximum : un lot de 6 a déjà fait planter Blender.

## Rendus (`renders/poses/`)

- `planche-poses.png` : les 7 poses, même armature et même éclairage.
- `comparaison-poses.png` : poses de la planche de référence en haut, rig en bas.
- `controle-articulations.png` : gros plans des bras croisés, du pouce et de la pose assise (genoux, chevilles, appui).
- `Pose_*.png` : rendus individuels.
