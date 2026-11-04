"""
Figurine Playmobil Love&Faith V2 — construction complète dans Blender (via MCP ou `blender -P`).

Toutes les pièces sont modélisées en « px de planche » (la figurine mesure 460 px de haut sur la planche
de référence), sous un Empty racine qui ramène l'ensemble à 1,05 unité (Y glTF de -0,512 à 0,538),
le repère attendu par le site (src/three/figure/LoveFaithFigure.jsx).

Repère : Z vers le haut, la figurine regarde -Y, sa gauche est +X.
Les formes sont des « lofts » : suites de sections superellipses (a = demi-largeur, b = demi-profondeur
avant, bb = demi-profondeur arrière, e = exposant) reliées en quads, avec UV, puis lissées en subdivision.
"""
import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = globals().get('args', {}).get('root') or r"C:/Users/laido/OneDrive/Documents/LoveFaith-Spider"
OUT = ROOT + "/Mockups/LoveFaith_Playmobil_V2"
TEX = OUT + "/textures"
S = 1.05 / 460.0
Z0 = -0.512


# ----------------------------------------------------------------------------------------------
# Scène
# ----------------------------------------------------------------------------------------------
def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    for blocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights,
                   bpy.data.images, bpy.data.node_groups, bpy.data.curves):
        for d in list(blocks):
            if d.users == 0:
                blocks.remove(d)


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


FIG = None
ROOT_OBJ = None


def link(obj, parent=None):
    FIG.objects.link(obj)
    obj.parent = parent or ROOT_OBJ
    return obj


# ----------------------------------------------------------------------------------------------
# Lofts
# ----------------------------------------------------------------------------------------------
def sec(c, a, b=None, bb=None, e=2.0, t=None, ref=None):
    b = a if b is None else b
    return {'c': Vector(c), 'a': a, 'b': b, 'bb': b if bb is None else bb, 'e': e, 't': t, 'ref': ref}


def spt(th, s):
    c, si = math.cos(th), math.sin(th)
    p = 2.0 / s['e']
    x = s['a'] * math.copysign(abs(c) ** p, c)
    y = (s['bb'] if si > 0 else s['b']) * math.copysign(abs(si) ** p, si)
    return x, y


def frames(secs, ref, axis, closed):
    m = len(secs)
    out = []
    for i, s in enumerate(secs):
        if s['t'] is not None:
            T = Vector(s['t']).normalized()
        elif axis is not None:
            T = Vector(axis).normalized()
        else:
            if closed:
                p0, p1 = secs[(i - 1) % m]['c'], secs[(i + 1) % m]['c']
            else:
                p0, p1 = secs[max(i - 1, 0)]['c'], secs[min(i + 1, m - 1)]['c']
            T = (p1 - p0).normalized()
        r = Vector(s['ref'] if s['ref'] is not None else ref)
        side = (r - r.dot(T) * T).normalized()
        out.append((T, side, T.cross(side)))
    return out


def loft_bm(bm, secs, n=48, cap0=True, cap1=True, theta0=0.0, ref=(1, 0, 0), axis=None,
            closed=False, uv_fn=None, mat_index=0):
    uvl = bm.loops.layers.uv.get('UVMap') or bm.loops.layers.uv.new('UVMap')
    fr = frames(secs, ref, axis, closed)
    pts, loc = [], []
    for s, (T, side, fwd) in zip(secs, fr):
        ring, lr = [], []
        for j in range(n):
            x, y = spt(theta0 + 2 * math.pi * j / n, s)
            ring.append(s['c'] + side * x + fwd * y)
            lr.append((x, y))
        pts.append(ring)
        loc.append(lr)
    m = len(secs)
    L = [0.0]
    for i in range(1, m + (1 if closed else 0)):
        a, b = pts[i - 1], pts[i % m]
        L.append(L[-1] + sum((b[j] - a[j]).length for j in range(n)) / n)
    tot = L[-1] or 1.0
    verts = [[bm.verts.new(p) for p in ring] for ring in pts]

    def uv(i, j):
        ii, jj = i % m, j % n
        if uv_fn:  # indices non repliés : le raccord reçoit u = 1 / i = m
            return uv_fn(i, j, loc[ii][jj][0], loc[ii][jj][1], pts[ii][jj], j / n, L[i] / tot)
        return (j / n, L[i] / tot)

    faces = []
    for i in range(m - 1 + (1 if closed else 0)):
        for j in range(n):
            q = [(i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)]
            f = bm.faces.new([verts[a % m][b % n] for a, b in q])
            f.material_index = mat_index
            for lp, (a, b) in zip(f.loops, q):
                lp[uvl].uv = uv(a, b)
            faces.append(f)
    if not closed:
        for flag, i in ((cap0, 0), (cap1, m - 1)):
            if flag:
                f = bm.faces.new(verts[i])
                f.material_index = mat_index
                for lp, j in zip(f.loops, range(n)):
                    lp[uvl].uv = uv(i, j)
                faces.append(f)
    return faces


def mesh_object(name, bm, mats=(), subsurf=2, parent=None, smooth=True, recalc=True):
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    for m in mats:
        me.materials.append(m)
    obj = bpy.data.objects.new(name, me)
    link(obj, parent)
    if subsurf:
        mod = obj.modifiers.new('Subdivision', 'SUBSURF')
        mod.levels = min(subsurf, 2)
        mod.render_levels = subsurf
    return obj


def loft(name, secs, mats=(), subsurf=2, parent=None, **kw):
    bm = bmesh.new()
    loft_bm(bm, secs, **kw)
    return mesh_object(name, bm, mats, subsurf, parent)


def apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    me.name = old.name
    bpy.data.meshes.remove(old)


def bvh(*objs):
    """BVH dans le repère local commun (les objets sont sous la même racine, sans transformation propre)."""
    dg = bpy.context.evaluated_depsgraph_get()
    if len(objs) == 1:
        return BVHTree.FromObject(objs[0], dg)
    verts, polys = [], []
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        off = len(verts)
        verts += [v.co.copy() for v in me.vertices]
        polys += [[off + i for i in p.vertices] for p in me.polygons]
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)


def mirror_bm(bm):
    bmesh.ops.scale(bm, vec=(-1, 1, 1), verts=bm.verts)
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])


# ----------------------------------------------------------------------------------------------
# Matériaux
# ----------------------------------------------------------------------------------------------
def image(name):
    return bpy.data.images.load(os.path.join(TEX, name), check_existing=True)


class NT:
    def __init__(self, name):
        self.mat = bpy.data.materials.new(name)
        self.mat.use_nodes = True
        self.nt = self.mat.node_tree
        self.nt.nodes.clear()
        self.out = self.node('ShaderNodeOutputMaterial', (600, 0))
        self.bsdf = self.node('ShaderNodeBsdfPrincipled', (300, 0))
        self.link(self.bsdf.outputs[0], self.out.inputs['Surface'])

    def node(self, kind, loc=(0, 0), **props):
        n = self.nt.nodes.new(kind)
        n.location = loc
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def set(self, **inputs):
        for k, v in inputs.items():
            self.bsdf.inputs[k.replace('_', ' ')].default_value = v
        return self

    def math(self, op, a, b=None, loc=(0, 0)):
        n = self.node('ShaderNodeMath', loc, operation=op)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                self.link(v, n.inputs[i])
        return n.outputs[0]

    def mix(self, fac, a, b, loc=(0, 0)):
        n = self.node('ShaderNodeMix', loc, data_type='RGBA')
        for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(v, (int, float)):
                sock.default_value = v
            elif isinstance(v, tuple):
                sock.default_value = v
            else:
                self.link(v, sock)
        return n.outputs[2]

    def bump(self, height, strength, distance=0.5, loc=(100, -400)):
        n = self.node('ShaderNodeBump', loc)
        n.inputs['Strength'].default_value = strength
        n.inputs['Distance'].default_value = distance
        self.link(height, n.inputs['Height'])
        self.link(n.outputs[0], self.bsdf.inputs['Normal'])
        return n

    def obj_xyz(self, scale=(1, 1, 1), loc=(-900, 0)):
        tc = self.node('ShaderNodeTexCoord', loc)
        mp = self.node('ShaderNodeMapping', (loc[0] + 200, loc[1]))
        mp.inputs['Scale'].default_value = scale
        self.link(tc.outputs['Object'], mp.inputs['Vector'])
        return tc, mp.outputs[0]


