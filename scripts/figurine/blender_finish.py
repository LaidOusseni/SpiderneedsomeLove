"""
blender_finish.py — Finition de la figurine Love&Faith dans Blender (géométrie, matériaux, rendus, export).

Deux façons de l'exécuter :

  1. Dans un Blender ouvert, via le serveur MCP Blender (outil `blender_python_exec`) :
     args = {"step": "<étape>", ...} — c'est ce que fait scripts/figurine/mcp_session.py.
  2. En ligne de commande (sans interface) — utilisé par run.cjs :
     blender -b --factory-startup --python blender_finish.py -- <entrée.glb> <sortie.glb> [<dossier rendus>]

Étapes :
  load      vide la scène et importe le GLB texturé produit par build.js            (args: src)
  finish    mains en « C », manchettes, boucle dorée, passants, matériaux
  playmobil col rond côtelé, semelles épaisses, sweat lissé (plastique moulé)
  proportions jambes de jean élargies, baskets agrandies, tête et bonnet agrandis (mesures de la planche)
  studio    éclairage studio, fond, caméra ; place la caméra sur une vue de la planche  (args: view)
  bake      applique les modificateurs (arrondis) avant export
  export    export GLB (textures JPEG)                                              (args: out)
  verify    réimporte un GLB et décrit son contenu                                  (args: src)

Repères : coordonnées glTF (x, y vers le haut, z vers l'avant), converties en coordonnées Blender par B().
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


def B(x, y, z):
    """glTF (y en haut, z vers l'avant) → Blender (z en haut, -y vers l'avant)."""
    return Vector((x, -z, y))


def srgb(hexa):
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)


SKIN = '#7a431f'
OBJ = bpy.data.objects
REPORT = {}


def principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def new_material(name, color, rough, coat=0.0, coat_rough=0.2, metal=0.0):
    if name in bpy.data.materials:  # matériau d'origine du même nom (ex. « Mains ») : il garde un autre nom
        bpy.data.materials[name].name = f'{name}_origine'
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = principled(m)
    p.inputs['Base Color'].default_value = srgb(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    p.inputs['Coat Weight'].default_value = coat
    p.inputs['Coat Roughness'].default_value = coat_rough
    return m


def new_object(name, bm, mat, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    me.materials.append(mat)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.parent = OBJ['LoveFaith_Playmobil']
    return o


def append_to(obj, bm_part):
    """Fusionne une géométrie (coordonnées monde) dans un objet existant."""
    bmesh.ops.transform(bm_part, matrix=obj.matrix_world.inverted(), verts=bm_part.verts)
    tmp = bpy.data.meshes.new('tmp')
    bm_part.to_mesh(tmp)
    bm_part.free()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.from_mesh(tmp)
    bm.to_mesh(obj.data)
    bm.free()
    bpy.data.meshes.remove(tmp)
    for p in obj.data.polygons:
        p.use_smooth = True


def world_bvh(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    t = BVHTree.FromBMesh(bm)
    bm.free()
    return t


def bevel(o, width, segments=3):
    mod = o.modifiers.new('arrondi', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'


# ─── load ──────────────────────────────────────────────────────────────────
def step_load(src):
    # scène vidée sans recharger les préférences (le pont MCP reste actif)
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights,
                 bpy.data.cameras, bpy.data.worlds):
        for item in list(coll):
            coll.remove(item)
    bpy.ops.import_scene.gltf(filepath=src)
    REPORT['objets'] = sorted(o.name for o in OBJ if o.type == 'MESH')
    REPORT['triangles'] = sum(len(o.data.polygons) for o in OBJ if o.type == 'MESH')


# ─── finish : mains, manchettes, ceinture, matériaux ──────────────────────
HANDS = [
    {'center': [0.19, -0.172, 0.028], 'inward': -1},   # main droite du personnage (x > 0)
    {'center': [-0.181, -0.166, 0.040], 'inward': 1},  # main gauche, devant la poche
]
R_MAJOR, R_MINOR, THICK, GAP = 0.025, 0.0135, 1.35, math.radians(72)
CUFF_TOP = -0.108  # le haut des manchettes rentre dans la manche
TUNING = {  # matériau : rugosité, vernis, rugosité du vernis — plastique moulé satiné (planche)
    'Visage': (0.34, 0.55, 0.12), 'Bonnet': (0.72, 0.08, 0.3), 'Sweat': (0.52, 0.22, 0.25),
    'Ceinture': (0.5, 0.3, 0.2), 'Jean': (0.82, 0.04, 0.4), 'Baskets': (0.44, 0.3, 0.18), 'Semelles': (0.55, 0.15, 0.3),
}


def c_hand(center, inward):
    """Main Playmobil : anneau épais ouvert côté corps (trou traversant d'avant en arrière) + poignet."""
    bm = bmesh.new()
    segs, rings = 48, 20
    cx, cy, cz = center
    gap_dir = math.atan2(0.0, inward)
    verts = []
    a0 = gap_dir + GAP / 2
    span = 2 * math.pi - GAP
    for i in range(segs + 1):
        a = a0 + span * i / segs
        ring = []
        for j in range(rings):
            b = 2 * math.pi * j / rings
            r = R_MAJOR + R_MINOR * math.cos(b)
            ring.append(bm.verts.new(B(cx + r * math.cos(a), cy + r * math.sin(a), cz + R_MINOR * THICK * math.sin(b))))
        verts.append(ring)
    for i in range(segs):
        for j in range(rings):
            bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][(j + 1) % rings], verts[i][(j + 1) % rings]))
    for end, sign in ((0, -1), (segs, 1)):  # extrémités arrondies
        a = a0 + span * end / segs
        tg = B(*(Vector((-math.sin(a), math.cos(a), 0)) * sign)) - B(0, 0, 0)
        ring = verts[end]
        center_end = B(cx + R_MAJOR * math.cos(a), cy + R_MAJOR * math.sin(a), cz)
        prev = ring
        for k in range(1, 5):
            f = k / 5
            nxt = [bm.verts.new(center_end + (v.co - center_end) * math.cos(f * math.pi / 2) + tg * (R_MINOR * 0.8 * math.sin(f * math.pi / 2))) for v in ring]
            for j in range(rings):
                quad = (prev[j], nxt[j], nxt[(j + 1) % rings], prev[(j + 1) % rings])
                bm.faces.new(quad if sign > 0 else tuple(reversed(quad)))
            prev = nxt
        tip = bm.verts.new(center_end + tg * R_MINOR * 0.8)
        for j in range(rings):
            tri = (prev[j], tip, prev[(j + 1) % rings])
            bm.faces.new(tri if sign > 0 else tuple(reversed(tri)))
    top, wrist_top = cy + R_MAJOR + R_MINOR * 0.6, CUFF_TOP - 0.004  # poignet caché dans la manchette
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.019, radius2=0.019, depth=wrist_top - top + 0.003,
                          matrix=Matrix.Translation(B(cx, (wrist_top + top - 0.003) / 2, cz)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def step_finish():
    for name, (rough, coat, coat_rough) in TUNING.items():
        p = principled(bpy.data.materials[name])
        p.inputs['Roughness'].default_value = rough
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = coat_rough
    principled(bpy.data.materials['Sweat']).inputs['Base Color'].default_value = srgb('#f2f2f0')
    m_skin = new_material('Mains', SKIN, 0.34, coat=0.55, coat_rough=0.12)
    m_gold = new_material('Boucle', '#d8a93f', 0.24, coat=0.3, metal=1.0)
    m_under = new_material('Ceinture_fond', '#22150c', 0.55, coat=0.2)
    m_loop = new_material('Passants', '#25262c', 0.8, coat=0.04)

    OBJ.remove(OBJ['Mains'], do_unlink=True)  # boules percées du modèle d'origine

    # Manchettes : le bout de manche sculpté (feuille ouverte, déchiquetée) est coupé et remplacé par une
    # manchette ovale arrondie, fondue dans le sweat (elle prend la couleur de chaque création sur le site).
    sweat = OBJ['Sweat']
    Mw = sweat.matrix_world
    sw = bmesh.new()
    sw.from_mesh(sweat.data)
    cuffs = bmesh.new()
    REPORT['manchettes'] = []
    for h in HANDS:
        cx, cy, cz = h['center']
        bottom = cy + R_MAJOR + R_MINOR - 0.006
        side = 1 if cx > 0 else -1
        # section réelle de la manche sous le bas du sweat (à cette hauteur, le sweat n'est plus que les manches)
        band = [Mw @ v.co for v in sw.verts if -0.132 < (Mw @ v.co).z < -0.118 and (Mw @ v.co).x * side > 0.1]
        xs, zs = sorted(p.x for p in band), sorted(-p.y for p in band)
        q = lambda a, t: a[int((len(a) - 1) * t)]  # percentiles : points isolés ignorés
        c2 = Vector(((q(xs, 0.04) + q(xs, 0.96)) / 2, (q(zs, 0.04) + q(zs, 0.96)) / 2))
        ax = (q(xs, 0.96) - q(xs, 0.04)) / 2 + 0.005  # recouvre le bord coupé de la manche
        az = min((q(zs, 0.96) - q(zs, 0.04)) / 2 + 0.005, ax * 1.35)
        h['center'][0], h['center'][2] = c2.x, c2.y  # la main pend dans l'axe de sa manchette
        dead = set()
        for fc in sw.faces:
            c = Mw @ fc.calc_center_median()
            if (c.z < -0.117 and c.x * side > 0.1) or (c.z < -0.111 and c.x * side > 0.165):
                dead.add(fc)
        bmesh.ops.delete(sw, geom=list(dead), context='FACES')
        radius = max(ax, az)
        tube = bmesh.new()
        bmesh.ops.create_cone(tube, cap_ends=True, segments=48, radius1=radius, radius2=radius, depth=CUFF_TOP - bottom,
                              matrix=Matrix.Translation(B(c2.x, (CUFF_TOP + bottom) / 2, c2.y)) @ Matrix.Diagonal((ax / radius, az / radius, 1, 1)))
        low = [e for e in tube.edges if all(abs(v.co.z - bottom) < 1e-6 for v in e.verts)]
        bmesh.ops.bevel(tube, geom=low, offset=0.0045, segments=4, profile=0.5, affect='EDGES')
        tmp = bpy.data.meshes.new('tmp')
        tube.to_mesh(tmp)
        tube.free()
        cuffs.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        REPORT['manchettes'].append(f'{ax * 2000:.0f} × {az * 2000:.0f} mm, {len(dead)} faces retirées')
    # éclats restés isolés après la coupe
    seen, small = set(), []
    for f0 in sw.faces:
        if f0 in seen:
            continue
        comp, stack = [], [f0]
        seen.add(f0)
        while stack:
            fc = stack.pop()
            comp.append(fc)
            for e in fc.edges:
                for g in e.link_faces:
                    if g not in seen:
                        seen.add(g)
                        stack.append(g)
        if len(comp) < 300:
            small += comp
    bmesh.ops.delete(sw, geom=small, context='FACES')
    sw.to_mesh(sweat.data)
    sw.free()
    append_to(sweat, cuffs)

    hands_bm = bmesh.new()
    for h in HANDS:
        part = c_hand(h['center'], h['inward'])
        tmp = bpy.data.meshes.new('tmp')
        part.to_mesh(tmp)
        part.free()
        hands_bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    new_object('Mains', hands_bm, m_skin)

    # Ceinture : boucle dorée (cadre + barre + ardillon) et passants, posés sur la surface par lancer de rayons
    belt_bvh, buckle_bvh = world_bvh(OBJ['Ceinture']), world_bvh(OBJ['Boucle'])
    OBJ['Boucle'].name = 'Boucle_fond'
    OBJ['Boucle_fond'].data.materials[0] = m_under

    def surface(theta, bvh):
        d = B(math.sin(theta), 0, math.cos(theta)) - B(0, 0, 0)
        hit, normal, _, _ = bvh.ray_cast(B(0, -0.1305, -0.02) + d * 0.6, -d)
        return hit, normal

    hit, normal = surface(0.0, buckle_bvh)
    fw, fh, bar, depth = 0.036, 0.03, 0.0048, 0.0055
    frame = bmesh.new()
    for (x, y, w, hh) in [(0, fh / 2 - bar / 2, fw, bar), (0, -fh / 2 + bar / 2, fw, bar),
                          (-fw / 2 + bar / 2, 0, bar, fh), (fw / 2 - bar / 2, 0, bar, fh), (-fw * 0.12, 0, bar * 0.8, fh)]:
        bmesh.ops.create_cube(frame, size=1.0, matrix=Matrix.Translation((x, 0, y)) @ Matrix.Diagonal((w, depth, hh, 1)))
    bmesh.ops.create_cube(frame, size=1.0, matrix=Matrix.Translation((fw * 0.13, -depth * 0.3, 0)) @ Matrix.Diagonal((fw * 0.36, depth * 0.6, bar * 0.6, 1)))
    front = Vector((normal.x, normal.y, 0)).normalized()
    rot = front.to_track_quat('-Y', 'Z').to_matrix().to_4x4()
    bmesh.ops.transform(frame, matrix=Matrix.Translation(hit + front * (depth / 2 + 0.0012)) @ rot, verts=frame.verts)
    bevel(new_object('Boucle', frame, m_gold, smooth=False), 0.0011, 2)

    loops = bmesh.new()
    for theta in (-0.62, 0.62, -2.25, 2.25, math.pi):  # pas sur les flancs, où pendent les mains
        hit, normal = surface(theta, belt_bvh)
        if hit is None:
            continue
        n = Vector((normal.x, normal.y, 0)).normalized()
        r = n.to_track_quat('-Y', 'Z').to_matrix().to_4x4()
        bmesh.ops.create_cube(loops, size=1.0, matrix=Matrix.Translation(hit + n * 0.0016) @ r @ Matrix.Diagonal((0.0095, 0.0034, 0.043, 1)))
    bevel(new_object('Passants', loops, m_loop, smooth=False), 0.0012, 2)


# ─── playmobil : col, semelles, sweat lissé ───────────────────────────────
SOLE_TOP, SOLE_SCALE = -0.472, 1.45  # semelles épaissies vers le bas (planche : baskets massives)
COLLAR_Y = 0.181  # limite peau / sweat au cou (classify.js)


def step_playmobil():
    # 1. Sweat lissé : volumes de plastique moulé, sans les petits plis sculptés.
    #    Les sommets du bord (raccords avec le cou, la ceinture, les manchettes) ne bougent pas : aucune fissure.
    sweat = OBJ['Sweat']
    bm = bmesh.new()
    bm.from_mesh(sweat.data)
    dist = {v: 0 for v in bm.verts if v.is_boundary}
    frontier = list(dist)
    for ring in range(1, 7):
        nxt = []
        for v in frontier:
            for e in v.link_edges:
                w = e.other_vert(v)
                if w not in dist:
                    dist[w] = ring
                    nxt.append(w)
        frontier = nxt
    bm.verts.index_update()
    Ms = sweat.matrix_world
    in_cuff = lambda v: (Ms @ v.co).z < -0.105 and abs((Ms @ v.co).x) > 0.12  # manchettes modélisées : intactes
    weights = {v.index: 0.0 if in_cuff(v) else min(1.0, dist.get(v, 7) / 7) for v in bm.verts}
    bm.free()
    vg = sweat.vertex_groups.new(name='lissage')
    for i, w in weights.items():
        if w > 0:
            vg.add([i], w, 'REPLACE')
    mod = sweat.modifiers.new('plastique', 'CORRECTIVE_SMOOTH')
    mod.factor, mod.iterations, mod.vertex_group, mod.smooth_type = 0.9, 18, 'lissage', 'LENGTH_WEIGHTED'
    mod.use_only_smooth = True

    # 2. Col rond côtelé à la base du cou (planche : encolure ronde nette)
    face = OBJ['Visage']
    Mf = face.matrix_world
    ring = [Mf @ v.co for v in face.data.vertices if abs((Mf @ v.co).z - COLLAR_Y) < 0.004]
    cx = sum(p.x for p in ring) / len(ring)
    cy = sum(p.y for p in ring) / len(ring)
    rx = max(abs(p.x - cx) for p in ring)
    ry = max(abs(p.y - cy) for p in ring)
    collar = bmesh.new()
    segs, rings_n, minor = 96, 12, 0.0075
    rows = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        row = []
        for j in range(rings_n):
            b = 2 * math.pi * j / rings_n
            rib = 1 + 0.06 * math.cos(a * 48)  # côtes du bord-côte
            k = (1 + minor * math.cos(b) / max(rx, ry))
            row.append(collar.verts.new(Vector((cx + rx * k * math.cos(a) * rib ** 0.15, cy + ry * k * math.sin(a) * rib ** 0.15,
                                                COLLAR_Y + 0.002 + minor * 0.9 * math.sin(b)))))
        rows.append(row)
    for i in range(segs):
        for j in range(rings_n):
            collar.faces.new((rows[i][j], rows[(i + 1) % segs][j], rows[(i + 1) % segs][(j + 1) % rings_n], rows[i][(j + 1) % rings_n]))
    bmesh.ops.recalc_face_normals(collar, faces=collar.faces)
    append_to(sweat, collar)  # le col prend la couleur du sweat de chaque création
    REPORT['col'] = f'{rx * 2000:.0f} × {ry * 2000:.0f} mm'

    # 3. Semelles épaissies vers le bas (le dessus de la basket et le jean ne bougent pas)
    moved = 0
    for name in ('Semelles', 'Baskets'):
        o = OBJ[name]
        M, Mi = o.matrix_world, o.matrix_world.inverted()
        for v in o.data.vertices:
            p = M @ v.co
            if p.z < SOLE_TOP:
                p.z = SOLE_TOP + (p.z - SOLE_TOP) * SOLE_SCALE
                v.co = Mi @ p
                moved += 1
    REPORT['semelles'] = f'{moved} sommets, épaisseur × {SOLE_SCALE}'


# ─── proportions : mesures relevées sur la planche (rapportées à la largeur du torse) ─
#   jambes du jean : 0,57 (modèle 0,40) → élargies progressivement jusqu'à l'ourlet
#   baskets        : longueur 0,50 (modèle 0,37) → agrandies autour de chaque pied
#   tête + bonnet  : hauteur 1,05 × torse (modèle 0,92) → agrandis depuis la base du cou
LEG_WIDEN, SHOE_SCALE, SHOE_LIFT, HEAD_SCALE = 1.25, 1.3, 1.15, 1.12
NECK_Z = 0.181  # base du cou (glTF y) : pivot de l'agrandissement de la tête


def ramp(e0, e1, t):
    x = min(1.0, max(0.0, (t - e0) / (e1 - e0)))
    return x * x * (3 - 2 * x)


def deform(names, fn):
    for name in names:
        o = OBJ[name]
        M, Mi = o.matrix_world, o.matrix_world.inverted()
        for v in o.data.vertices:
            v.co = Mi @ fn(M @ v.co)
        o.data.update()


def step_proportions():
    # 1. Jean : chaque jambe s'élargit autour de son axe (hanche inchangée), puis tombe droite jusqu'à l'ourlet
    def widen(p):
        k = 1 + (LEG_WIDEN - 1) * ramp(-0.17, -0.27, p.z)  # jambe droite et large dès le haut de la cuisse
        if k == 1:
            return p
        axis = Vector((0.095 if p.x > 0 else -0.098, 0.02, p.z))
        return axis + (p - axis) * Vector((k, k, 1))
    deform(['Jean'], widen)

    # 2. Baskets et semelles : agrandies autour du talon-pointe de chaque pied, posées au même sol
    feet = {}
    for name in ('Baskets', 'Semelles'):
        o = OBJ[name]
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            f = feet.setdefault(p.x > 0, [9, -9, 9, -9, 9])
            f[0], f[1], f[2], f[3], f[4] = min(f[0], p.x), max(f[1], p.x), min(f[2], p.y), max(f[3], p.y), min(f[4], p.z)

    def grow(p):
        f = feet[p.x > 0]
        c = Vector(((f[0] + f[1]) / 2, (f[2] + f[3]) / 2, f[4]))
        return c + (p - c) * Vector((SHOE_SCALE, SHOE_SCALE, SHOE_LIFT))
    deform(['Baskets', 'Semelles'], grow)
    # le bas du jean suit le dessus des baskets (même agrandissement, atténué vers le haut)
    def follow(p):
        w = 0.6 * ramp(-0.40, -0.445, p.z)
        if w == 0:
            return p
        return p.lerp(grow(p), w)
    deform(['Jean'], follow)

    # 3. Tête et bonnet agrandis depuis la base du cou (le cou reste raccordé au col)
    pivot = Vector((0, 0.018, NECK_Z))
    def head(p):
        k = 1 + (HEAD_SCALE - 1) * ramp(NECK_Z, NECK_Z + 0.02, p.z)
        return pivot + (p - pivot) * k
    deform(['Visage', 'Bonnet'], head)
    lo, hi = Vector((9, 9, 9)), Vector((-9, -9, -9))
    for o in OBJ:
        if o.type == 'MESH':
            for c in o.bound_box:
                p = o.matrix_world @ Vector(c)
                lo, hi = Vector(map(min, lo, p)), Vector(map(max, hi, p))
    REPORT['proportions'] = {'jambes': LEG_WIDEN, 'baskets': SHOE_SCALE, 'tete': HEAD_SCALE,
                             'boite_gltf': {'x': [round(lo.x, 3), round(hi.x, 3)], 'y': [round(lo.z, 3), round(hi.z, 3)]}}


# ─── studio : éclairage neutre et vues de la planche ──────────────────────
VIEWS = {'face': 0, 'trois-quarts-avant': -40, 'profil-gauche': -90, 'dos': 180, 'profil-droit': 90, 'trois-quarts-arriere': 140}


def step_studio(view='face', engine='CYCLES'):
    sc = bpy.context.scene
    if 'cam' not in OBJ:
        sc.render.engine = engine
        if engine == 'CYCLES':
            sc.cycles.device = 'CPU'
            sc.cycles.samples = 48
            sc.cycles.use_denoising = True
        sc.render.resolution_x, sc.render.resolution_y = 700, 1060
        sc.view_settings.view_transform = 'Standard'  # AgX désature le bleu du bonnet et le jean
        sc.view_settings.exposure = -0.35
        world = bpy.data.worlds.new('fond')
        world.use_nodes = True
        world.node_tree.nodes['Background'].inputs['Color'].default_value = srgb('#3a0a0e')
        world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
        sc.world = world
        rig = bpy.data.objects.new('eclairage', None)
        sc.collection.objects.link(rig)
        for name, loc, energy, color, size in (('cle', (-1.6, -2.2, 1.6), 260, '#ffffff', 1.2), ('debouchage', (2.0, -1.4, 0.6), 90, '#ffffff', 1.5),
                                                ('contour_rouge', (-1.8, 2.0, 1.0), 160, '#ff2a3c', 1.0), ('contour', (2.0, 1.8, 1.4), 140, '#ffffff', 1.0)):
            ld = bpy.data.lights.new(name, 'AREA')
            ld.energy, ld.color, ld.size = energy, srgb(color)[:3], size
            lo = bpy.data.objects.new(name, ld)
            lo.location = loc
            lo.rotation_euler = (Vector((0, 0, 0.05)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
            sc.collection.objects.link(lo)
            lo.parent = rig
        cam_data = bpy.data.cameras.new('cam')
        cam_data.lens, cam_data.sensor_fit, cam_data.sensor_height = 85, 'VERTICAL', 24
        cam = bpy.data.objects.new('cam', cam_data)
        sc.collection.objects.link(cam)
        sc.camera = cam
    cam, rig = OBJ['cam'], OBJ['eclairage']
    a = math.radians(VIEWS[view])
    # la figurine reste fixe ; caméra et éclairage tournent ensemble autour d'elle (planche studio)
    cam.location = Vector((math.sin(a) * 4.1, -math.cos(a) * 4.1, 0.35))
    cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    rig.rotation_euler = (0, 0, a)


# ─── bake / export / verify ──────────────────────────────────────────────
def step_bake():
    for o in [o for o in OBJ if o.type == 'MESH' and o.modifiers]:
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        old = o.data
        o.modifiers.clear()
        o.data = me
        me.name = old.name
        if old.users == 0:
            bpy.data.meshes.remove(old)
    for o in OBJ:
        if o.type == 'MESH':
            o.vertex_groups.clear()


def step_export(out):
    opts = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(filepath=out, export_format='GLB', export_yup=True, export_apply=True, export_texcoords=True,
              export_normals=True, export_materials='EXPORT', export_cameras=False, export_lights=False, use_selection=False)
    if 'export_image_format' in opts:
        kw['export_image_format'] = 'JPEG'
    for q in ('export_image_quality', 'export_jpeg_quality'):
        if q in opts:
            kw[q] = 92
    bpy.ops.export_scene.gltf(**kw)
    REPORT['export'] = out


def step_verify(src):
    """Réimport dans une scène neuve : objets, matériaux, textures, UV, dimensions."""
    sc = bpy.data.scenes.new('verification')
    before = set(OBJ)
    win = bpy.context.window
    prev = win.scene if win else None
    if win:
        win.scene = sc
    with bpy.context.temp_override(scene=sc):
        bpy.ops.import_scene.gltf(filepath=src)
    new = [o for o in OBJ if o not in before and o.type == 'MESH']
    lo, hi = Vector((9, 9, 9)), Vector((-9, -9, -9))
    for o in new:
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            lo, hi = Vector(map(min, lo, p)), Vector(map(max, hi, p))
    REPORT['reimport'] = {o.name: {'triangles': sum(len(p.vertices) - 2 for p in o.data.polygons), 'uv': len(o.data.uv_layers),
                                   'materiau': o.material_slots[0].material.name if o.material_slots else None,
                                   'texture': any(n.type == 'TEX_IMAGE' for s in o.material_slots if s.material for n in s.material.node_tree.nodes)}
                          for o in new}
    REPORT['dimensions'] = [round(v, 3) for v in (hi - lo)]
    for o in new:
        bpy.data.objects.remove(o)
    if win and prev:
        win.scene = prev
    bpy.data.scenes.remove(sc)


# ─── point d'entrée ──────────────────────────────────────────────────────
def run(a):
    step = a['step']
    if step == 'load':
        step_load(a['src'])
    elif step == 'finish':
        step_finish()
    elif step == 'playmobil':
        step_playmobil()
    elif step == 'proportions':
        step_proportions()
    elif step == 'studio':
        step_studio(a.get('view', 'face'), a.get('engine', 'CYCLES'))
    elif step == 'bake':
        step_bake()
    elif step == 'export':
        step_export(a['out'])
    elif step == 'verify':
        step_verify(a['src'])
    return REPORT


if 'args' in globals() and isinstance(globals()['args'], dict) and 'step' in globals()['args']:
    __result__ = run(globals()['args'])  # appel MCP (blender_python_exec)
elif '--' in sys.argv:  # ligne de commande
    argv = sys.argv[sys.argv.index('--') + 1:]
    SRC, OUT = argv[0], argv[1]
    RENDER_DIR = argv[2] if len(argv) > 2 else None
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for s in ('load', 'finish', 'playmobil', 'proportions', 'bake'):
        run({'step': s, 'src': SRC})
    step_export(OUT)
    print('export :', OUT)
    for k, v in REPORT.items():
        print(k, ':', v)
    if RENDER_DIR:
        import numpy as np
        os.makedirs(RENDER_DIR, exist_ok=True)
        tiles = []
        for name in VIEWS:
            step_studio(name)
            path = os.path.join(RENDER_DIR, f'blender-{name}.png')
            bpy.context.scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(path)
            tiles.append(np.array(img.pixels[:]).reshape(img.size[1], img.size[0], 4))
            bpy.data.images.remove(img)
        strip = np.concatenate(tiles, axis=1)
        out = bpy.data.images.new('planche', strip.shape[1], strip.shape[0], alpha=True)
        out.pixels = strip.ravel()
        out.filepath_raw = os.path.join(RENDER_DIR, 'blender-vues-planche.png')
        out.file_format = 'PNG'
        out.save()
        print('rendus :', out.filepath_raw)
