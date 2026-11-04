"""
Squelette articulé (rig) de la figurine Love&Faith — à lancer après build_figure.py (il est relançable).

- Armature « LF_Rig » placée sous l'Empty racine : ses os sont exprimés en px de planche, comme la géométrie.
- Pièces rigides (tête, cou, bonnet, visage, ceinture, boucle, passants, baskets) : parentées à un os, sans déformation.
- Maillages fusionnés (Sweat, Jean, Surpiqures, Mains) : modificateur Armature + pondérations calculées depuis la
  géométrie (chaque manche / jambe à son côté, transitions douces aux épaules, coudes, hanches et genoux).
- Pouce (pose « pouce vers l'avant ») : petite pièce cachée dans l'épaisseur de la main droite au repos ; l'os pouce.R
  la fait sortir.

Articulations : racine → bassin → torse → cou → tête ; torse → épaule → bras (coude) → avant-bras (poignet) → main ;
bassin → cuisse (hanche) → tibia (genou) → pied (cheville). Côté gauche du personnage = .L = +X.
"""
import bpy
import bmesh
from mathutils import Vector

V = Vector

# --- os : nom, tête, queue, parent, connecté (px de planche, Z vers le haut, la figurine regarde -Y)
BONES = [
    ('racine', (0, 0, 0), (0, 0, 45), None, False),
    ('bassin', (0, 0, 140), (0, 0, 190), 'racine', False),
    ('torse', (0, 0, 190), (0, 0, 296), 'bassin', True),
    ('cou', (0, 0, 300), (0, 0, 328), 'torse', False),
    ('tete', (0, 0, 328), (0, 0, 455), 'cou', True),
]
ARM_L = [V((60, 15, 280)), V((84, 17, 232)), V((94.5, 17, 186))]  # épaule, coude, poignet
LEG_L = [V((31, 0, 138)), V((40, -1.5, 72)), V((47, -2, 22))]      # hanche, genou, cheville
for s, x in (('L', 1), ('R', -1)):
    m = lambda v: (v[0] * x, v[1], v[2])
    a, l = ARM_L, LEG_L
    stance = (0, -6, 0) if s == 'R' else (0, 0, 0)
    BONES += [
        (f'epaule.{s}', m((8, 14, 290)), m((52, 15, 284)), 'torse', False),
        (f'bras.{s}', m(a[0]), m(a[1]), f'epaule.{s}', False),
        (f'avant_bras.{s}', m(a[1]), m(a[2]), f'bras.{s}', True),
        (f'main.{s}', m(a[2]), m((95, 18, 132)), f'avant_bras.{s}', True),
        (f'cuisse.{s}', m(l[0]), m(l[1]), 'bassin', False),
        (f'tibia.{s}', m(l[1]), tuple(V(m(l[2])) + V(stance)), f'cuisse.{s}', True),
    ]
    foot_y = -7 + (-18 if s == 'R' else 0)  # basket droite avancée (build_figure : SHOE_FWD)
    BONES.append((f'pied.{s}', m((51, foot_y, 22)), m((51, foot_y - 48, 8)), f'tibia.{s}', False))
# pouce : logé au repos dans le bas (plein) de l'anneau en C ; il en sort en pivotant autour de son extrémité extérieure
BONES.append(('pouce.R', (-106, 18, 139.5), (-84, 18, 139.5), 'main.R', False))

COLLECTIONS = {
    'Corps': ['racine', 'bassin', 'torse', 'cou', 'tete'],
    'Bras.L': ['epaule.L', 'bras.L', 'avant_bras.L', 'main.L'],
    'Bras.R': ['epaule.R', 'bras.R', 'avant_bras.R', 'main.R', 'pouce.R'],
    'Jambes': ['cuisse.L', 'tibia.L', 'pied.L', 'cuisse.R', 'tibia.R', 'pied.R'],
}

RIGID = {
    'tete': ['Tete', 'Bonnet', 'Visage_Yeux', 'Visage_Sourcils_Moustache'],
    'cou': ['Cou'],
    'bassin': ['Ceinture', 'Ceinture_Pointe', 'Boucle', 'Passants'],
    'pied.L': ['Basket_G', 'Semelle_G', 'Basket_Renforts_G', 'Perforations_G', 'Lacets_G'],
    'pied.R': ['Basket_D', 'Semelle_D', 'Basket_Renforts_D', 'Perforations_D', 'Lacets_D'],
    'pouce.R': ['Pouce.R'],
}


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def chain_param(p, pts):
    """Abscisse curviligne du point de la chaîne le plus proche de p."""
    best, acc = (1e9, 0.0), 0.0
    for a, b in zip(pts, pts[1:]):
        ab = b - a
        L = ab.length
        t = max(0.0, min(1.0, (p - a).dot(ab) / (L * L)))
        d = (a + ab * t - p).length
        if d < best[0]:
            best = (d, acc + t * L)
        acc += L
    return best[1]