def rgb(r, g, b):
    return (r, g, b, 1.0)


def plastic(name, color, rough=0.32, coat=0.3, coat_rough=0.15):
    m = NT(name).set(Base_Color=color, Roughness=rough, Coat_Weight=coat, Coat_Roughness=coat_rough)
    return m.mat


def decal_material(name, img, rough=0.4, coat=0.0):
    m = NT(name)
    t = m.node('ShaderNodeTexImage', (-300, 0), image=image(img), interpolation='Cubic', extension='CLIP')
    m.link(t.outputs['Color'], m.bsdf.inputs['Base Color'])
    m.link(t.outputs['Alpha'], m.bsdf.inputs['Alpha'])
    m.set(Roughness=rough, Coat_Weight=coat, Coat_Roughness=0.1)
    m.mat.surface_render_method = 'DITHERED'
    m.mat.use_backface_culling = True
    return m.mat


def image_material(name, img, rough, coat=0.0, bump=0.0, metallic=0.0):
    m = NT(name)
    t = m.node('ShaderNodeTexImage', (-500, 0), image=image(img), interpolation='Cubic')
    m.link(t.outputs['Color'], m.bsdf.inputs['Base Color'])
    m.set(Roughness=rough, Coat_Weight=coat, Coat_Roughness=0.2, Metallic=metallic)
    if bump:
        bw = m.node('ShaderNodeRGBToBW', (-250, -300))
        m.link(t.outputs['Color'], bw.inputs[0])
        m.bump(bw.outputs[0], bump, 0.3)
    return m.mat


def beanie_material():
    m = NT('Bonnet')
    tc, xyz = m.obj_xyz()
    sep = m.node('ShaderNodeSeparateXYZ', (-450, 300))
    m.link(tc.outputs['Object'], sep.inputs[0])
    x, y, z = sep.outputs
    # « Textile » : mouchetures blanches de maille, courtes et verticales
    mp = m.node('ShaderNodeMapping', (-700, -200))
    mp.inputs['Scale'].default_value = (0.75, 0.75, 0.075)
    m.link(tc.outputs['Object'], mp.inputs['Vector'])
    vor = m.node('ShaderNodeTexVoronoi', (-500, -200), voronoi_dimensions='3D')
    vor.inputs['Scale'].default_value = 1.0
    m.link(mp.outputs[0], vor.inputs['Vector'])
    sepc = m.node('ShaderNodeSeparateColor', (-300, -300))
    m.link(vor.outputs['Color'], sepc.inputs[0])
    small = m.math('LESS_THAN', vor.outputs['Distance'], 0.36, (-250, -150))
    keep = m.math('GREATER_THAN', sepc.outputs[0], 0.22, (-150, -300))
    # densité variable par zones (comme sur la planche)
    nz = m.node('ShaderNodeTexNoise', (-500, -500))
    nz.inputs['Scale'].default_value = 0.045
    m.link(tc.outputs['Object'], nz.inputs['Vector'])
    dens = m.math('GREATER_THAN', nz.outputs['Fac'], 0.42, (-250, -500))
    fleck = m.math('MULTIPLY', m.math('MULTIPLY', small, keep, (-50, -200)), m.math('MAXIMUM', dens, 0.75, (-100, -500)), (80, -250))
    fleck = m.math('GREATER_THAN', fleck, 0.6, (160, -250))
    # bande verticale arrière et bande du revers
    vert = m.math('MULTIPLY', m.math('LESS_THAN', m.math('ABSOLUTE', x, None, (-250, 400)), 8.4, (-100, 400)),
                  m.math('GREATER_THAN', y, 0.0, (-100, 300)), (50, 380))
    # revers : plus horizontal que le bord (Z ≈ 404 devant, 391 derrière, comme sur la planche)
    zt = m.math('SUBTRACT', m.math('SUBTRACT', z, m.math('MULTIPLY', y, 0.127, (-250, 160)), (-150, 200)), 25.9, (-50, 200))
    fold = m.math('LESS_THAN', m.math('ABSOLUTE', zt, None, (0, 200)), 1.7, (50, 180))
    white = m.math('MAXIMUM', m.math('MAXIMUM', vert, fold, (200, 300)), fleck, (300, 150))
    col = m.mix(white, rgb(0.014, 0.075, 0.6), rgb(0.9, 0.92, 0.95), (400, 150))
    m.link(col, m.bsdf.inputs['Base Color'])
    m.set(Roughness=0.8, Sheen_Weight=0.08, Sheen_Roughness=0.4)
    # côtes de tricot (relief)
    wave = m.node('ShaderNodeTexWave', (-300, -700), wave_type='BANDS', bands_direction='X')
    wave.inputs['Scale'].default_value = 1.0
    mp2 = m.node('ShaderNodeMapping', (-500, -700))
    mp2.inputs['Scale'].default_value = (0.32, 0.32, 0.32)
    m.link(tc.outputs['Object'], mp2.inputs['Vector'])
    m.link(mp2.outputs[0], wave.inputs['Vector'])
    m.bump(wave.outputs['Fac'], 0.12, 0.4)
    return m.mat


def denim_material():
    m = NT('Jean')
    tc, _ = m.obj_xyz()
    mp = m.node('ShaderNodeMapping', (-700, 0))
    mp.inputs['Scale'].default_value = (2.6, 2.6, 1.6)
    m.link(tc.outputs['Object'], mp.inputs['Vector'])
    grain = m.node('ShaderNodeTexNoise', (-500, 0))
    grain.inputs['Scale'].default_value = 1.0
    grain.inputs['Detail'].default_value = 2.0
    m.link(mp.outputs[0], grain.inputs['Vector'])
    ramp = m.node('ShaderNodeValToRGB', (-300, 0))
    ramp.color_ramp.elements[0].position = 0.6
    ramp.color_ramp.elements[1].position = 0.72
    m.link(grain.outputs['Fac'], ramp.inputs[0])
    wash = m.node('ShaderNodeTexNoise', (-500, -250))
    wash.inputs['Scale'].default_value = 0.03
    m.link(tc.outputs['Object'], wash.inputs['Vector'])
    wr = m.node('ShaderNodeValToRGB', (-300, -250))
    wr.color_ramp.elements[0].position = 0.45
    wr.color_ramp.elements[1].position = 0.7
    m.link(wash.outputs['Fac'], wr.inputs[0])
    sepw = m.node('ShaderNodeRGBToBW', (-100, -250))
    m.link(wr.outputs[0], sepw.inputs[0])
    seps = m.node('ShaderNodeRGBToBW', (-100, 0))
    m.link(ramp.outputs[0], seps.inputs[0])
    # zones d'usure : devant des cuisses, genoux et fesses (cloches douces en z), modulées par le bruit
    sep = m.node('ShaderNodeSeparateXYZ', (-700, -800))
    m.link(tc.outputs['Object'], sep.inputs[0])

    def bell(c, w, loc):
        d = m.math('DIVIDE', m.math('SUBTRACT', sep.outputs[2], c, loc), w, (loc[0] + 100, loc[1]))
        return m.math('MAXIMUM', m.math('SUBTRACT', 1.0, m.math('MULTIPLY', d, d, (loc[0] + 200, loc[1])), (loc[0] + 300, loc[1])), 0.0, (loc[0] + 400, loc[1]))

    zones = m.math('ADD', m.math('MULTIPLY', bell(118, 30, (-600, -900)), 0.9, (-150, -900)),
                   m.math('MULTIPLY', bell(68, 13, (-600, -1050)), 0.7, (-150, -1050)), (0, -950))
    wear = m.math('MULTIPLY', zones, m.math('ADD', sepw.outputs[0], 0.25, (0, -1100)), (120, -950))
    fac = m.math('ADD', m.math('ADD', m.math('MULTIPLY', seps.outputs[0], 0.6, (50, 0)),
                                m.math('MULTIPLY', sepw.outputs[0], 0.08, (50, -250)), (180, -100)),
                 m.math('MULTIPLY', wear, 0.22, (220, -950)), (300, -300))
    col = m.mix(fac, rgb(0.006, 0.006, 0.0065), rgb(0.16, 0.16, 0.165), (300, 0))
    m.link(col, m.bsdf.inputs['Base Color'])
    m.set(Roughness=0.72, Sheen_Weight=0.05, Sheen_Roughness=0.5)
    # sergé diagonal fin
    wave = m.node('ShaderNodeTexWave', (-300, -500), wave_type='BANDS', bands_direction='DIAGONAL')
    wave.inputs['Scale'].default_value = 1.0
    mp2 = m.node('ShaderNodeMapping', (-500, -500))
    mp2.inputs['Scale'].default_value = (0.9, 0.9, 0.9)
    m.link(tc.outputs['Object'], mp2.inputs['Vector'])
    m.link(mp2.outputs[0], wave.inputs['Vector'])
    h = m.math('ADD', wave.outputs['Fac'], m.math('MULTIPLY', grain.outputs['Fac'], 1.5, (-100, -650)), (0, -550))
    m.bump(h, 0.18, 0.3)
    return m.mat


