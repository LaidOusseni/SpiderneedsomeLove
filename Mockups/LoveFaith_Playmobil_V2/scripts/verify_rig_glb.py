"""Contrôle du GLB animé : réimport dans une scène vide, présence des 7 actions, effet de chacune sur le squelette.
D:/blender.exe -b --factory-startup -P verify_rig_glb.py -- <fichier.glb>"""
import bpy
import sys

glb = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
acts = sorted(a.name for a in bpy.data.actions if a.name.startswith('Pose_'))
print('ACTIONS', len(acts), acts)
arm.animation_data_create()
for name in acts:
    arm.animation_data.action = bpy.data.actions[name]
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    hand = arm.matrix_world @ arm.pose.bones['main.R'].tail
    hips = arm.matrix_world @ arm.pose.bones['bassin'].head
    head = arm.matrix_world @ arm.pose.bones['tete'].tail
    print('POSE', name, 'main.R', [round(v, 3) for v in hand], 'bassin', [round(v, 3) for v in hips],
          'tete', [round(v, 3) for v in head])
