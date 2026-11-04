"""Contrôle du GLB exporté : réimport dans une scène vide, mesure de l'encombrement, rendu face + dos.
blender -b --factory-startup -P verify_glb.py -- <fichier.glb> <dossier de sortie>"""
import bpy
import sys
import math
from mathutils import Vector

glb, out = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
pts = [o.matrix_world @ Vector(c) for o in bpy.context.scene.objects if o.type == 'MESH' for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
print('BOUNDS', [round(v, 3) for v in lo], [round(v, 3) for v in hi])
print('SWEAT', 'Sweat' in bpy.data.objects)

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.samples = 24
sc.cycles.use_denoising = True
sc.render.resolution_x, sc.render.resolution_y = 500, 750
w = bpy.data.worlds.new('W')
w.use_nodes = True
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.35, 0.33, 0.33, 1)
sc.world = w
for loc, power in (((-2, -3, 2), 300), ((2, 2, 1.5), 200)):
    L = bpy.data.lights.new('L', 'AREA')
    L.energy, L.size = power, 2
    o = bpy.data.objects.new('L', L)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (-Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
cam = bpy.data.objects.new('C', bpy.data.cameras.new('C'))
cam.data.lens, cam.data.sensor_fit, cam.data.sensor_height = 105, 'VERTICAL', 24
sc.collection.objects.link(cam)
sc.camera = cam
for name, az in (('glb-face', 0), ('glb-dos', 180)):
    a = math.radians(az)
    cam.location = (math.sin(a) * 5.6, -math.cos(a) * 5.6, 0.2)
    cam.rotation_euler = (Vector((0, 0, 0.02)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}/{name}.png'
    bpy.ops.render.render(write_still=True)