def sweat_material():
    m = NT('Sweat')
    m.set(Base_Color=rgb(0.66, 0.66, 0.65), Roughness=0.55, Coat_Weight=0.25, Coat_Roughness=0.35)
    tc, xyz = m.obj_xyz((0.5, 0.5, 0.5))
    nz = m.node('ShaderNodeTexNoise', (-500, -300))
    nz.inputs['Scale'].default_value = 3.0
    nz.inputs['Detail'].default_value = 8.0
    m.link(xyz, nz.inputs['Vector'])
    folds = m.node('ShaderNodeTexNoise', (-500, -600))
    folds.inputs['Scale'].default_value = 1.0
    folds.inputs['Detail'].default_value = 2.0
    mpf = m.node('ShaderNodeMapping', (-700, -600))
    mpf.inputs['Scale'].default_value = (0.02, 0.02, 0.09)
    m.link(tc.outputs['Object'], mpf.inputs['Vector'])
    m.link(mpf.outputs[0], folds.inputs['Vector'])
    h = m.math('ADD', m.math('MULTIPLY', folds.outputs['Fac'], 6.0, (-250, -600)), nz.outputs['Fac'], (-100, -450))
    m.bump(h, 0.06, 0.4)
    return m.mat


def make_materials():
    M = {}
    M['skin'] = plastic('Peau', rgb(0.19, 0.052, 0.014), rough=0.3, coat=0.35)
    M['eyes'] = decal_material('Yeux', 'face_eyes.png', rough=0.08, coat=0.6)
    M['ink'] = decal_material('Sourcils_Moustache', 'face_ink.png', rough=0.35)
    M['beanie'] = beanie_material()
    M['logo'] = decal_material('Logo_Bonnet', 'beanie_kiss.png', rough=0.55)
    M['text'] = decal_material('Inscription_Bonnet', 'beanie_back_text.png', rough=0.55)
    M['sweat'] = sweat_material()
    M['jean'] = denim_material()
    M['thread'] = plastic('Surpiqures', rgb(0.42, 0.41, 0.38), rough=0.65, coat=0.0)
    M['belt'] = image_material('Ceinture', 'belt.png', rough=0.28, coat=0.35, bump=0.15)
    M['belt_tail'] = image_material('Ceinture_Pointe', 'belt_tail.png', rough=0.28, coat=0.35, bump=0.15)
    gold = NT('Boucle_Doree').set(Base_Color=rgb(0.75, 0.52, 0.2), Metallic=1.0, Roughness=0.24)
    M['gold'] = gold.mat
    M['shoe'] = image_material('Baskets', 'shoe_upper.png', rough=0.42, coat=0.25, bump=0.6)
    M['sole'] = image_material('Semelles', 'shoe_sole.png', rough=0.55, bump=0.6)
    M['lace'] = plastic('Lacets', rgb(0.82, 0.82, 0.8), rough=0.7, coat=0.0)
    return M


# ----------------------------------------------------------------------------------------------
# Pièces
# ----------------------------------------------------------------------------------------------
def build_head(M):
    E = 3.6
    rows = [(322.0, 34, 33, 3.0), (323.6, 44.5, 43.5, 3.2), (326.0, 48.6, 48, E), (329.5, 49.7, 49.5, E),
            (336, 49.7, 49.5, E), (400, 49.7, 49.5, E), (410, 48.8, 48.5, E), (420, 45, 45, 3.2),
            (428, 38.5, 38.5, 3.0), (433, 28, 28, 2.6), (435.5, 14, 14, 2.4)]
    head = loft('Tete', [sec((0, 0, z), a, b, e=e) for z, a, b, e in rows], [M['skin']], axis=(0, 0, 1), n=64)
    neck = loft('Cou', [sec((0, 0, z), a, b, e=2.2) for z, a, b in
                        [(296, 20.5, 20), (300, 21.5, 21), (326, 21.5, 21), (332, 18, 17)]], [M['skin']], axis=(0, 0, 1), n=40)
    return head, neck


def face_decals(head, M):
    tree = bvh(head)
    for name, mat in (('Visage_Yeux', M['eyes']), ('Visage_Sourcils_Moustache', M['ink'])):
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new('UVMap')
        step = 1.0
        nx, nz = int(90 / step), int(80 / step)
        grid = {}
        for i in range(nx + 1):
            for k in range(nz + 1):
                x, z = -45 + i * step, 315 + k * step  # repère de face_*.png
                hit = tree.ray_cast(Vector((x, -200, z)), Vector((0, 1, 0)))
                if hit[0] is not None and z >= 324.0:
                    grid[i, k] = (bm.verts.new(hit[0] + hit[1] * (0.08 if 'Yeux' in name else 0.1)), (i / nx, k / nz), hit[1])
        quads(bm, uvl, grid, nx, nz)
        obj = mesh_object(name, bm, [mat], subsurf=0, recalc=False)
        obj.visible_shadow = False


BEANIE_TILT = math.radians(-13.3)
BEANIE_ORIGIN = Vector((0, 0, 372.5))
BEANIE_DOME = 0.95  # écrasement du dôme au-dessus du revers


def build_beanie(M):
    rows = [(4.0, 50.0, 47.0), (1.6, 54.5, 55.0), (0.3, 57.8, 58.8), (0.0, 59.8, 60.8), (0.6, 60.8, 61.8),
            (2.5, 61.0, 62.0), (19.0, 61.0, 62.0), (21.0, 60.75, 61.75), (23.0, 60.9, 61.9), (38.0, 60.2, 61.2),
            (48.0, 58.6, 59.6), (58.0, 55.2, 56.2), (66.0, 50.6, 51.6), (73.0, 43.6, 44.4), (79.0, 34.0, 34.6),
            (83.4, 21.5, 21.9), (85.4, 8.0, 8.0)]
    rows = [(h if h <= 23 else 23 + (h - 23) * BEANIE_DOME, a, b) for h, a, b in rows]
    obj = loft('Bonnet', [sec((0, 0, h), a, b, e=2.5) for h, a, b in rows], [M['beanie']], axis=(0, 0, 1), n=72,
               theta0=math.pi)
    obj.location = BEANIE_ORIGIN
    obj.rotation_euler = (BEANIE_TILT, 0, 0)
    return obj


