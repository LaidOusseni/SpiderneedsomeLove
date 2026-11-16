"""
mcp_session.py — Finition de la figurine dans un Blender OUVERT, via le serveur MCP Blender
(https://github.com/djeada/blender-mcp-server, extension « Blender MCP Bridge » à l'écoute sur 127.0.0.1:9876).

    <python du serveur MCP> scripts/figurine/mcp_session.py <entrée.glb> <dossier de sortie> [--no-render]

Chaque opération est un appel d'outil MCP :
  blender_python_exec   étapes de blender_finish.py (chargement, mains, manchettes, ceinture, col, semelles, matériaux,
                        studio, application des modificateurs, export, sauvegarde .blend, vérification par réimport)
  blender_render_still  les 6 rendus de contrôle aux angles de la planche
  blender_scene_list_objects / blender_material_list   contrôle de la scène

Sorties dans <dossier> : LoveFaith_Playmobil_Final.blend, LoveFaith_Playmobil_Final_blender.glb (export brut),
rendus/controle-<vue>.png.
"""
import asyncio
import json
import os
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.environ.get('BLENDER_MCP_SERVER', r'D:\dev-cache\blender-mcp-server\.venv\Scripts\blender-mcp-server.exe')
VIEWS = ['face', 'trois-quarts-avant', 'profil-gauche', 'dos', 'profil-droit', 'trois-quarts-arriere']


async def main():
    src, out_dir = (os.path.abspath(p) for p in sys.argv[1:3])
    render = '--no-render' not in sys.argv
    os.makedirs(os.path.join(out_dir, 'rendus'), exist_ok=True)
    code = open(os.path.join(HERE, 'blender_finish.py'), encoding='utf-8').read()
    blend = os.path.join(out_dir, 'LoveFaith_Playmobil_Final.blend').replace('\\', '/')
    glb = os.path.join(out_dir, 'LoveFaith_Playmobil_Final_blender.glb').replace('\\', '/')

    params = StdioServerParameters(command=SERVER, args=[], env={**os.environ})
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()

            async def call(tool, args, label=None):
                res = await s.call_tool(tool, args)
                text = '\n'.join(c.text for c in res.content if hasattr(c, 'text'))
                print(f'[MCP] {tool}{" · " + label if label else ""} : {"ERREUR" if res.isError else "ok"}')
                try:
                    data = json.loads(text)
                except ValueError:
                    data = text
                if res.isError or (isinstance(data, dict) and data.get('error')):
                    print(text[:4000])
                    sys.exit(1)
                return data

            async def step(name, **extra):
                data = await call('blender_python_exec', {'code': code, 'args': {'step': name, **extra}, 'timeout_seconds': 300}, name)
                result = data.get('result') if isinstance(data, dict) else data
                if result:
                    print('       ', json.dumps(result, ensure_ascii=False)[:1500])
                return result

            await step('load', src=src.replace('\\', '/'))
            await step('finish')
            await step('playmobil')
            await step('proportions')
            objs = await call('blender_scene_list_objects', {'object_type': 'MESH'})
            print('        objets :', ', '.join(o['name'] for o in objs['objects']))
            mats = await call('blender_material_list', {})
            print('        matériaux :', ', '.join(m['name'] for m in mats['materials'] if m['user_count']))
            if render:
                for view in VIEWS:
                    await step('studio', view=view)
                    out = os.path.join(out_dir, 'rendus', f'controle-{view}.png').replace('\\', '/')
                    await call('blender_render_still', {'output_path': out, 'engine': 'CYCLES'}, view)
            await call('blender_python_exec', {'code': f"import bpy\nbpy.ops.wm.save_as_mainfile(filepath={blend!r}, copy=True)\n__result__ = {blend!r}",
                                               'timeout_seconds': 120}, 'sauvegarde .blend')
            await step('bake')
            await step('export', out=glb)
            await step('verify', src=glb)


asyncio.run(main())
