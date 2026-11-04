"""
Export GLB de la figurine (à lancer en arrière-plan sur le .blend enregistré : le fichier maître n'est pas modifié).
- Les matières procédurales (Bonnet, Jean) sont cuites en textures de couleur (bake EMIT) ;
- les passants sont fusionnés au jean ;
- la subdivision est exportée au niveau 1 (poids adapté au web) ;
- seuls les objets de la collection LoveFaith_Figure sont exportés, sous l'Empty racine (1 unité de haut).
args : {"out": chemin .glb, "bake_size": 2048}
"""
import bpy
import os

A = globals().get('args', {}) or {}
DIR = os.path.dirname(bpy.data.filepath)
OUT = A.get('out') or os.path.join(DIR, 'LoveFaith_Playmobil_V2.glb')
SIZE = A.get('bake_size', 2048)
TEX = os.path.join(DIR, 'textures')

sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 4
figure = bpy.data.collections['LoveFaith_Figure']


def select_only(objs, active):
    for o in sc.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def bake_color(obj, name, size):
    """Cuisson de la couleur de base : la sortie « Base Color » du Principled est rebranchée sur une émission."""
    mat = obj.data.materials[0]
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    src = bsdf.inputs['Base Color'].links[0].from_socket
    emit = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(src, emit.inputs['Color'])
    nt.links.new(emit.outputs[0], out.inputs['Surface'])
    img = bpy.data.images.new(name, size, size)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    select_only([obj], obj)
    bpy.ops.object.bake(type='EMIT', margin=8)
    img.filepath_raw = os.path.join(TEX, name + '.jpg')
    img.file_format = 'JPEG'
    img.save()
    # matière exportée : couleur cuite + réglages du Principled
    nt.links.new(bsdf.outputs[0], out.inputs['Surface'])
    nt.nodes.remove(emit)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    for n in list(nt.nodes):
        if n.type == 'BUMP':
            nt.nodes.remove(n)
    return img


# --- jean : passants fusionnés, UV automatiques, couleur cuite
jean, loops = bpy.data.objects['Jean'], bpy.data.objects['Passants']
select_only([loops], loops)
bpy.ops.object.convert(target='MESH')  # applique la subdivision des passants avant la fusion
select_only([jean, loops], jean)
bpy.ops.object.join()
jean = bpy.context.view_layer.objects.active
# remaillage voxel très dense : décimation (surface lisse, perte invisible)
dec = jean.modifiers.new('Decimate', 'DECIMATE')
dec.ratio = A.get('jean_ratio', 0.18)
bpy.ops.object.convert(target='MESH')
while jean.data.uv_layers:
    jean.data.uv_layers.remove(jean.data.uv_layers[0])
jean.data.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
bake_color(jean, 'jean_basecolor', SIZE)

# --- sweat (fusion voxel dense) : décimation pour le web
sweat = bpy.data.objects['Sweat']
dec = sweat.modifiers.new('Decimate', 'DECIMATE')
dec.ratio = A.get('sweat_ratio', 0.3)
select_only([sweat], sweat)
bpy.ops.object.convert(target='MESH')

# --- bonnet (UV cylindriques du loft)
bake_color(bpy.data.objects['Bonnet'], 'bonnet_basecolor', SIZE)

# --- poids web : subdivision au niveau 1
for o in figure.objects:
    for m in o.modifiers:
        if m.type == 'SUBSURF':
            m.levels = 1
# relief procédural du sweat non exportable : on le retire (couleur unie, le site recolore ce maillage)
for mat in bpy.data.materials:
    if mat.name in ('Sweat',):
        for n in list(mat.node_tree.nodes):
            if n.type == 'BUMP':
                mat.node_tree.nodes.remove(n)

select_only(list(figure.objects), bpy.data.objects['LoveFaith_Figure'])
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True,
                          export_yup=True, export_image_format='AUTO')
dg = bpy.context.evaluated_depsgraph_get()
tris = sum(sum(len(p.vertices) - 2 for p in o.evaluated_get(dg).data.polygons)
           for o in figure.objects if o.type == 'MESH')
__result__ = {'glb': OUT, 'size_mb': round(os.path.getsize(OUT) / 1e6, 2), 'triangles': tris}