def beanie_decals(beanie, M):
    """Bisou Love&Faith (enroulé sur la courbure) et inscription verticale arrière, en repère local du bonnet."""
    apply_modifiers(beanie)
    tree = bvh(beanie)
    # --- logo frontal : azimut 19° vers la gauche du personnage, centre à h = 36
    W, H, phic, hc, R = 88.0, 62.0, math.radians(19), 37.0, 60.5
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    nu, nv = 78, 55
    grid = {}
    for i in range(nu + 1):
        for k in range(nv + 1):
            s, h = -W / 2 + W * i / nu, hc - H / 2 + H * k / nv
            phi = phic + s / R
            d = Vector((math.sin(phi), -math.cos(phi), 0))
            hit = tree.ray_cast(Vector((0, 0, h)), d)
            if hit[0] is not None:
                grid[i, k] = (bm.verts.new(hit[0] + hit[1] * 0.12), (i / nu, k / nv), hit[1])
    quads(bm, uvl, grid, nu, nv)
    logo = mesh_object('Bonnet_Logo', bm, [M['logo']], subsurf=0, parent=beanie, recalc=False)

    # --- inscription arrière : x -7..7, abscisse curviligne 0..120 le long du méridien arrière
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    nx, na = 17, 240
    grid = {}
    for i in range(nx + 1):
        x = -8.5 + 17 * i / nx
        pts = []
        for k in range(0, 101):
            h = k * 0.5
            # depuis l'extérieur : de l'intérieur, le rayon toucherait le rebord replié sous le bonnet
            hit = tree.ray_cast(Vector((x, 200, h)), Vector((0, -1, 0)))
            if hit[0] is not None:
                pts.append(hit)
        for k in range(1, 90):
            ps = math.radians(k)
            hit = tree.ray_cast(Vector((x, 0, 50)), Vector((0, math.cos(ps), math.sin(ps))))
            if hit[0] is not None and hit[0].z > 50:
                pts.append(hit)
        arc = [0.0]
        for a, b in zip(pts, pts[1:]):
            arc.append(arc[-1] + (b[0] - a[0]).length)
        for k in range(na + 1):
            target = 120 * k / na
            if target > arc[-1]:
                break
            j = max(1, next(jj for jj, v in enumerate(arc) if v >= target)) if target > 0 else 1
            t = (target - arc[j - 1]) / max(arc[j] - arc[j - 1], 1e-6)
            p = pts[j - 1][0].lerp(pts[j][0], t)
            nrm = pts[j - 1][1].lerp(pts[j][1], t).normalized()
            grid[i, k] = (bm.verts.new(p + nrm * 0.12), (1 - i / nx, k / na), nrm)  # vu de dos, +X est à gauche
    quads(bm, uvl, grid, nx, na)
    text = mesh_object('Bonnet_Inscription', bm, [M['text']], subsurf=0, parent=beanie, recalc=False)
    for o in (logo, text):
        o.visible_shadow = False


def quads(bm, uvl, grid, nu, nv):
    """Grille de décalcomanie ; grid[i, k] = (sommet, uv, normale de la surface). Les faces sont orientées
    sur la normale de la surface (un recalcul automatique peut retourner une île isolée)."""
    for i in range(nu):
        for k in range(nv):
            q = [(i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1)]
            if all(p in grid for p in q):
                f = bm.faces.new([grid[p][0] for p in q])
                f.normal_update()
                if f.normal.dot(sum((grid[p][2] for p in q), Vector())) < 0:
                    f.normal_flip()
                for lp, p in zip(f.loops, q):
                    lp[uvl].uv = grid[p][1]


def build_sweat(M):
    bm = bmesh.new()
    torso = [(187.0, 53.0, 54.0, 2.8), (188.0, 55.8, 57.8, 2.8), (189.5, 57.0, 59.0, 2.8), (193.0, 57.0, 59.0, 2.8),
             (195.5, 56.6, 58.6, 2.8), (198.5, 58.6, 61.0, 2.8), (205.0, 59.4, 62.0, 2.9), (225.0, 59.6, 62.5, 3.0),
             (255.0, 59.4, 62.0, 3.0), (280.0, 60.0, 60.5, 3.1), (290.0, 59.0, 57.0, 3.1), (297.0, 55.0, 51.0, 3.0),
             (302.0, 47.5, 43.0, 2.7), (306.0, 37.0, 34.0, 2.4), (308.5, 27.0, 26.0, 2.2), (309.5, 21.0, 20.0, 2.2)]
    loft_bm(bm, [sec((0, 0, z), a, b, e=e) for z, a, b, e in torso], n=64, axis=(0, 0, 1))
    down = (0.02, 0, -1)
    # épaule tombante : le haut de manche s'arrête sous l'arrondi de l'épaule du torse
    # manche évasée vers le poignet (planche V3), poignet côtelé ; les plis sont sculptés ensuite (sweat_folds)
    sleeve = [((52, 14.0, 282), 8, 10, None), ((59, 14.5, 281), 15, 19, None), ((66, 15.0, 277), 19.5, 24.5, None),
              ((72, 16.0, 268), 21.5, 25.5, None), ((78, 16.5, 256), 21.8, 25.2, None), ((81.5, 17.0, 244), 21.6, 25.0, None),
              ((84, 17.0, 232), 21.8, 25.2, None), ((88, 17.0, 214), 22.4, 25.5, None), ((91.5, 17.0, 202), 22.8, 25.8, None),
              ((93.5, 17.0, 196), 21.6, 24.8, down), ((94.6, 17.0, 193.5), 19.4, 23.0, down), ((95, 17.0, 189), 19.0, 22.6, down),
              ((95, 17.0, 181), 19.0, 22.6, down), ((95, 17.0, 178.8), 18.0, 21.6, down), ((95, 17.0, 178.2), 14.5, 17.5, down),
              ((95, 17.0, 179), 11, 12.5, down)]
    for side in (1, -1):
        b2 = bmesh.new()
        loft_bm(b2, [sec(c, a, b, e=2.2, t=t) for c, a, b, t in sleeve], n=40, ref=(1, 0, 0))
        if side < 0:
            mirror_bm(b2)
        merge_bm(bm, b2)
    # torse et manches fondus en un seul volume moulé (épaules tombantes, sans pli d'emboîtement)
    sweat = mesh_object('Sweat', bm, [M['sweat']], subsurf=1)
    apply_modifiers(sweat)
    rm = sweat.modifiers.new('Remesh', 'REMESH')
    rm.mode, rm.voxel_size, rm.use_smooth_shade = 'VOXEL', 0.9, True
    sm = sweat.modifiers.new('Smooth', 'SMOOTH')
    sm.factor, sm.iterations = 0.5, 4
    apply_modifiers(sweat)
    displace(sweat, sweat_folds)
    # col côtelé, ajouté après la fusion pour garder son arête nette
    ring = []
    for j in range(48):
        x, y = spt(2 * math.pi * j / 48, {'a': 24.6, 'b': 23.6, 'bb': 23.6, 'e': 2.2})
        ring.append(sec((x, y, 308.6), 3.3, 2.5, e=2.4, ref=(0, 0, 1)))
    bc = bmesh.new()
    loft_bm(bc, ring, n=16, closed=True, cap0=False, cap1=False)
    collar = mesh_object('_Col', bc, [M['sweat']], subsurf=2)
    apply_modifiers(collar)
    bm = bmesh.new()
    bm.from_mesh(sweat.data)
    bm.from_mesh(collar.data)
    bm.to_mesh(sweat.data)
    bm.free()
    bpy.data.objects.remove(collar)
    return sweat


