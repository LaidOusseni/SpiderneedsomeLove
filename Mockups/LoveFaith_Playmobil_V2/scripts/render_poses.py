"""
Rendus Cycles des poses enregistrées (actions de LF_Rig), caméra de présentation à 3/4 léger.
args : {"poses": [...], "out": dossier, "res": [w, h], "samples": n, "az": azimut°, "close": {nom: [x, y, z, dist]}}
Les poses sont appliquées depuis les actions du .blend (preuve qu'elles sont réutilisables), via poses.apply.
"""
import bpy
import math
import os
import runpy
from mathutils import Vector

A = globals().get('args', {}) or {}
HERE = os.path.dirname(bpy.data.filepath)
ns = runpy.run_path(os.path.join(HERE, 'scripts', 'poses.py'), init_globals={'args': {'do': 'none'}})
OUT = A.get('out') or os.path.join(HERE, 'renders', 'poses')
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y = A.get('res', [600, 900])
sc.cycles.samples = A.get('samples', 96)
cam = sc.camera
cam.data.type = 'PERSP'
cam.data.lens = 105
done = []
for L in bpy.data.objects:  # en perspective, le cadre est plus large : les lampes ne doivent pas apparaître
    if L.type == 'LIGHT':
        L.visible_camera = False
# fond mat : en caméra basse, le fond brillant reflète les contre-jours en bande blanche
fond = bpy.data.materials['Fond_Studio'].node_tree.nodes.get('Principled BSDF')
fond.inputs['Roughness'].default_value = 0.85
fond.inputs['Specular IOR Level'].default_value = 0.1
AZ = {'Pose_7_Assis': 35}  # la pose assise se lit de trois quarts (comme sur la planche)
for name in A.get('poses', list(ns['POSES'])):
    ns['apply'](name)
    az = AZ.get(name, A.get('az', 15))
    bpy.data.objects['Studio_Pivot'].rotation_euler = (0, 0, math.radians(az))
    close = (A.get('close') or {}).get(name)
    if close:  # gros plan : cible (m) et distance
        x, y, z, d = close
        a = math.radians(az)
        tgt = Vector((x, y, z))
        cam.location = tgt + Vector((math.sin(a) * d, -math.cos(a) * d, 0.08))
        cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        suffix = '_gros-plan'
    else:
        a = math.radians(az)
        cam.location = Vector((math.sin(a) * 5.8, -math.cos(a) * 5.8, 0.25))
        cam.rotation_euler = (Vector((0, 0, -0.02)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        suffix = ''
    sc.render.filepath = os.path.join(OUT, name + suffix + '.png')
    bpy.ops.render.render(write_still=True)
    done.append(sc.render.filepath)
ns['apply']('Pose_1_Neutre')
__result__ = done