def sweat_weights(p):
    side = 'L' if p.x >= 0 else 'R'
    ax = abs(p.x)
    q = V((ax, p.y, p.z))
    arm = 0.0 if p.z > 300 else smooth(57, 67, ax)
    w = {}
    torso = 1 - arm
    if torso > 0:
        pel = 0.5 * smooth(200, 186, p.z)  # bas du sweat partagé avec le bassin
        w['torse'] = torso * (1 - pel)
        w['bassin'] = torso * pel
    if arm > 0:
        s = chain_param(q, ARM_L)
        se = (ARM_L[1] - ARM_L[0]).length
        fore = smooth(se - 7, se + 7, s)
        sh = 0.5 * smooth(16, 0, s)
        w[f'bras.{side}'] = arm * (1 - fore) * (1 - sh)
        w[f'epaule.{side}'] = arm * (1 - fore) * sh
        w[f'avant_bras.{side}'] = arm * fore
    return w


def jean_weights(p):
    side = 'L' if p.x >= 0 else 'R'
    leg = smooth(150, 122, p.z)
    if p.z > 95:
        leg *= smooth(2, 9, abs(p.x))  # entrejambe : reste au bassin
    shin = smooth(82, 62, p.z)
    return {'bassin': 1 - leg, f'cuisse.{side}': leg * (1 - shin), f'tibia.{side}': leg * shin}


def hand_weights(p):
    return {'main.L' if p.x >= 0 else 'main.R': 1.0}


def unrig(root):
    """Remet la figurine dans l'état de build_figure.py (relance sans doublons)."""
    rig = bpy.data.objects.get('LF_Rig')
    for o in list(bpy.data.objects):
        if o.parent == rig and rig is not None:
            mw = o.matrix_world.copy()
            o.parent = root
            o.parent_type = 'OBJECT'
            o.matrix_world = mw
        for m in list(o.modifiers) if o.type == 'MESH' else []:
            if m.type == 'ARMATURE':
                o.modifiers.remove(m)
        if o.type == 'MESH':
            for vg in list(o.vertex_groups):
                o.vertex_groups.remove(vg)
    for name in ('LF_Rig', 'Pouce.R'):
        o = bpy.data.objects.get(name)
        if o:
            data = o.data
            bpy.data.objects.remove(o)
            if data and data.users == 0:
                (bpy.data.armatures if isinstance(data, bpy.types.Armature) else bpy.data.meshes).remove(data)


def make_thumb(coll, root):
    """Pouce : ellipsoïde logé dans l'épaisseur du bas de la main droite au repos (invisible)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0)
    bmesh.ops.scale(bm, vec=(11.0, 4.4, 4.6), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(-95, 18, 139.5), verts=bm.verts)
    me = bpy.data.meshes.new('Pouce.R')
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.materials.append(bpy.data.materials['Peau'])
    o = bpy.data.objects.new('Pouce.R', me)
    coll.objects.link(o)
    o.parent = root
    return o


def weight(obj, rig, fn):
    vgs = {}
    for v in obj.data.vertices:
        for bone, w in fn(v.co).items():
            if w <= 1e-4:
                continue
            vg = vgs.get(bone) or obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
            vgs[bone] = vg
            vg.add([v.index], w, 'REPLACE')
    mod = obj.modifiers.new('Squelette', 'ARMATURE')
    mod.object = rig
    mod.use_deform_preserve_volume = True
    obj.modifiers.move(len(obj.modifiers) - 1, 0)  # avant la subdivision
    return sorted(vgs)


def build_rig():
    root = bpy.data.objects['LoveFaith_Figure']
    coll = bpy.data.collections['LoveFaith_Figure']
    unrig(root)
    arm = bpy.data.armatures.new('LF_Rig')
    rig = bpy.data.objects.new('LF_Rig', arm)
    coll.objects.link(rig)
    rig.parent = root
    arm.display_type = 'OCTAHEDRAL'
    rig.show_in_front = True
    bpy.context.view_layer.objects.active = rig
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    for name, h, t, parent, conn in BONES:
        b = eb.new(name)
        b.head, b.tail = V(h), V(t)
        b.roll = 0.0
        if parent:
            b.parent = eb[parent]
            b.use_connect = conn
    bpy.ops.object.mode_set(mode='POSE')
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    bpy.ops.object.mode_set(mode='OBJECT')
    for cname, names in COLLECTIONS.items():
        bc = arm.collections.new(cname)
        for n in names:
            bc.assign(arm.bones[n])

    make_thumb(coll, root)
    bpy.context.view_layer.update()
    # pièces rigides : parent = os (position monde conservée)
    for bone, names in RIGID.items():
        for n in names:
            o = bpy.data.objects[n]
            mw = o.matrix_world.copy()
            o.parent = rig
            o.parent_type = 'BONE'
            o.parent_bone = bone
            bpy.context.view_layer.update()
            o.matrix_world = mw
    # maillages déformés
    report = {}
    for n, fn in (('Sweat', sweat_weights), ('Jean', jean_weights), ('Surpiqures', jean_weights), ('Mains', hand_weights)):
        o = bpy.data.objects[n]
        mw = o.matrix_world.copy()
        o.parent = rig
        o.parent_type = 'OBJECT'
        o.matrix_world = mw
        report[n] = weight(o, rig, fn)
    return {'bones': len(arm.bones), 'groups': report}


__result__ = build_rig()