def merge_bm(dst, src):
    me = bpy.data.meshes.new('_tmp')
    src.to_mesh(me)
    src.free()
    dst.from_mesh(me)
    bpy.data.meshes.remove(me)


def build_hands(M):
    bm = bmesh.new()
    C = Vector((95, 18, 154))
    R, gap_dir, gap = 14.5, math.radians(210), math.radians(36)
    a0, a1 = gap_dir + gap, gap_dir + 2 * math.pi - gap
    # arc du C, prolongé aux deux bouts par des sections qui s'amenuisent (extrémités arrondies)
    arc = [(a0 - math.radians(8), 0.45), (a0 - math.radians(4), 0.8)]
    arc += [(a0 + (a1 - a0) * k / 28, 1.0) for k in range(29)]
    arc += [(a1 + math.radians(4), 0.8), (a1 + math.radians(8), 0.45)]
    secs = []
    for al, f in arc:
        radial = Vector((math.cos(al), 0, math.sin(al)))
        secs.append(sec(C + radial * R, 8.8 * f, 13.5 * (0.6 + 0.4 * f), e=2.6, ref=radial,
                        t=Vector((-math.sin(al), 0, math.cos(al)))))
    wrist = [sec((95, 17, z), 9.0, 9.4, e=2.2) for z in (189, 181, 171)]
    for side in (1, -1):
        b2 = bmesh.new()
        loft_bm(b2, secs, n=32)
        loft_bm(b2, wrist, n=24, axis=(0, 0, -1))
        if side < 0:
            mirror_bm(b2)
        merge_bm(bm, b2)
    return mesh_object('Mains', bm, [M['skin']])


# jambe : (z, centre x, centre y, demi-largeur, demi-profondeur arrière, demi-profondeur avant)
LEG = [(140, 31, 0, 31, 46, 46), (118, 33, 0, 33, 47, 46), (95, 36, -1, 34, 49, 47), (70, 40, -1.5, 34.5, 52, 48.5),
       (54, 43, -2, 35, 54.5, 50), (47, 45, -2, 35.6, 56, 51), (41.5, 46, -2, 35, 56, 50.5), (37, 47, -2, 36, 57.5, 52),
       (33.6, 47, -2, 36, 57.5, 52), (32.0, 47, -2, 35, 56.5, 51), (32.6, 47, -2, 34, 56, 50.5), (34.5, 47, -2, 32, 55, 49)]  # rebord peu rentré : le talon ne le traverse pas


def stance(z):
    """Jambe droite à peine avancée (planche V3 : la jambe reste droite, c'est la basket qui dépasse)."""
    return -6 * min(1.0, max(0.0, (140 - z) / 106))


SHOE_FWD = -22  # avancée de la basket droite (moyenne des deux profils de la planche V3)


def leg_center(z):
    pts = [(r[0], r[1]) for r in LEG[:9]]
    if z >= pts[0][0]:
        return pts[0][1]
    for (z0, x0), (z1, x1) in zip(pts, pts[1:]):
        if z1 <= z <= z0:
            return x0 + (x1 - x0) * (z0 - z) / (z0 - z1)
    return pts[-1][1]


def displace(obj, fn):
    """Plis sculptés : chaque sommet est poussé le long de sa normale de fn(position, normale) px."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    moves = [(v, fn(v.co, v.normal)) for v in bm.verts]
    for v, d in moves:
        if d:
            v.co += v.normal * d
    bm.to_mesh(obj.data)
    bm.free()


def _g(x, w):
    return math.exp(-(x / w) ** 2)


def jean_folds(p, n):
    """Plis simples et lisibles : tassement en bas de jambe, genoux, arrière du genou, « moustaches » d'entrejambe."""
    side = 1 if p.x >= 0 else -1
    ax, z = abs(p.x), p.z
    d = 0.0
    if z < 145:
        cx = leg_center(z)
        cy = -1.5 + (stance(z) if side < 0 else 0)
        th = math.atan2(p.y - cy, ax - cx)
        # tassement sur la basket : deux plis obliques qui ne font pas tout le tour (pas d'anneaux réguliers)
        for z0, ph, amp in ((45.0, 0.9 * side, 1.3), (56.0, -1.4 * side, 1.0)):
            reach = 0.5 + 0.5 * math.cos(th - ph)
            d -= amp * reach * _g(z - (z0 + 4.5 * math.sin(th + ph)), 1.7)
            d += 0.5 * amp * reach * _g(z - (z0 + 4.5 * math.sin(th + ph)) - 3.6, 2.2)
        front, back = max(0.0, -n.y), max(0.0, n.y)
        for zk, sk in ((71.0, 1), (78.5, -1)):  # genoux : plis courts en arc, au centre de la jambe
            u = ax - cx
            d -= 1.2 * front * _g(u, 15) * _g(z - zk - 0.012 * u * u + 0.1 * sk * u, 1.5)
        for zk in (73.0, 80.0):  # arrière du genou
            d -= 0.9 * back * _g(z - zk, 1.7)
        if 100 < z < 142 and 5 < ax < 34:  # entrejambe
            for zc in (131.0, 123.0):
                d -= 0.85 * front * _g(z - (zc - 0.5 * (ax - 5)), 1.3)
    return d


def sweat_folds(p, n):
    """Plis de figurine : fronces au-dessus du poignet, pli du coude, bande du bas marquée, plis doux sur les flancs."""
    ax, z = abs(p.x), p.z
    d = 0.0
    if ax > 68 and z < 272:  # manches
        th = math.atan2(p.y - 17, ax - 90)
        # fronces au-dessus du poignet : deux plis obliques partiels
        for z0, ph, amp in ((202.0, 0.8, 1.1), (212.0, -1.3, 0.9)):
            reach = 0.5 + 0.5 * math.cos(th - ph)
            d -= amp * reach * _g(z - (z0 + 3.5 * math.sin(th + ph)), 1.5)
            d += 0.5 * amp * reach * _g(z - (z0 + 3.5 * math.sin(th + ph)) - 3.2, 2.0)
        inner = max(0.0, -n.y) + 0.5 * max(0.0, -n.x if p.x > 0 else n.x)
        d -= 1.2 * inner * _g(z - 236 - 0.15 * (ax - 85), 1.7)
        d -= 0.9 * _g(z - 193.5, 1.0)  # haut du poignet côtelé
    elif ax < 61 and z < 240:
        d -= 0.9 * _g(z - 197.0, 1.0)  # haut de la bande du bas
        if 200 < z < 224:
            d += 0.75 * math.sin(math.pi * (z - 200) / 24) * math.sin(2 * math.pi * (z - 200) / 9.5) * (ax / 61) ** 2
    return d


HEM_TILT_SIN = math.sin(math.radians(7))


def build_pants(M):
    bm = bmesh.new()
    pelvis = [(108, 30, 32), (115, 50, 46), (125, 57, 50), (140, 58, 50.5), (155, 56.5, 50), (167, 54, 49),
              (179, 51, 47.5), (191, 49, 46), (194, 44, 41)]
    loft_bm(bm, [sec((0, 0, z), a, b, e=2.8) for z, a, b in pelvis], n=64, axis=(0, 0, 1))
    for side in (1, -1):
        b2 = bmesh.new()
        tilt = [Vector((0, -HEM_TILT_SIN * k, -1)).normalized() for k in (0, 0, 0, 0, 0, 0.35, 0.7, 1, 1, 1, 1, 1)]
        # le pied droit (côté -X, construit en miroir) est avancé : stance(z) décale la jambe vers l'avant en descendant
        loft_bm(b2, [sec((x, y + (stance(z) if side < 0 else 0), z), a, b, bb_, e=2.3, t=t)
                     for (z, x, y, a, b, bb_), t in zip(LEG, tilt)], n=56, ref=(1, 0, 0))
        if side < 0:
            mirror_bm(b2)
        merge_bm(bm, b2)
    obj = mesh_object('Jean', bm, [M['jean']], subsurf=1)
    apply_modifiers(obj)
    rm = obj.modifiers.new('Remesh', 'REMESH')
    rm.mode, rm.voxel_size, rm.use_smooth_shade = 'VOXEL', 1.0, True
    sm = obj.modifiers.new('Smooth', 'SMOOTH')
    sm.factor, sm.iterations = 0.6, 6
    apply_modifiers(obj)
    displace(obj, jean_folds)
    return obj


