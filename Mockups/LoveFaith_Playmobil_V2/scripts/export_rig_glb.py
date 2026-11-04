"""
Export GLB animé de la figurine riggée (à lancer en arrière-plan sur LoveFaith_Playmobil_V2_rig.blend, qui n'est
pas modifié) :
  D:/blender.exe -b LoveFaith_Playmobil_V2_rig.blend -P scripts/export_rig_glb.py -- <sortie.glb>

- Armature LF_Rig + maillages skinnés (Sweat, Jean, Surpiqures, Mains) + pièces rigides attachées aux os ;
- les 7 poses deviennent 7 clips glTF (« Pose_1_Neutre » … « Pose_7_Assis ») ; chaque clip contient toutes les
  rotations/positions des os (pose complète, aucun os ne garde la pose précédente) sur 2 clés identiques ;
- tabouret de la pose assise exporté (nœud « Tabouret », attaché à l'os racine), affiché par le site seulement
  pour cette pose ;
- poids web : sweat et jean décimés (pondérations conservées), couleurs procédurales (bonnet, jean) cuites,
  subdivision au niveau 1.
"""
import bpy
import os
import sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
DIR = os.path.dirname(bpy.data.filepath)
OUT = argv[0] if argv else os.path.join(DIR, 'LoveFaith_Playmobil_V2_rig.glb')
TEX = os.path.join(DIR, 'textures')
SIZE = 1024
POSES = ['Pose_1_Neutre', 'Pose_2_Bras_croises', 'Pose_3_Main_dans_la_poche', 'Pose_4_Pouce_vers_l_avant',
         'Pose_5_Regard_de_cote', 'Pose_6_Ajuste_le_bonnet', 'Pose_7_Assis']

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 4
rig = bpy.data.objects['LF_Rig']
figure = bpy.data.collections['LoveFaith_Figure']
seat = bpy.data.objects['Tabouret']


def select_only(objs, active):
    for o in sc.objects:
        o.select_set(False)
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def apply_first(obj, kind, **props):
    """Ajoute un modificateur en tête de pile et l'applique (avant le squelette : les pondérations suivent)."""
    m = obj.modifiers.new('_tmp', kind)
    for k, v in props.items():
        setattr(m, k, v)
    obj.modifiers.move(len(obj.modifiers) - 1, 0)
    select_only([obj], obj)
    bpy.ops.object.modifier_apply(modifier=m.name)


def bake_color(obj, name):
    mat = obj.data.materials[0]
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    src = bsdf.inputs['Base Color'].links[0].from_socket
    emit = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(src, emit.inputs['Color'])
    nt.links.new(emit.outputs[0], out.inputs['Surface'])
    img = bpy.data.images.new(name, SIZE, SIZE)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    select_only([obj], obj)
    bpy.ops.object.bake(type='EMIT', margin=8)
    img.filepath_raw = os.path.join(TEX, name + '.jpg')
    img.file_format = 'JPEG'
    img.save()
    nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    nt.nodes.remove(emit)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    for n in list(nt.nodes):
        if n.type == 'BUMP':
            nt.nodes.remove(n)


# --- pose de repos pendant la préparation (sinon la cuisson se fait sur le personnage posé)
rig.animation_data.action = None
for pb in rig.pose.bones:
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.location = (0, 0, 0)
bpy.context.view_layer.update()

# --- allègement (pondérations conservées par la décimation)
apply_first(bpy.data.objects['Sweat'], 'DECIMATE', ratio=0.14)
apply_first(bpy.data.objects['Jean'], 'DECIMATE', ratio=0.14)

# --- jean : UV automatiques + couleur cuite ; passants : même matière cuite
jean = bpy.data.objects['Jean']
while jean.data.uv_layers:
    jean.data.uv_layers.remove(jean.data.uv_layers[0])
jean.data.uv_layers.new(name='UVMap')
select_only([jean], jean)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
bake_color(jean, 'jean_basecolor')
passants = bpy.data.objects['Passants']
dark = bpy.data.materials.new('Passants')
dark.use_nodes = True
p = dark.node_tree.nodes['Principled BSDF']
p.inputs['Base Color'].default_value = (0.02, 0.02, 0.022, 1)
p.inputs['Roughness'].default_value = 0.75
passants.data.materials[0] = dark

bake_color(bpy.data.objects['Bonnet'], 'bonnet_basecolor')
for n in list(bpy.data.materials['Sweat'].node_tree.nodes):
    if n.type == 'BUMP':
        bpy.data.materials['Sweat'].node_tree.nodes.remove(n)

# le « sheen » partiel de Blender (poids 0,05–0,08) est exporté en sheen blanc à 100 % : jean et bonnet délavés
for mat in bpy.data.materials:
    if mat.node_tree:
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                n.inputs['Sheen Weight'].default_value = 0.0

for o in figure.objects:
    for m in o.modifiers:
        if m.type == 'SUBSURF':
            m.levels = 1

# --- clips : 2 clés identiques par pose (durée non nulle), toutes les voies des os
rig.animation_data_create()
for name in POSES:
    act = bpy.data.actions[name]
    rig.animation_data.action = act
    sc.frame_set(1)
    for pb in rig.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=1)
        pb.keyframe_insert('location', frame=1)
        pb.keyframe_insert('rotation_quaternion', frame=2)
        pb.keyframe_insert('location', frame=2)
combo = bpy.data.actions.get('Poses_Planche')
if combo:
    bpy.data.actions.remove(combo)
rig.animation_data.action = bpy.data.actions['Pose_1_Neutre']
sc.frame_set(1)

seat.hide_render = False
seat.hide_viewport = False
objs = list(figure.objects) + [seat]
select_only(objs, bpy.data.objects['LoveFaith_Figure'])
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
    export_image_format='AUTO', export_skins=True, export_animations=True, export_animation_mode='ACTIONS',
    export_force_sampling=True, export_optimize_animation_size=False, export_frame_range=False,
    export_anim_single_armature=True, export_reset_pose_bones=True, export_def_bones=False,
)
print('EXPORT_OK', OUT, round(os.path.getsize(OUT) / 1e6, 2), 'Mo')
