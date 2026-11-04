"""Silhouettes orthographiques de la figurine (blanc sur fond transparent) pour la superposition avec la planche.
args : {"out": dossier, "views": {"nom": azimut°}} — 1 px = 1 px de planche (figurine de 460 px)."""
import bpy
import math
import os
from mathutils import Vector

A = globals().get('args', {}) or {}
OUT = A['out']
os.makedirs(OUT, exist_ok=True)
VIEWS = A.get('views', {'face': 0, 'profil-gauche': 90, 'dos': 180, 'trois-quarts-avant': 35})
sc = bpy.context.scene
S = 1.05 / 460
W, H = 300, 520  # px de planche
state = (sc.render.engine, sc.render.resolution_x, sc.render.resolution_y, sc.render.film_transparent, sc.camera)

mat = bpy.data.materials.get('_Silhouette') or bpy.data.materials.new('_Silhouette')
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
em = nt.nodes.new('ShaderNodeEmission')
em.inputs['Color'].default_value = (1, 1, 1, 1)
out = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(em.outputs[0], out.inputs['Surface'])
vl = bpy.context.view_layer
vl.material_override = mat
studio = bpy.data.collections['Studio']
studio.hide_render = True

cam = bpy.data.objects.get('_CamSil') or bpy.data.objects.new('_CamSil', bpy.data.cameras.new('_CamSil'))
if cam.name not in sc.collection.objects:
    sc.collection.objects.link(cam)
cam.data.type = 'ORTHO'
cam.data.ortho_scale = H * S
cam.data.sensor_fit = 'VERTICAL'
sc.camera = cam
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'
sc.display.shading.color_type = 'SINGLE'
sc.display.shading.single_color = (1, 1, 1)
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = W * 2, H * 2
zc = -0.512 + (H / 2 - 30) * S  # sol à 30 px du bas
done = []
try:
    for name, az in VIEWS.items():
        a = math.radians(az)
        cam.location = Vector((math.sin(a) * 6, -math.cos(a) * 6, zc))
        cam.rotation_euler = (Vector((0, 0, zc)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(OUT, f'sil-{name}.png')
        bpy.ops.render.render(write_still=True)
        done.append(sc.render.filepath)
finally:
    vl.material_override = None
    studio.hide_render = False
    sc.render.engine, sc.render.resolution_x, sc.render.resolution_y, sc.render.film_transparent, sc.camera = state
__result__ = done