# --- surpiqûres : tirets posés sur la surface par lancer de rayons
def dashes(bm, pts, dash=2.4, gap=1.3, r=0.36, lift=0.28):
    """pts : liste de (position, normale) le long d'une couture."""
    if len(pts) < 2:
        return
    acc = [0.0]
    for a, b in zip(pts, pts[1:]):
        acc.append(acc[-1] + (b[0] - a[0]).length)

    def at(d):
        for j in range(1, len(acc)):
            if acc[j] >= d:
                t = (d - acc[j - 1]) / max(acc[j] - acc[j - 1], 1e-6)
                return pts[j - 1][0].lerp(pts[j][0], t), pts[j - 1][1].lerp(pts[j][1], t).normalized()
        return pts[-1]

    d = gap * 0.5
    while d + dash <= acc[-1]:
        p0, n0 = at(d)
        p1, n1 = at(d + dash)
        t = (p1 - p0)
        if t.length < 1e-4:
            d += dash + gap
            continue
        t.normalize()
        nrm = (n0 + n1).normalized()
        side = nrm.cross(t).normalized()
        nrm = t.cross(side)
        rings = []
        for u, rr in ((0.0, 0.55), (0.25, 1.0), (0.75, 1.0), (1.0, 0.55)):
            c = p0.lerp(p1, u) + nrm * lift
            ring = []
            for k in range(6):
                an = 2 * math.pi * k / 6
                ring.append(bm.verts.new(c + side * math.cos(an) * r * rr + nrm * math.sin(an) * r * 0.65 * rr))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for k in range(6):
                bm.faces.new((a[k], a[(k + 1) % 6], b[(k + 1) % 6], b[k]))
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
        d += dash + gap


def project(tree, pts2d, mode, center=None):
    """Projette une polyligne 2D sur la surface. mode : 'front' (x,z), 'back' (x,z), 'left'/'right' (y,z),
    'inner+'/'inner-' (y,z depuis le plan X = 0), 'ring' (angle°, z autour de center)."""
    out = []
    dense = []
    for a, b in zip(pts2d, pts2d[1:]):
        L = math.dist(a, b)
        k = max(1, int(L / 0.5))
        for i in range(k):
            t = i / k
            dense.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    dense.append(pts2d[-1])
    for u, z in dense:
        if mode == 'front':
            o, d = Vector((u, -300, z)), Vector((0, 1, 0))
        elif mode == 'back':
            o, d = Vector((u, 300, z)), Vector((0, -1, 0))
        elif mode == 'left':
            o, d = Vector((300, u, z)), Vector((-1, 0, 0))
        elif mode == 'right':
            o, d = Vector((-300, u, z)), Vector((1, 0, 0))
        elif mode == 'inner+':
            o, d = Vector((0, u, z)), Vector((1, 0, 0))
        elif mode == 'inner-':
            o, d = Vector((0, u, z)), Vector((-1, 0, 0))
        else:
            an = math.radians(u)
            o, d = Vector((center[0], center[1], z)), Vector((math.sin(an), -math.cos(an), 0))
        hit = tree.ray_cast(o, d)
        if hit[0] is not None:
            out.append((hit[0], hit[1]))
    return out


def offset2d(pts, dist):
    out = []
    for i, p in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, tz) or 1
        out.append((p[0] - tz / L * dist, p[1] + tx / L * dist))
    return out


def build_stitches(pants, M):
    tree = bvh(pants)
    bm = bmesh.new()

    def seam(pts, mode, double=1.7, center=None):
        dashes(bm, project(tree, pts, mode, center))
        if double:
            dashes(bm, project(tree, offset2d(pts, double), mode, center))

    for s in (1, -1):
        m = lambda P: [(x * s, z) for x, z in P]
        # poches avant (ouverture en J)
        seam(m([(20.5, 167), (22.5, 158), (27, 150.5), (35, 144.5), (44, 140.6), (52, 139.4)]), 'front', 1.6 * s)
        # poches arrière (empiècement plaqué)
        pocket = [(13, 147), (44, 147), (43, 123), (28.5, 114), (14, 123), (13, 147)]
        seam(m(pocket), 'back', -1.7 * s)
        seam(m([(13, 144.5), (44, 144.5)]), 'back', 0)
        # empiècement dos (V)
        seam(m([(0, 151.5), (25, 156.5), (54, 161)]), 'back', 1.7 * s)
        # coutures latérales et intérieures
        seam([(1.5, 178), (1.5, 150), (1.0, 110), (0.5, 70), (0, 36)], 'left' if s > 0 else 'right', 1.6)
        seam([(0, 113), (-0.5, 80), (-1, 36)], 'inner+' if s > 0 else 'inner-', 1.6)
        # ourlets
        for z in (36.6, 34.8):  # ourlet incliné comme la jambe (plus haut devant)
            seam([(a, z + 50 * math.tan(math.asin(HEM_TILT_SIN)) * math.cos(math.radians(a))) for a in range(0, 361, 3)],
                 'ring', 0, center=(LEG[-1][1] * s, -2 + (stance(30) if s < 0 else 0)))
    # braguette (J) et couture centrale
    seam([(-6.5, 167), (-6.5, 146), (-5.6, 139), (-3, 135.2), (0, 134.4)], 'front', 1.6)
    seam([(0, 134), (0, 117)], 'front', 0)
    seam([(0, 151), (0, 117)], 'back', 1.6)
    return mesh_object('Surpiqures', bm, [M['thread']], subsurf=0)


