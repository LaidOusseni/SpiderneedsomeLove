/**
 * « Mockups/Personnage 3D.glb » → figurine Love&Faith finie (site + livrables).
 *
 *   node scripts/figurine/run.cjs            construit le GLB + les textures
 *   node scripts/figurine/run.cjs --preview  + rendus Cycles (Blender) et aperçus Three.js du GLB RÉIMPORTÉ
 *
 * 1. build.js (Chrome sans interface) : corrections de forme, découpage, allègement, UV, cuisson des textures ;
 * 2. blender_finish.py (Blender sans interface) : mains Playmobil, boucle, passants, matériaux, export, rendus ;
 * 3. compress.mjs : compression meshopt pour le web.
 * Aucun serveur n'est ouvert (requêtes vers http://glb.local/ interceptées).
 * Prérequis : Google Chrome (CHROME_PATH), Blender 4.2+ (BLENDER_PATH), dépendances du projet.
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_GLB = path.join(ROOT, 'Mockups', 'LoveFaith_Playmobil_Final.glb'); // la version précédente (…_Textured.glb) est conservée
const OUT_SITE = path.join(ROOT, 'public', 'models', 'lovefaith-figure.glb'); // modèle utilisé par la vue 3D du site
const OUT_TEX = path.join(ROOT, 'Mockups', 'LoveFaith_Playmobil_Textures');
const OUT_PREVIEW = path.join(ROOT, 'Mockups', 'LoveFaith_Playmobil_Apercus');
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TMP = process.env.LF_TMP ?? 'D:\\dev-cache\\tmp';
const BLENDER = process.env.BLENDER_PATH ?? (fs.existsSync('D:\\blender.exe') ? 'D:\\blender.exe' : 'blender');
const STAGE1 = path.join(TMP, 'lovefaith-1-texture.glb'); // sortie de build.js
const STAGE2 = path.join(TMP, 'lovefaith-2-blender.glb'); // sortie de Blender
fs.mkdirSync(TMP, { recursive: true });

// Fichiers servis à la page (chemin d'URL → fichier local)
const ROUTES = {
  '/source.glb': path.join(ROOT, 'Mockups', 'Personnage 3D.glb'),
  '/kiss.png': path.join(ROOT, 'public', 'brand', 'beanie-kiss.png'),
  '/build.js': path.join(__dirname, 'build.js'),
  '/classify.js': path.join(__dirname, 'classify.js'),
  '/result.glb': OUT_GLB,
};
const resolve = (p) => {
  if (ROUTES[p]) return ROUTES[p];
  if (p === '/lib/three.module.js') return path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js');
  if (p.startsWith('/lib/meshopt/')) return path.join(ROOT, 'node_modules', 'meshoptimizer', p.slice(13));
  if (p.startsWith('/lib/jsm/')) return path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm', p.slice(9));
  return null;
};
const TYPES = { '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png', '.wasm': 'application/wasm' };
const IMPORTMAP = '<script type="importmap">{"imports":{"three":"/lib/three.module.js","three/addons/":"/lib/jsm/"}}</script>';

async function openPage(html) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 900000,
    userDataDir: fs.mkdtempSync(path.join(TMP, 'lf-figurine-')),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  page.on('console', (m) => !/404/.test(m.text()) && console.log('  ', m.text()));
  page.on('pageerror', (e) => { console.error('  [erreur]', e.message); process.exit(1); }); // pas d'attente inutile
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.host !== 'glb.local') return r.continue();
    if (u.pathname === '/index.html') return r.respond({ status: 200, contentType: 'text/html', body: html });
    const f = resolve(decodeURIComponent(u.pathname));
    if (!f || !fs.existsSync(f)) return r.respond({ status: 404, body: '' });
    r.respond({ status: 200, contentType: TYPES[path.extname(f)] ?? 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await page.goto('http://glb.local/index.html');
  return { browser, page };
}

async function build() {
  console.log('Construction…');
  const { browser, page } = await openPage(`<!doctype html><body>${IMPORTMAP}<script type="module" src="/build.js"></script>`);
  await page.waitForFunction('window.result', { timeout: 900000, polling: 2000 });
  fs.writeFileSync(STAGE1, Buffer.from(await page.evaluate('window.result.glb'), 'base64'));
  fs.mkdirSync(OUT_TEX, { recursive: true });
  for (const [k, v] of Object.entries(await page.evaluate('window.result.textures'))) {
    fs.writeFileSync(path.join(OUT_TEX, `${k}.jpg`), Buffer.from(v.split(',')[1], 'base64'));
  }
  await browser.close();
}

/** Finition dans Blender (géométrie, matériaux, export ; rendus Cycles si demandés). */
function blender(renders) {
  console.log('Blender…');
  if (fs.existsSync(STAGE2)) fs.unlinkSync(STAGE2);
  const args = ['-b', '--factory-startup', '--python-exit-code', '1', '--python', path.join(__dirname, 'blender_finish.py'), '--', STAGE1, STAGE2];
  if (renders) args.push(OUT_PREVIEW);
  const r = require('child_process').spawnSync(BLENDER, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lines = `${r.stdout}\n${r.stderr}`.split('\n');
  lines.filter((l) => /manchette|export :|rendus :|Error|Traceback|error/i.test(l)).forEach((l) => console.log('  ', l.trim()));
  if (r.status !== 0 || !fs.existsSync(STAGE2)) { console.error(lines.slice(-30).join('\n')); process.exit(1); }
}

async function compress() {
  const { compressGlb } = await import('./compress.mjs');
  const { before, after } = await compressGlb(STAGE2, OUT_GLB);
  fs.mkdirSync(path.dirname(OUT_SITE), { recursive: true });
  fs.copyFileSync(OUT_GLB, OUT_SITE);
  console.log('→', path.relative(ROOT, OUT_GLB), '+', path.relative(ROOT, OUT_SITE),
    `(${(fs.statSync(OUT_GLB).size / 1048576).toFixed(2)} Mo ; géométrie ${(before / 1048576).toFixed(1)} → ${(after / 1048576).toFixed(1)} Mo)`);
}

/** Aperçus : le GLB exporté est RÉIMPORTÉ avec GLTFLoader, puis rendu. */
async function preview() {
  const views = { 'vues-face-34-profil-dos': [[0, 0, 0, 2.2, 3, 0], [0, 0, 0, 2.2, 3, -45], [0, 0, 0, 2.2, 3, -90], [0, 0, 0, 2.2, 3, 180]],
    'gros-plans': [[0, 0.31, 0, 0.42, 8, 0], [0, 0.36, 0, 0.5, 15, -35], [0, 0.38, 0, 0.5, 10, 180], [0, -0.13, 0, 0.42, 10, 20]] };
  fs.mkdirSync(OUT_PREVIEW, { recursive: true });
  for (const [name, spec] of Object.entries(views)) {
    const html = `<!doctype html><body style="margin:0">${IMPORTMAP}<script type="module">
import * as THREE from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
const views=${JSON.stringify(spec)};const W=520,H=${name === 'gros-plans' ? 520 : 820};
const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(W*views.length,H);document.body.appendChild(r.domElement);r.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#2a0408');const pm=new THREE.PMREMGenerator(r);scene.environment=pm.fromScene(new RoomEnvironment(),0.04).texture;scene.environmentIntensity=0.6;
scene.add(new THREE.HemisphereLight('#fff','#300',0.6));const d=new THREE.DirectionalLight('#fff',2.2);d.position.set(-1.5,2,2.5);scene.add(d);
const g=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/result.glb');scene.add(g.scene);
const parts=[];g.scene.traverse(o=>o.isMesh&&parts.push(o.name+':'+o.material.name+(o.material.map?' (texture)':'')+' '+o.geometry.index.count/3));console.log('réimport :',parts.join(', '));
views.forEach(([tx,ty,tz,dist,el,az],i)=>{const cam=new THREE.PerspectiveCamera(30,W/H,0.005,20);const e=el*Math.PI/180,a=az*Math.PI/180;
cam.position.set(tx+Math.sin(a)*Math.cos(e)*dist,ty+Math.sin(e)*dist,tz+Math.cos(a)*Math.cos(e)*dist);cam.lookAt(tx,ty,tz);
r.setViewport(i*W,0,W,H);r.setScissor(i*W,0,W,H);r.setScissorTest(true);r.render(scene,cam)});
window.done=r.domElement.toDataURL('image/png');</script>`;
    const { browser, page } = await openPage(html);
    await page.waitForFunction('window.done', { timeout: 300000 });
    fs.writeFileSync(path.join(OUT_PREVIEW, `${name}.png`), Buffer.from((await page.evaluate('window.done')).split(',')[1], 'base64'));
    await browser.close();
  }
  console.log('→', path.relative(ROOT, OUT_PREVIEW));
}

(async () => {
  const withPreview = process.argv.includes('--preview');
  await build();
  fs.mkdirSync(OUT_PREVIEW, { recursive: true });
  blender(withPreview);
  await compress();
  if (withPreview) await preview();
})().catch((e) => { console.error(e); process.exit(1); });
