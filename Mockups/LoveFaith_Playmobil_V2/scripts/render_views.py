"""
Rendus de contrôle Cycles : six angles de la planche + gros plans.
args : {"views": [...], "out": dossier, "res": [w, h], "samples": n}
Azimut mesuré depuis la face (-Y) vers la gauche du personnage (+X).
"""
import bpy
import math
import os
from mathutils import Vector

A = globals().get('args', {}) or {}
OUT = A.get('out') or os.path.join(os.path.dirname(bpy.data.filepath), 'renders')
os.makedirs(OUT, exist_ok=True)

# nom: (azimut°, élévation caméra (m), cible z (m), distance (m), focale[, échelle orthographique])
VIEWS = {
    'face': (0, 0.33, 0.02, 6.0, 105, 1.22),
    'trois-quarts-avant': (35, 0.33, 0.02, 6.0, 105, 1.22),
    'profil-gauche': (90, 0.33, 0.02, 6.0, 105, 1.22),
    'dos': (180, 0.33, 0.02, 6.0, 105, 1.22),
    'profil-droit': (270, 0.33, 0.02, 6.0, 105, 1.22),
    'trois-quarts-arriere': (145, 0.33, 0.02, 6.0, 105, 1.22),
    'gros-plan-visage': (0, 0.38, 0.35, 2.2, 105),
    'gros-plan-bonnet-avant': (20, 0.62, 0.43, 2.2, 105),
    'gros-plan-bonnet-arriere': (180, 0.62, 0.42, 2.2, 105),
    'gros-plan-ceinture': (8, -0.05, -0.12, 1.9, 105),
    'gros-plan-baskets': (40, -0.36, -0.47, 1.6, 105),
    'gros-plan-baskets-profil': (90, -0.35, -0.46, 1.7, 105),
    'gros-plan-jean-dos': (165, -0.1, -0.2, 2.6, 105),
    'gros-plan-sweat': (20, 0.2, 0.1, 2.6, 105),
    'gros-plan-main': (0, -0.05, -0.16, 1.4, 105),
}
# décalage latéral du cadrage (m), pour les gros plans hors de l'axe
OFFSET_X = {'gros-plan-main': 0.217}

sc = bpy.context.scene
cam = sc.camera
sc.render.resolution_x, sc.render.resolution_y = A.get('res', [600, 900])
sc.cycles.samples = A.get('samples', 96)
done = []
# rendu « argile » : une seule matière grise, pour juger les volumes sans textures
clay = None
if A.get('clay'):
    clay = bpy.data.materials.get('_Argile') or bpy.data.materials.new('_Argile')
    clay.use_nodes = True
    bs = clay.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (0.16, 0.16, 0.16, 1)
    bs.inputs['Roughness'].default_value = 0.55
    bpy.context.view_layer.material_override = clay
    decals = [o for o in bpy.data.objects if o.name.startswith(('Visage_', 'Bonnet_Logo', 'Bonnet_Inscription', 'Perforations'))]
    for o in decals:
        o.hide_render = True
for name in A.get('views', list(VIEWS)):
    az, cz, tz, dist, lens, *ortho = VIEWS[name]
    # vues générales orthographiques, comme la planche V3 ; gros plans en perspective (longue focale)
    cam.data.type = 'ORTHO' if ortho else 'PERSP'
    if ortho:
        cam.data.ortho_scale = ortho[0]
    # le studio tourne avec la caméra : fond et lumières restent placés de la même façon pour chaque vue
    bpy.data.objects['Studio_Pivot'].rotation_euler = (0, 0, math.radians(az))
    tx = OFFSET_X.get(name, 0.0)
    cam.location = Vector((tx, -dist, cz))
    cam.rotation_euler = (Vector((tx, 0, tz)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    sc.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    done.append(sc.render.filepath)
bpy.context.view_layer.material_override = None
for o in (decals if clay else []):
    o.hide_render = False
__result__ = done