def build_belt(pants, M):
    tree = bvh(pants)
    zc, hh, th = 179.0, 7.0, 1.6
    N = 96
    path = []
    for k in range(N):
        an = math.radians(180 + 360 * k / N)  # couture au dos, devant à u = 0,5
        d = Vector((math.sin(an), -math.cos(an), 0))
        hit = tree.ray_cast(Vector((0, 0, zc)) + d * 200, -d)
        path.append(hit[0] + hit[1] * (th + 0.25))
    secs = [sec(p, hh, th, e=6.0, ref=(0, 0, 1)) for p in path]

    def uv(i, j, x, y, p, u, v):
        return (i / N, x / (2 * hh) + 0.5)

    bm = bmesh.new()
    loft_bm(bm, secs, n=24, closed=True, uv_fn=uv)
    belt = mesh_object('Ceinture', bm, [M['belt']], subsurf=1)

    # pointe : sort de la boucle vers la gauche du personnage (+X)
    btree = bvh(belt)
    tail = []
    for k in range(0, 31):
        an = math.radians(-4 + k * 1.25)
        d = Vector((math.sin(an), -math.cos(an), 0))
        hit = btree.ray_cast(Vector((0, 0, zc)) + d * 200, -d)
        tail.append((hit[0] + hit[1] * 1.15, an))
    tsecs = [sec(p, hh * 0.9, 0.95, e=6.0, ref=(0, 0, 1)) for p, _ in tail]
    bm = bmesh.new()
    loft_bm(bm, tsecs, n=20, uv_fn=lambda i, j, x, y, p, u, v: (i / (len(tsecs) - 1), x / (2 * hh * 0.9) + 0.5))
    tail_obj = mesh_object('Ceinture_Pointe', bm, [M['belt_tail']], subsurf=1)

    # boucle dorée : cadre arrondi + ardillon, posée devant
    front = btree.ray_cast(Vector((-1.5, -200, zc)), Vector((0, 1, 0)))
    c0 = front[0] + Vector((0, -3.6, 0))
    bm = bmesh.new()
    w, h = 8.2, 7.6
    frame = []
    for k in range(64):
        an = 2 * math.pi * k / 64
        x, z = spt(an, {'a': w, 'b': h, 'bb': h, 'e': 5.0})
        frame.append(sec(c0 + Vector((x, 0, z)), 1.15, 1.5, e=2.2, ref=(0, -1, 0)))
    loft_bm(bm, frame, n=12, closed=True)
    prong = [sec(c0 + Vector((x, -0.4 - 0.25 * (1 - abs(x) / w), 0)), 0.85, 0.85, ref=(0, 0, 1))
             for x in (-w - 0.6, -w, -w * 0.4, w * 0.3, w * 0.95)]
    loft_bm(bm, prong, n=10)
    buckle = mesh_object('Boucle', bm, [M['gold']], subsurf=1)

    # passants du jean
    ptree = bvh(belt, tail_obj)
    loops = bmesh.new()
    for adeg in (-30, 31, -86, 86, -148, 148, 180):
        an = math.radians(adeg)
        d = Vector((math.sin(an), -math.cos(an), 0))
        tangent = Vector((math.cos(an), math.sin(an), 0))
        pts = []
        for z, src in ((166.5, tree), (172.8, ptree), (179, ptree), (185.2, ptree), (190.5, tree)):
            hit = src.ray_cast(Vector((0, 0, z)) + d * 200, -d)
            pts.append(hit[0] + hit[1] * 1.15)
        loft_bm(loops, [sec(p, 3.1, 1.05, e=5.0, ref=tangent) for p in pts], n=16)
    loop_obj = mesh_object('Passants', loops, [M['jean']], subsurf=1)
    return belt, tail_obj, buckle, loop_obj


def panel(bm, tree, rows, upper, n=28, lift=0.3, closed=False):
    """Empiècement de basket à contour net : pour chaque hauteur (z d'origine, θ début°, θ fin°), une rangée de points
    pris sur la section de la tige, recollés sur la surface lissée (point le plus proche) puis décollés de lift."""
    def section(z):
        for (z0, *v0), (z1, *v1) in zip(upper, upper[1:]):
            if z0 <= z <= z1:
                t = (z - z0) / (z1 - z0)
                a, bf, bb = (u + (w - u) * t for u, w in zip(v0, v1))
                return {'a': a, 'b': bf, 'bb': bb, 'e': 2.6}
        raise ValueError(z)

    grid = {}
    m = n if closed else n + 1
    for i, (z, t0, t1) in enumerate(rows):
        sc = section(z)
        for j in range(m):
            x, y = spt(math.radians(t0 + (t1 - t0) * j / n), sc)
            loc, nrm, _, _ = tree.find_nearest(Vector((x, y, 11.5 + (z - 10) * 1.2)))
            grid[i, j] = (bm.verts.new(loc + nrm * lift), (0, 0), nrm)
    for i in range(len(rows) - 1):
        for j in range(n):
            q = [(i, j), (i, (j + 1) % m), (i + 1, (j + 1) % m), (i + 1, j)]
            f = bm.faces.new([grid[p][0] for p in q])
            f.normal_update()
            if f.normal.dot(sum((grid[p][2] for p in q), Vector())) < 0:
                f.normal_flip()


def build_shoes(M):
    # tige : (z, demi-largeur, demi-longueur avant, demi-longueur arrière), z remis à l'échelle (semelle plus haute)
    upper = [(10, 30.5, 55.0, 54.5), (11.5, 31.0, 55.5, 55.0), (18, 31.0, 55.2, 55.0), (23, 30.4, 53.8, 54.5),
             (27, 29.2, 50.5, 54.0), (31, 27.4, 45.0, 53.2), (35, 25.0, 37.0, 52.2), (38.5, 22.0, 27.0, 50.5),
             (41.5, 18.5, 16.0, 48.5), (43.5, 14.0, 6.0, 45.0), (44.5, 8.5, 1.0, 37.0)]
    # semelle épaisse avec rainure
    sole = [(0.0, 32.0, 57.0, 56.0), (0.9, 33.3, 58.3, 57.3), (5.5, 33.5, 58.5, 57.5), (6.6, 32.7, 57.7, 56.7),
            (7.6, 32.7, 57.7, 56.7), (8.6, 33.5, 58.5, 57.5), (13.6, 33.5, 58.5, 57.5), (14.6, 32.5, 57.5, 56.5),
            (15.2, 29.5, 54.5, 53.5)]
    perf = M.get('perf') or plastic('Perforations', rgb(0.12, 0.12, 0.115), rough=0.8, coat=0.0)
    M['perf'] = perf
    objs = {}
    for side in (1, -1):
        name = 'G' if side > 0 else 'D'
        # construction en repère local de la chaussure (pied gauche), puis miroir et placement
        bu = bmesh.new()
        loft_bm(bu, [sec((0, 0, 11.5 + (z - 10) * 1.2), a, bf, bb, e=2.6) for z, a, bf, bb in upper], n=64,
                axis=(0, 0, 1), uv_fn=lambda i, j, x, y, p, u, v: (u, (p.z - 11.5) / 41.4))
        bs = bmesh.new()
        loft_bm(bs, [sec((0, 0, z), a, bf, bb, e=2.6) for z, a, bf, bb in sole], n=64, axis=(0, 0, 1),
                uv_fn=lambda i, j, x, y, p, u, v: (u, p.z / 15.2))
        up = mesh_object('Basket_' + name, bu, [M['shoe']])
        apply_modifiers(up)
        so = mesh_object('Semelle_' + name, bs, [M['sole']])
        tree = bvh(up)

        # empiècements (θ : 0° = côté extérieur +X, 90° = talon, 270° = bout)
        def toe(p):
            return p.z > 19.0 and p.y < -30 - 10 * (abs(p.x) / 28) ** 2

        bo = bmesh.new()
        ups = [r for r in upper]
        # pare-boue : bande tout autour, au-dessus de la semelle
        panel(bo, tree, [(z, 0, 360) for z in (10.9, 12.5, 14.3, 16.0)], ups, n=96, closed=True)
        # bout rapporté : arc qui se resserre en montant sur le cou-de-pied
        panel(bo, tree, [(z, 270 - hw, 270 + hw) for z, hw in
                         ((16.3, 66), (19, 63), (22, 58), (25, 50), (28, 41), (30.5, 32), (32.5, 22))], ups, n=36)
        # contrefort du talon
        panel(bo, tree, [(z, 90 - hw, 90 + hw) for z, hw in
                         ((16.3, 48), (19, 46), (22, 44), (28, 38), (34, 32), (39, 27), (42.5, 22))], ups, n=30)
        # panneaux latéraux (zone de la virgule, sans logo)
        for c, k in ((0, 1), (180, -1)):  # k : sens vers le talon
            panel(bo, tree, [(z, c - hw * k * 0.85, c + hw * k) for z, hw in
                             ((16.6, 30), (20, 29), (24, 26), (28, 21), (31, 14))], ups, n=26)
        # œilletage : deux bandes de part et d'autre de la languette
        for t0, t1 in ((286, 300), (240, 254)):
            panel(bo, tree, [(z, t0 + (z - 31) * 0.9 * (1 if t0 > 270 else -1), t1 + (z - 31) * 0.9 * (1 if t0 > 270 else -1))
                             for z in (31, 34, 37, 39.5, 41.5, 43)], ups, n=8)
        renf = mesh_object('Basket_Renforts_' + name, bo, [M['shoe']], subsurf=1, recalc=False)
        sol = renf.modifiers.new('Epaisseur', 'SOLIDIFY')
        sol.thickness, sol.offset, sol.use_even_offset = 0.85, 1.0, True
        renf.modifiers.move(1, 0)

        def hit_down(x, y):
            return tree.ray_cast(Vector((x, y, 120)), Vector((0, 0, -1)))

        # perforations du bout (sur le renfort : décalage = lift + épaisseur)
        bp = bmesh.new()
        for row, y in enumerate((-50, -46, -42, -38)):
            for x in [v + (1.6 if row % 2 else 0) for v in range(-14, 15, 4)]:
                h = hit_down(x, y)
                if h[0] is None or not toe(h[0]):
                    continue
                nrm = h[1]
                t1 = nrm.orthogonal().normalized()
                t2 = nrm.cross(t1)
                c = h[0] + nrm * 1.3
                ring = [bp.verts.new(c + (t1 * math.cos(a) + t2 * math.sin(a)) * 0.8)
                        for a in (2 * math.pi * k / 8 for k in range(8))]
                f = bp.faces.new(ring)
                f.normal_update()
                if f.normal.dot(nrm) < 0:
                    f.normal_flip()
        holes = mesh_object('Perforations_' + name, bp, [perf], subsurf=0, recalc=False)

        # languette, lacets plats et œillets
        bl = bmesh.new()
        tongue = []
        for y in range(-33, 8, 3):
            h = hit_down(0, y)
            if h[0] is not None:
                tongue.append(sec(h[0] + h[1] * 0.35, 6.0, 0.7, e=4.0, ref=(1, 0, 0)))
        loft_bm(bl, tongue, n=16)
        for y in (-27.0, -20.5, -14.0, -7.5):
            path = []
            for x in range(-10, 11):
                h = hit_down(x, y)
                if h[0] is not None:
                    path.append(sec(h[0] + h[1] * (1.6 if abs(x) > 6 else 1.25), 0.7, 1.6, e=2.2, ref=h[1]))
            if len(path) > 2:
                loft_bm(bl, path, n=10)
            for x in (-10.5, 10.5):
                h = hit_down(x, y)
                if h[0] is None:
                    continue
                nrm = h[1]
                t1 = nrm.orthogonal().normalized()
                t2 = nrm.cross(t1)
                ring = [sec(h[0] + nrm * 1.25 + (t1 * math.cos(2 * math.pi * k / 16) + t2 * math.sin(2 * math.pi * k / 16)) * 1.5,
                            0.45, 0.45, ref=nrm) for k in range(16)]
                loft_bm(bl, ring, n=8, closed=True)
        laces = mesh_object('Lacets_' + name, bl, [M['lace']], subsurf=1)

        place = Matrix.Translation((51 * side, -7 + (SHOE_FWD + 4 if side < 0 else 0), 0))  # talon gauche dans l'ourlet @ Matrix.Rotation(math.radians(5 * side), 4, 'Z')
        for o in (up, so, renf, holes, laces):
            if side < 0:
                o.data.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
                o.data.flip_normals()
            o.data.transform(place)
        objs[name] = (up, so, renf, holes, laces)
    return objs


