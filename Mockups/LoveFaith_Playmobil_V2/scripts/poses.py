"""
Les 7 poses de la planche, pilotées par l'armature LF_Rig (lancer après rig_figure.py).

Chaque pose est une liste d'opérations par os : rotations autour des axes X/Y/Z du repère de la figurine au repos
(X = gauche du personnage, -Y = devant, Z = haut), composées le long de la chaîne (cinématique directe), ou visée
(« aim ») d'une direction du corps pour les bras. La racine peut aussi être déplacée (« racine_loc », en px). Les poses sont enregistrées comme actions Blender
(« Pose_1_Neutre » … « Pose_7_Assis », utilisateur factice : elles restent dans le .blend), et regroupées dans
l'action « Poses_Planche » (une pose par image, marqueurs nommés).

args :
  {"do": "store"}                         → (ré)écrit les 8 actions
  {"do": "apply", "pose": "Pose_7_Assis"} → applique une pose (tabouret affiché seulement pour la pose assise)
  {"do": "preview", "out": dossier}       → aperçu Workbench rapide de toutes les poses (réglage)
"""
import bpy
import math
import os
from mathutils import Matrix, Vector, Quaternion

A = globals().get('args', {}) or {}

POSES = {
    'Pose_1_Neutre': {},
    'Pose_2_Bras_croises': {
        'racine': [('Z', 12)],
        'bras.L': [('aim', (0.2, -0.8, -0.57))],
        'avant_bras.L': [('aim', (-0.85, -0.5, 0.12))],
        'bras.R': [('aim', (-0.2, -0.82, -0.6))],
        'avant_bras.R': [('aim', (0.85, -0.52, 0.02))],
    },
    'Pose_3_Main_dans_la_poche': {
        'racine': [('Z', 25)],
        'tete': [('Z', -10)],
        'bras.R': [('aim', (0.1, -0.46, -0.88))],
        'avant_bras.R': [('aim', (0.12, -0.42, -0.9))],
        'main.R': [('aim', (0.12, -0.3, -0.95))],
        'bras.L': [('X', -6)],
    },
    'Pose_4_Pouce_vers_l_avant': {
        'racine': [('Z', 10)],
        'bras.R': [('aim', (-0.15, -0.6, -0.78))],
        'avant_bras.R': [('aim', (0.1, -0.55, 0.83))],
        # poing présenté de face (anneau en C visible), pouce sur le bord extérieur, incliné vers l'extérieur
        'pouce.R': [('aim', (-0.25, -0.35, 0.9)), ('slide', 7)],
    },
    'Pose_5_Regard_de_cote': {
        'racine': [('Z', -18)],
        'cou': [('Z', 15)],
        'tete': [('Z', 62)],
        'bras.L': [('X', 6)],
        'bras.R': [('X', -8)],
    },
    'Pose_6_Ajuste_le_bonnet': {
        'racine': [('Z', -12)],
        'tete': [('Z', -10), ('Y', -6)],
        'bras.L': [('Y', -105), ('X', -20)],
        'avant_bras.L': [('Y', -95)],
    },
    'Pose_7_Assis': {
        'racine': [('Z', 25)],
        'racine_loc': (0, 0, -68),
        'torse': [('X', 12)],
        'cuisse.L': [('X', -88), ('Y', -6)],
        'tibia.L': [('X', 88)],
        'cuisse.R': [('X', -88), ('Y', 6)],
        'tibia.R': [('X', 88)],
        'bras.L': [('aim', (-0.12, -0.62, -0.78))],
        'avant_bras.L': [('aim', (-0.08, -0.5, -0.86))],
        'bras.R': [('aim', (0.12, -0.62, -0.78))],
        'avant_bras.R': [('aim', (0.08, -0.5, -0.86))],
    },
}
AXES = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}
SEAT = 'Tabouret'


def rig():
    return bpy.data.objects['LF_Rig']


def reset(r):
    for pb in r.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def set_pose(r, spec):
    """Applique une pose. Opérations par os, dans l'ordre (parents avant enfants) :
    (« X »|« Y »|« Z », degrés) : rotation autour d'un axe du repère de repos, composée le long de la chaîne ;
    (« aim », (x, y, z))       : oriente l'os vers cette direction du corps (repère de la figurine, après la
                                  rotation de la racine), quel que soit l'état des os parents ;
    (« twist », degrés)        : tourne l'os autour de son propre axe (orientation d'une main) ;
    (« slide », px)            : déplace l'os le long de son axe (sortie du pouce)."""
    reset(r)
    for bone, ops in spec.items():
        if bone == 'racine_loc':
            pb = r.pose.bones['racine']
            B = pb.bone.matrix_local.to_3x3()
            pb.location = B.inverted() @ Vector(ops)
            bpy.context.view_layer.update()
            continue
        pb = r.pose.bones[bone]
        B = pb.bone.matrix_local.to_3x3()
        for axis, val in ops:
            if axis == 'slide':  # translation le long de l'os (fait sortir le pouce de la main)
                d = (pb.tail - pb.head).normalized()
                pb.matrix = Matrix.Translation(d * val) @ pb.matrix
            elif axis == 'twist':  # rotation autour de l'axe de l'os lui-même (orienter une main)
                d = (pb.tail - pb.head).normalized()
                Q = Matrix.Rotation(math.radians(val), 4, d)
                h = pb.head.copy()
                pb.matrix = Matrix.Translation(h) @ Q @ Matrix.Translation(-h) @ pb.matrix
            elif axis == 'aim':
                rt = r.pose.bones['racine']
                yaw = rt.matrix.to_3x3() @ rt.bone.matrix_local.to_3x3().inverted()
                target = (yaw @ Vector(val)).normalized()
                cur = (pb.tail - pb.head).normalized()
                Q = cur.rotation_difference(target).to_matrix().to_4x4()
                h = pb.head.copy()
                pb.matrix = Matrix.Translation(h) @ Q @ Matrix.Translation(-h) @ pb.matrix
            else:
                R = Matrix.Rotation(math.radians(val), 3, AXES[axis])
                pb.rotation_quaternion = (B.inverted() @ R @ B).to_quaternion() @ pb.rotation_quaternion
            bpy.context.view_layer.update()