# ----------------------------------------------------------------------------------------------
# Studio
# ----------------------------------------------------------------------------------------------
def build_studio():
    st = collection('Studio')
    # le studio (fond, lumières, caméra) pivote autour de la figurine pour chaque vue
    pivot = bpy.data.objects.new('Studio_Pivot', None)
    st.objects.link(pivot)

    def add(obj):
        st.objects.link(obj)
        obj.parent = pivot
        return obj

    # cyclorama : sol + arrondi + fond, rouge profond
    bm = bmesh.new()
    prof = [(-8, Z0), (1.0, Z0)]
    for k in range(1, 13):
        a = math.radians(90 * k / 12)
        prof.append((1.0 + 1.6 * math.sin(a), Z0 + 1.6 * (1 - math.cos(a))))
    prof.append((2.6, Z0 + 6))
    rows = [[bm.verts.new((x, y, z)) for y, z in prof] for x in (-9, 9)]
    for i in range(len(prof) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    me = bpy.data.meshes.new('Cyclorama')
    bm.to_mesh(me)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    cyc = add(bpy.data.objects.new('Cyclorama', me))
    m = NT('Fond_Studio')
    m.set(Base_Color=rgb(0.012, 0.0008, 0.001), Roughness=0.3, Specular_IOR_Level=0.35)
    me.materials.append(m.mat)

    def area(name, loc, target, power, size, color=(1, 1, 1)):
        L = bpy.data.lights.new(name, 'AREA')
        L.energy, L.size, L.color = power, size, color
        o = add(bpy.data.objects.new(name, L))
        o.location = loc
        d = Vector(target) - Vector(loc)
        o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        o.visible_camera = False
        return o

    area('Cle', (-2.4, -3.2, 1.9), (0, 0, 0.1), 260, 2.2)
    area('Debouchage', (2.8, -2.6, 0.5), (0, 0, 0.0), 55, 2.5)
    area('Contre_G', (-2.2, 2.0, 1.4), (0, 0, 0.2), 160, 1.2)
    area('Contre_D', (2.2, 2.0, 1.4), (0, 0, 0.2), 160, 1.2)
    area('Dessus', (0, -0.6, 3.0), (0, 0, 0), 60, 2.0)
    glow = bpy.data.lights.new('Halo_Rouge', 'SPOT')
    glow.energy, glow.color, glow.spot_size, glow.spot_blend = 350, (1.0, 0.07, 0.05), math.radians(80), 1.0
    g = add(bpy.data.objects.new('Halo_Rouge', glow))
    g.location = (0, 0.9, -0.35)
    g.rotation_euler = (Vector((0, 2.7, 0.35)) - g.location).to_track_quat('-Z', 'Y').to_euler()

    cam = bpy.data.cameras.new('Camera')
    cam.lens, cam.sensor_fit, cam.sensor_height, cam.clip_end = 105, 'VERTICAL', 24, 100
    co = add(bpy.data.objects.new('Camera', cam))
    bpy.context.scene.camera = co
    w = bpy.context.scene.world or bpy.data.worlds.new('World')
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.0, 0.0, 0.0, 1)
    return co


def setup_render():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.exposure = -0.45
    try:
        sc.view_settings.look = 'Medium High Contrast'
    except TypeError:
        pass
    sc.render.resolution_x, sc.render.resolution_y = 600, 900
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'):
            try:
                prefs.compute_device_type = kind
                prefs.get_devices()
                if any(d.type == kind for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = True
                    sc.cycles.device = 'GPU'
                    return kind
            except TypeError:
                continue
    except KeyError:
        pass
    sc.cycles.device = 'CPU'
    return 'CPU'


# ----------------------------------------------------------------------------------------------
def build():
    global FIG, ROOT_OBJ
    reset_scene()
    FIG = collection('LoveFaith_Figure')
    ROOT_OBJ = bpy.data.objects.new('LoveFaith_Figure', None)
    ROOT_OBJ.empty_display_type = 'ARROWS'
    ROOT_OBJ.scale = (S, S, S)
    ROOT_OBJ.location = (0, 0, Z0)
    FIG.objects.link(ROOT_OBJ)
    M = make_materials()
    head, neck = build_head(M)
    face_decals(head, M)
    beanie = build_beanie(M)
    beanie_decals(beanie, M)
    build_sweat(M)
    build_hands(M)
    pants = build_pants(M)
    build_stitches(pants, M)
    build_belt(pants, M)
    build_shoes(M)
    build_studio()
    device = setup_render()
    return {'device': device, 'objects': sorted(o.name for o in FIG.objects)}


__result__ = build()