def ensure_seat():
    """Tabouret de la pose assise (accessoire hors figurine), suit la racine du rig."""
    seat = bpy.data.objects.get(SEAT)
    if seat:
        return seat
    coll = bpy.data.collections.get('Accessoires_Poses') or bpy.data.collections.new('Accessoires_Poses')
    if coll.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(coll)
    me = bpy.data.meshes.new(SEAT)
    import bmesh
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    # au repos de la racine ; abaissé de 68 px avec elle dans la pose assise → posé au sol, dessus à 42 px
    bmesh.ops.scale(bm, vec=(124, 80, 42), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 25, 68 + 21), verts=bm.verts)
    bevel = bmesh.ops.bevel(bm, geom=bm.edges[:], offset=2.5, segments=3, affect='EDGES')
    bm.to_mesh(me)
    bm.free()
    mat = bpy.data.materials.get('Tabouret') or bpy.data.materials.new('Tabouret')
    mat.use_nodes = True
    bs = mat.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (0.015, 0.012, 0.012, 1)
    bs.inputs['Roughness'].default_value = 0.35
    me.materials.append(mat)
    seat = bpy.data.objects.new(SEAT, me)
    coll.objects.link(seat)
    r = rig()
    seat.parent = r
    seat.parent_type = 'BONE'
    seat.parent_bone = 'racine'
    reset(r)
    bpy.context.view_layer.update()
    seat.matrix_world = r.matrix_world @ Matrix.Identity(4)
    return seat


def show_seat(on):
    seat = ensure_seat()
    seat.hide_render = not on
    seat.hide_viewport = not on


def store():
    r = rig()
    ensure_seat()
    r.animation_data_create()
    names = list(POSES)
    for name in names:
        act = bpy.data.actions.get(name)
        if act:
            bpy.data.actions.remove(act)
    combo = bpy.data.actions.get('Poses_Planche')
    if combo:
        bpy.data.actions.remove(combo)
    sc = bpy.context.scene
    for m in [m for m in sc.timeline_markers if m.name.startswith('Pose_')]:
        sc.timeline_markers.remove(m)

    def key_all(frame):
        for pb in r.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=frame)
            pb.keyframe_insert('location', frame=frame)

    for name in names:  # une action par pose
        r.animation_data.action = bpy.data.actions.new(name)
        set_pose(r, POSES[name])
        key_all(1)
        r.animation_data.action.use_fake_user = True
    combo = bpy.data.actions.new('Poses_Planche')  # toutes les poses : image i = pose i
    r.animation_data.action = combo
    for i, name in enumerate(names, start=1):
        set_pose(r, POSES[name])
        key_all(i)
        sc.timeline_markers.new(name, frame=i)
    for fc in getattr(combo, 'fcurves', []):
        for kp in fc.keyframe_points:
            kp.interpolation = 'CONSTANT'
    combo.use_fake_user = True
    apply('Pose_1_Neutre')
    return names


def apply(name):
    r = rig()
    r.animation_data_create()
    r.animation_data.action = bpy.data.actions[name]
    bpy.context.scene.frame_set(1)
    show_seat(name == 'Pose_7_Assis')
    bpy.context.view_layer.update()
    return name


def preview(out):
    """Aperçu rapide (Workbench, couleurs des matières) de chaque pose, caméra de présentation."""
    os.makedirs(out, exist_ok=True)
    sc = bpy.context.scene
    state = (sc.render.engine, sc.render.resolution_x, sc.render.resolution_y)
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x, sc.render.resolution_y = 360, 540
    cam = sc.camera
    cam.data.type = 'PERSP'
    cam.data.lens = 105
    bpy.data.objects['Studio_Pivot'].rotation_euler = (0, 0, math.radians(A.get('az', 0)))
    cam.location = Vector((0, -5.6, 0.2))
    cam.rotation_euler = (Vector((0, 0, -0.02)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    files = []
    r = rig()
    ensure_seat()  # créé avant de poser (sa création remet le rig au repos)
    r.animation_data_create()
    for name in A.get('poses', list(POSES)):
        r.animation_data.action = None
        set_pose(r, POSES[name])
        show_seat(name == 'Pose_7_Assis')
        sc.render.filepath = os.path.join(out, name + '.png')
        bpy.ops.render.render(write_still=True)
        files.append(sc.render.filepath)
    sc.render.engine, sc.render.resolution_x, sc.render.resolution_y = state
    show_seat(False)
    reset(r)
    return files


do = A.get('do', 'store')
if do == 'store':
    __result__ = store()
elif do == 'apply':
    __result__ = apply(A['pose'])
elif do == 'preview':
    __result__ = preview(A['out'])
