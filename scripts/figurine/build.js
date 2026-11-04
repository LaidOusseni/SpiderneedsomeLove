/**
 * build.js — « Personnage 3D.glb » → figurine Love&Faith texturée, prête pour le web.
 * Exécuté dans Chrome (canvas, polices, décodage d'images) par run.cjs.
 *
 * La silhouette d'origine est conservée. Seules corrections de forme, locales :
 *  - visage lissé (lèvres sculptées en relief supprimées : le visage est imprimé, comme une figurine) ;
 *  - ovale sculpté du bonnet aplani (il était en miroir de la planche) : le bisou est imprimé à sa place.
 * Puis : frontières de couleur découpées au plus près des limites réelles (plus de dents de scie),
 * allègement par partie (bords verrouillés → aucune fissure), UV, textures cuites depuis la position 3D,
 * GLB compressé (EXT_meshopt_compression).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptSimplifier } from '/lib/meshopt/meshopt_simplifier.js';
import { MeshoptEncoder } from '/lib/meshopt/meshopt_encoder.js';
import classify from '/classify.js';

const log = (...a) => console.log(...a);
const T0 = performance.now();
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

// ─── 1. Chargement ────────────────────────────────────────────────────────
const gltf = await new GLTFLoader().loadAsync('/source.glb');
const src = gltf.scene.getObjectByProperty('isMesh', true);
let P = Float32Array.from(src.geometry.attributes.position.array);
let I = src.geometry.index.array;
let NV = P.length / 3;

// Composantes connexes : on ne garde que la surface principale (7 débris de 8 à 20 sommets)
{
  const par = new Int32Array(NV).map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < I.length; t += 3) { const a = find(I[t]); par[find(I[t + 1])] = a; par[find(I[t + 2])] = a; }
  const cnt = new Map(); for (let i = 0; i < NV; i++) { const r = find(i); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const main = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const keep = []; for (let t = 0; t < I.length; t += 3) if (find(I[t]) === main) keep.push(I[t], I[t + 1], I[t + 2]);
  log('débris supprimés :', (I.length - keep.length) / 3, 'triangles');
  I = Uint32Array.from(keep);
}

// ─── 2. Outils géométriques ───────────────────────────────────────────────
/** Normales pondérées par l'aire. */
function normals(P, I) {
  const n = P.length / 3, N = new Float32Array(n * 3);
  for (let f = 0; f < I.length; f += 3) {
    const a = I[f], b = I[f + 1], c = I[f + 2];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { N[v * 3] += nx; N[v * 3 + 1] += ny; N[v * 3 + 2] += nz; }
  }
  for (let v = 0; v < n; v++) { const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1; N[v * 3] /= l; N[v * 3 + 1] /= l; N[v * 3 + 2] /= l; }
  return N;
}
/** Voisins de chaque sommet (format compact). */
function neighbours(I, n) {
  const deg = new Int32Array(n + 1);
  for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) deg[I[f + k] + 1] += 2;
  for (let v = 0; v < n; v++) deg[v + 1] += deg[v];
  const list = new Int32Array(deg[n]), fill = deg.slice(0, n);
  for (let f = 0; f < I.length; f += 3) for (let k = 0; k < 3; k++) {
    const a = I[f + k]; list[fill[a]++] = I[f + (k + 1) % 3]; list[fill[a]++] = I[f + (k + 2) % 3];
  }
  return { start: deg, list };
}
// transition douce de 0 (en e0) à 1 (en e1) ; e0 > e1 inverse le sens
const ramp = (e0, e1, t) => { const x = Math.min(1, Math.max(0, (t - e0) / (e1 - e0))); return x * x * (3 - 2 * x); };

/**
 * Surface lisse z = f(x, y) (polynôme) ajustée par moindres carrés sur une zone vue de face,
 * avec rejet des points trop éloignés (reliefs à effacer, tricot).
 */
function fitHeightField(select, U, V, du, dv) {
  const terms = []; for (let i = 0; i <= du; i++) for (let j = 0; j <= dv; j++) terms.push([i, j]);
  const m = terms.length;
  const basis = (x, y) => { const u = U(x), v = V(y); return terms.map(([i, j]) => u ** i * v ** j); };
  let pts = []; for (let v = 0; v < NV; v++) if (select(v)) pts.push(v);
  let coef = new Float64Array(m);
  const evalAt = (x, y) => { const b = basis(x, y); let s = 0; for (let k = 0; k < m; k++) s += b[k] * coef[k]; return s; };
  for (let round = 0; round < 4; round++) {
    const A = new Float64Array(m * m), B = new Float64Array(m);
    for (const v of pts) {
      const b = basis(P[v * 3], P[v * 3 + 1]), z = P[v * 3 + 2];
      for (let r = 0; r < m; r++) { B[r] += b[r] * z; for (let c = 0; c < m; c++) A[r * m + c] += b[r] * b[c]; }
    }
    for (let r = 0; r < m; r++) A[r * m + r] += 1e-9;
    // élimination de Gauss avec pivot partiel
    const M = A, X = B;
    for (let c = 0; c < m; c++) {
      let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(M[r * m + c]) > Math.abs(M[p * m + c])) p = r;
      if (p !== c) { for (let k = 0; k < m; k++) [M[c * m + k], M[p * m + k]] = [M[p * m + k], M[c * m + k]]; [X[c], X[p]] = [X[p], X[c]]; }
      for (let r = c + 1; r < m; r++) { const f = M[r * m + c] / M[c * m + c]; for (let k = c; k < m; k++) M[r * m + k] -= f * M[c * m + k]; X[r] -= f * X[c]; }
    }
    for (let r = m - 1; r >= 0; r--) { let s = X[r]; for (let k = r + 1; k < m; k++) s -= M[r * m + k] * coef[k]; coef[r] = s / M[r * m + r]; }
    const res = pts.map((v) => Math.abs(evalAt(P[v * 3], P[v * 3 + 1]) - P[v * 3 + 2]));
    const med = [...res].sort((a, b) => a - b)[res.length >> 1];
    log(`  ajustement passe ${round} : ${pts.length} pts, écart médian ${(med * 1000).toFixed(2)} mm`);
    pts = pts.filter((_, k) => res[k] < Math.max(2.5 * med, 2e-4));
  }
  return evalAt;
}

// ─── 3. Repères (relevés sur des rendus gradués et des profils du maillage) ─
const SKIN = '#7a431f';
const HEAD = { cx: 0.0, cz: -0.018 };
const BON = { cx: 0.005, cz: -0.024 };
const OVAL = { x: -0.004, y: 0.398, a: 0.067, b: 0.063 }; // ovale sculpté sur le devant du bonnet
// Bisou imprimé, placé comme sur la planche : côté gauche du personnage (droite à l'écran), au-dessus de la bande
const KISS = { s: 0.05, y: 0.437, w: 0.134, tilt: (7 * Math.PI) / 180, R: 0.125 };
const ridgeGuess = (x, z) => {
  const tx = Math.min(1, Math.max(0, (x + 0.13) / 0.26)), tz = Math.min(1, Math.max(0, (z + 0.13) / 0.18));
  const back = 0.356 + (0.362 - 0.356) * tx, front = 0.40 + (0.371 - 0.40) * tx; return back + (front - back) * tz;
};
/** Poids de la zone avant du bonnet à aplanir (ancien ovale ∪ emplacement du bisou), 1 au cœur → 0 au bord. */
const bonnetZone = (x, y, in1, out1, in2, out2) => {
  const e1 = Math.hypot((x - OVAL.x) / OVAL.a, (y - OVAL.y) / OVAL.b);
  const e2 = Math.hypot((x - KISS.s) / 0.078, (y - KISS.y) / 0.052);
  return Math.max(ramp(out1, in1, e1), ramp(out2, in2, e2)) * ramp(0.125, 0.1, Math.abs(x));
};

// ─── 4. Corrections de forme (locales) ───────────────────────────────────
{
  const N0 = normals(P, I);
  // 4a. Visage : surface lisse (les lèvres en relief et les petits creux disparaissent)
  log('visage :');
  const face = fitHeightField(
    (v) => { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; return y > 0.205 && y < 0.31 && Math.abs(x) < 0.115 && z - HEAD.cz > 0.02 && N0[v * 3 + 2] > 0.4; },
    (x) => x / 0.12, (y) => (y - 0.258) / 0.055, 4, 3,
  );
  let moved = 0, maxd = 0;
  for (let v = 0; v < NV; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    if (y < 0.2 || y > 0.312 || Math.abs(x) > 0.115 || z - HEAD.cz < 0.02) continue;
    const w = ramp(0.115, 0.085, Math.abs(x)) * ramp(0.207, 0.222, y) * ramp(0.309, 0.299, y) * ramp(0.35, 0.6, N0[v * 3 + 2]);
    if (w <= 0) continue;
    const d = w * (face(x, y) - z); P[v * 3 + 2] += d; moved++; maxd = Math.max(maxd, Math.abs(d));
  }
  log(`  ${moved} sommets ajustés, déplacement max ${(maxd * 1000).toFixed(1)} mm`);

  // 4b. Bonnet : l'ovale sculpté (et la zone du bisou) redevient un dôme lisse
  log('bonnet :');
  const dome = fitHeightField(
    (v) => {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      return y > 0.325 && y < 0.485 && Math.abs(x) < 0.115 && z - BON.cz > 0.03 && N0[v * 3 + 2] > 0.25 && Math.abs(y - ridgeGuess(x, z)) > 0.014;
    },
    (x) => x / 0.12, (y) => (y - 0.405) / 0.08, 4, 4,
  );
  moved = 0; maxd = 0;
  for (let v = 0; v < NV; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    if (y < 0.315 || y > 0.49 || Math.abs(x) > 0.13 || z - BON.cz < 0.03) continue;
    const w = bonnetZone(x, y, 1.12, 1.45, 1.05, 1.35) * ramp(0.2, 0.45, N0[v * 3 + 2]);
    if (w <= 0) continue;
    const d = w * (dome(x, y) - z); P[v * 3 + 2] += d; moved++; maxd = Math.max(maxd, Math.abs(d));
  }
  log(`  ${moved} sommets ajustés, déplacement max ${(maxd * 1000).toFixed(1)} mm`);

  // 4c. Lissage (Taubin, sans rétrécissement) de la zone de transition : aucun pli au bord de la zone aplanie
  const { start, list } = neighbours(I, NV);
  const ws = new Float32Array(NV); const zone = [];
  for (let v = 0; v < NV; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    if (y < 0.33 || z - BON.cz < 0.02) continue;
    ws[v] = bonnetZone(x, y, 1.3, 2.0, 1.2, 1.7) * ramp(0.33, 0.35, y) * ramp(0.12, 0.3, N0[v * 3 + 2]);
    if (ws[v] > 0) zone.push(v);
  }
  const tmp = new Float32Array(NV * 3);
  const taubin = (zone, weight, iterations) => {
    for (let it = 0; it < iterations; it++) {
      const k = it % 2 ? -0.53 : 0.5;
      for (const v of zone) {
        let sx = 0, sy = 0, sz = 0; const s = start[v], e = start[v + 1];
        for (let j = s; j < e; j++) { const q = list[j]; sx += P[q * 3]; sy += P[q * 3 + 1]; sz += P[q * 3 + 2]; }
        const n = e - s, f = k * weight[v];
        tmp[v * 3] = P[v * 3] + f * (sx / n - P[v * 3]); tmp[v * 3 + 1] = P[v * 3 + 1] + f * (sy / n - P[v * 3 + 1]); tmp[v * 3 + 2] = P[v * 3 + 2] + f * (sz / n - P[v * 3 + 2]);
      }
      for (const v of zone) { P[v * 3] = tmp[v * 3]; P[v * 3 + 1] = tmp[v * 3 + 1]; P[v * 3 + 2] = tmp[v * 3 + 2]; }
    }
  };
  taubin(zone, ws, 100);
  log(`  transition lissée sur ${zone.length} sommets`);

  // 4d. Bas du sweat et poignets : les franges sculptées (petites pointes) sont lissées
  const wf = new Float32Array(NV); const fringe = [];
  for (let v = 0; v < NV; v++) {
    const x = P[v * 3], y = P[v * 3 + 1];
    const hem = ramp(-0.13, -0.122, y) * ramp(-0.094, -0.102, y);
    const cuff = Math.abs(x) > 0.125 ? ramp(-0.156, -0.146, y) * ramp(-0.108, -0.116, y) : 0;
    wf[v] = Math.max(hem, cuff);
    if (wf[v] > 0) fringe.push(v);
  }
  taubin(fringe, wf, 60);
  log(`franges lissées : ${fringe.length} sommets`);
}

// ─── 5. Parties : étiquettes par sommet, puis découpe des triangles le long des frontières ─
const NAMES = ['skin', 'hand', 'bonnet', 'sweat', 'belt', 'buckle', 'jeans', 'shoe', 'sole'];
const ID = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const labelAt = (x, y, z, nx, ny, nz) => { const c = classify(x, y, z, nx, ny, nz); return ID[c === 'shoe' && y < -0.472 ? 'sole' : c]; };
let FL;
{
  const N = normals(P, I);
  const VL = new Uint8Array(NV);
  for (let v = 0; v < NV; v++) VL[v] = labelAt(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
  // nettoyage des îlots isolés : un sommet prend l'étiquette majoritaire de ses voisins
  const { start, list } = neighbours(I, NV);
  for (let pass = 0; pass < 3; pass++) {
    const nl = VL.slice(); const cnt = new Uint16Array(NAMES.length);
    for (let v = 0; v < NV; v++) {
      const s = start[v], e = start[v + 1]; if (e === s) continue;
      cnt.fill(0); for (let k = s; k < e; k++) cnt[VL[list[k]]]++;
      let best = VL[v]; for (let l = 0; l < cnt.length; l++) if (cnt[l] > cnt[best]) best = l;
      if (best !== VL[v] && cnt[best] > (e - s) * 0.6) nl[v] = best;
    }
    VL.set(nl);
  }
  // Découpe : chaque arête entre deux parties reçoit un sommet posé sur la limite exacte (recherche dichotomique)
  const PA = Array.from(P), NA = Array.from(N), LA = Array.from(VL);
  const cut = new Map();
  const edgePoint = (a, b) => {
    const key = a < b ? a * NV + b : b * NV + a; const hit = cut.get(key); if (hit !== undefined) return hit;
    const la = VL[a], lb = VL[b];
    const at = (t) => labelAt(...[0, 1, 2].map((o) => P[a * 3 + o] + (P[b * 3 + o] - P[a * 3 + o]) * t), ...[0, 1, 2].map((o) => N[a * 3 + o] + (N[b * 3 + o] - N[a * 3 + o]) * t));
    let t = 0.5;
    if (at(0) === la && at(1) === lb) { let lo = 0, hi = 1; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (at(m) === la) lo = m; else hi = m; } t = (lo + hi) / 2; }
    const i = PA.length / 3;
    for (let o = 0; o < 3; o++) { PA.push(P[a * 3 + o] + (P[b * 3 + o] - P[a * 3 + o]) * t); NA.push(N[a * 3 + o] + (N[b * 3 + o] - N[a * 3 + o]) * t); }
    LA.push(255); cut.set(key, i); return i;
  };
  const nI = [], nF = [];
  const tri = (a, b, c, l) => { nI.push(a, b, c); nF.push(l); };
  for (let f = 0; f < I.length; f += 3) {
    const v = [I[f], I[f + 1], I[f + 2]], l = v.map((x) => VL[x]);
    if (l[0] === l[1] && l[1] === l[2]) { tri(v[0], v[1], v[2], l[0]); continue; }
    if (l[0] !== l[1] && l[1] !== l[2] && l[0] !== l[2]) { // trois parties : découpe au centre
      const m01 = edgePoint(v[0], v[1]), m12 = edgePoint(v[1], v[2]), m20 = edgePoint(v[2], v[0]);
      const g = PA.length / 3; for (let o = 0; o < 3; o++) { PA.push((P[v[0] * 3 + o] + P[v[1] * 3 + o] + P[v[2] * 3 + o]) / 3); NA.push((N[v[0] * 3 + o] + N[v[1] * 3 + o] + N[v[2] * 3 + o]) / 3); } LA.push(255);
      tri(v[0], m01, g, l[0]); tri(v[0], g, m20, l[0]); tri(v[1], m12, g, l[1]); tri(v[1], g, m01, l[1]); tri(v[2], m20, g, l[2]); tri(v[2], g, m12, l[2]);
      continue;
    }
    // deux parties : on fait tourner le triangle pour que le sommet isolé soit en 3e position
    const odd = l[0] === l[1] ? 2 : l[1] === l[2] ? 0 : 1;
    const a = v[(odd + 1) % 3], b = v[(odd + 2) % 3], c = v[odd];
    const mac = edgePoint(a, c), mbc = edgePoint(b, c);
    tri(a, b, mbc, VL[a]); tri(a, mbc, mac, VL[a]); tri(mac, mbc, c, VL[c]);
  }
  log('frontières découpées :', cut.size, 'arêtes,', (nI.length - I.length) / 3, 'triangles ajoutés');
  P = Float32Array.from(PA); I = Uint32Array.from(nI); FL = Uint8Array.from(nF); NV = P.length / 3;
}
const N = normals(P, I);

// ─── 6. Allègement par partie (bords verrouillés : les parties restent jointives) ─
const SIMPLIFY = { skin: [0.3, 0.0004], hand: [0.3, 0.0006], bonnet: [0.35, 0.0008], sweat: [0.14, 0.0008], belt: [0.35, 0.0006], buckle: [0.6, 0.0004], jeans: [0.2, 0.0009], shoe: [0.3, 0.0007], sole: [0.25, 0.0007] };
const partTris = {};
{
  let before = 0, after = 0;
  for (const name of NAMES) {
    const id = ID[name]; const idx = []; for (let f = 0; f < FL.length; f++) if (FL[f] === id) idx.push(I[f * 3], I[f * 3 + 1], I[f * 3 + 2]);
    const src = Uint32Array.from(idx); const [ratio, err] = SIMPLIFY[name];
    const [out, e] = MeshoptSimplifier.simplify(src, P, 3, Math.floor((src.length * ratio) / 3) * 3, err, ['LockBorder']);
    partTris[name] = out; before += src.length / 3; after += out.length / 3;
    log(`allègement ${name} : ${src.length / 3} → ${out.length / 3} triangles (écart ${(e * 1000).toFixed(2)} ‰)`);
  }
  log('total', before, '→', after, 'triangles');
}

// ─── 7. Outils (bruit, couleurs, images) ─────────────────────────────────
const hash = (a, b = 0, c = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t); const u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t; const h = (i, j, k) => hash(xi + i, yi + j, zi + k);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const toLinear = (hex) => rgb(hex).map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const pixels = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
const sample = (im, u, v) => {
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return null;
  const i = (Math.floor(v * im.height) * im.width + Math.floor(u * im.width)) * 4; return [im.data[i], im.data[i + 1], im.data[i + 2], im.data[i + 3]];
};

// Bisou : logo d'origine (Kiss Love.png) avec un liseré blanc d'autocollant, comme sur la planche
const kissIm = await (async () => {
  const img = new Image(); img.src = '/kiss.png'; await img.decode();
  const pad = 14, c = document.createElement('canvas'); c.width = img.width + pad * 2; c.height = img.height + pad * 2;
  const white = document.createElement('canvas'); white.width = img.width; white.height = img.height;
  const w = white.getContext('2d'); w.drawImage(img, 0, 0); w.globalCompositeOperation = 'source-in'; w.fillStyle = '#fff'; w.fillRect(0, 0, img.width, img.height);
  const x = c.getContext('2d');
  for (let a = 0; a < 32; a++) x.drawImage(white, pad + Math.cos((a / 32) * 2 * Math.PI) * 9, pad + Math.sin((a / 32) * 2 * Math.PI) * 9);
  x.drawImage(img, pad, pad);
  // creux entre les lèvres et coins ouverts : blanc (fermeture morphologique de la silhouette)
  const im = pixels(c), W = c.width, H = c.height, r = 22;
  let m = new Uint8Array(W * H); for (let k = 0; k < W * H; k++) m[k] = im.data[k * 4 + 3] > 10 ? 1 : 0;
  const filter = (src, horiz, max) => {
    const o = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let v = max ? 0 : 1;
      for (let d = -r; d <= r; d++) {
        const ii = horiz ? i + d : i, jj = horiz ? j : j + d;
        const s = ii < 0 || jj < 0 || ii >= W || jj >= H ? 0 : src[jj * W + ii];
        if (max ? s : !s) { v = max ? 1 : 0; break; }
      }
      o[j * W + i] = v;
    }
    return o;
  };
  m = filter(filter(filter(filter(m, true, true), false, true), true, false), false, false);
  for (let k = 0; k < W * H; k++) if (m[k] && im.data[k * 4 + 3] <= 10) im.data.set([255, 255, 255, 255], k * 4);
  return im;
})();

// Bande blanche : suit la crête sculptée (rayon maximal près d'une estimation bilinéaire)
const BINS = 240; const ridgeY = new Float32Array(BINS).fill(NaN); const ridgeR = new Float32Array(BINS).fill(0);
const binOf = (theta) => Math.floor(((theta + Math.PI) / (2 * Math.PI)) * BINS) % BINS;
for (let v = 0; v < NV; v++) {
  const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; if (y < 0.33 || y > 0.42) continue;
  if (Math.abs(y - ridgeGuess(x, z)) > 0.014) continue;
  const dx = x - BON.cx, dz = z - BON.cz, r = Math.hypot(dx, dz); const b = binOf(Math.atan2(dx, dz));
  if (r > ridgeR[b]) { ridgeR[b] = r; ridgeY[b] = y; }
}
{
  // devant aplani (ancien ovale) : la crête n'y existe plus, la bande y est tracée en continuité
  const b0 = binOf(-0.62), b1 = binOf(0.5);
  for (let b = b0 + 1; b < b1; b++) ridgeY[b] = ridgeY[b0] + ((ridgeY[b1] - ridgeY[b0]) * (b - b0)) / (b1 - b0);
  for (let b = 0; b < BINS; b++) if (isNaN(ridgeY[b])) { let k = 1; while (isNaN(ridgeY[(b + k) % BINS]) && k < BINS) k++; ridgeY[b] = ridgeY[(b + k) % BINS]; }
  const s = ridgeY.slice(); for (let b = 0; b < BINS; b++) { let t = 0; for (let k = -4; k <= 4; k++) t += s[(b + k + BINS) % BINS]; ridgeY[b] = t / 9; }
}
const ridgeAt = (theta) => { const f = ((theta + Math.PI) / (2 * Math.PI)) * BINS; const b0 = Math.floor(f) % BINS, b1 = (b0 + 1) % BINS, t = f - Math.floor(f); return ridgeY[b0] * (1 - t) + ridgeY[b1] * t; };

// « LOVE&FAITH » écrit verticalement (lettres tournées, lecture de haut en bas), comme au dos du bonnet de la planche
const BAND = { half: 0.018, y0: 0.31, y1: 0.488 };
const bandIm = (() => {
  const c = document.createElement('canvas'); c.width = 160; c.height = Math.round(160 * (BAND.y1 - BAND.y0) / (BAND.half * 2));
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#163f9c'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.letterSpacing = '6px';
  let size = 100; x.font = `bold ${size}px Georgia, "Times New Roman", serif`;
  size = Math.min(c.width * 0.74, (size * c.height * 0.9) / x.measureText('LOVE&FAITH').width);
  x.font = `bold ${Math.floor(size)}px Georgia, "Times New Roman", serif`;
  x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2); x.fillText('LOVE&FAITH', 0, 0);
  return pixels(c);
})();

// Surpiqûres : segments pointillés couleur fil
const dashed = (s, period = 0.006) => (((s / period) % 1) + 1) % 1 < 0.64;
const segDist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
};
const polyDist = (px, py, pts, closed) => {
  let d = Infinity; const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) d = Math.min(d, segDist(px, py, ...pts[i], ...pts[(i + 1) % n]));
  return d;
};
const inside = (px, py, pts) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c; }
  return c;
};
// Poches arrière (relevées sur le maillage : hauts sculptés vers y = -0,15)
const BACK_POCKETS = [0.079, -0.057].map((cx) => [[cx - 0.04, -0.153], [cx + 0.04, -0.153], [cx + 0.04, -0.219], [cx, -0.237], [cx - 0.04, -0.219]]);
const FLY = [[0.017, -0.151], [0.017, -0.204], [0.014, -0.214], [0.007, -0.221], [-0.002, -0.223]];
// Baskets : axe de chaque pied (talon → pointe), relevé dans Blender
const FEET = [{ cx: 0.115, z0: -0.093, z1: 0.171 }, { cx: -0.124, z0: -0.132, z1: 0.131 }];

// ─── 8. Shaders de cuisson : couleur d'un point 3D de la surface ─────────
const SH = {
  skin(x, y, z) {
    let c = rgb(SKIN);
    if (z - HEAD.cz < 0.045) return c; // face avant uniquement
    const INK = rgb('#100805');
    const ell = (cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    const bar = (cx, cy, hw, hh) => { const dx = Math.max(0, Math.abs(x - cx) - (hw - hh)); return Math.hypot(dx, y - cy) < hh; };
    for (const [ex, ey] of [[-0.067, 0.293], [0.033, 0.2875]]) { // yeux + reflet
      if (ell(ex, ey, 0.0118, 0.0148) < 1) c = ell(ex + 0.0042, ey + 0.0055, 0.0036, 0.0036) < 1 ? [255, 255, 255] : rgb('#070404');
    }
    if (bar(-0.068, 0.3088, 0.019, 0.0036) || bar(0.034, 0.3068, 0.019, 0.0036)) c = INK; // sourcils
    const my = 0.2508 + 0.004 * (1 - ((x + 0.006) / 0.032) ** 2); // moustache arquée
    if (Math.abs(x + 0.006) < 0.032 && Math.abs(y - my) < 0.0042) c = INK;
    if (Math.abs(x + 0.005) < 0.017 && Math.abs(y - (0.2282 + 0.0026 * ((x + 0.005) / 0.017) ** 2)) < 0.0014) c = mix(c, INK, 0.85); // bouche
    if (bar(-0.006, 0.2108, 0.0075, 0.0045)) c = INK; // petite barbe
    return c;
  },
  bonnet(x, y, z) {
    const BLUE = rgb('#1f5fd4'), WHITE = [255, 255, 255];
    const dx = x - BON.cx, dz = z - BON.cz, r = Math.hypot(dx, dz), th = Math.atan2(dx, dz);
    if (dz > 0.03) { // bisou, déroulé sur le dôme (abscisse curviligne) et légèrement incliné
      const du = th * KISS.R - KISS.s, dv = y - KISS.y, cs = Math.cos(KISS.tilt), sn = Math.sin(KISS.tilt);
      const lu = du * cs + dv * sn, lv = -du * sn + dv * cs, kh = (KISS.w * kissIm.height) / kissIm.width;
      const s = sample(kissIm, lu / KISS.w + 0.5, 0.5 - lv / kh);
      if (s && s[3] > 8) {
        const base = this.knit(x, y, z, th, r, BLUE, WHITE);
        return mix(base, s.slice(0, 3), s[3] / 255);
      }
    }
    return this.knit(x, y, z, th, r, BLUE, WHITE);
  },
  knit(x, y, z, th, r, BLUE, WHITE) {
    const dz = z - BON.cz;
    const sb = (th > 0 ? th - Math.PI : th + Math.PI) * r; // distance (en surface) au milieu du dos
    if (Math.abs(sb) < BAND.half && y > BAND.y0 - 0.01 && dz < 0) {
      const s = sample(bandIm, sb / (2 * BAND.half) + 0.5, (BAND.y1 - y) / (BAND.y1 - BAND.y0));
      return s ? s.slice(0, 3) : WHITE;
    }
    if (Math.abs(y - ridgeAt(th)) < 0.0062) return WHITE; // bande horizontale
    const s = th * Math.max(r, 0.03), cw = 0.0034, ch = 0.011; // tricot moucheté
    const i = Math.floor(s / cw), yy = y + hash(i, 77) * ch, j = Math.floor(yy / ch);
    if (hash(i, j, 1) < 0.4) {
      const xc = (i + 0.25 + 0.5 * hash(i, j, 2)) * cw, yc = (j + 0.5) * ch + (hash(i, j, 3) - 0.5) * 0.003;
      if (Math.abs(s - xc) < 0.0005 + 0.0005 * hash(i, j, 4) && Math.abs(yy - yc) < ch * (0.18 + 0.27 * hash(i, j, 5))) return mix(BLUE, WHITE, 0.7 + 0.3 * hash(i, j, 6));
    }
    return mix(BLUE, [10, 40, 120], 0.12 * vnoise(x * 300, y * 300, z * 300));
  },
  jeans(x, y, z) {
    const W = 0.0007, ST = rgb('#bdb39a'), EDGE = rgb('#0e0f12');
    const streak = vnoise(x * 900, y * 70, z * 900), grain = vnoise(x * 2400, y * 2400, z * 2400);
    const sx = Math.sign(x) || 1, legx = sx * 0.095;
    // délavage discret : devant des cuisses et genoux plus clairs (denim noir « stylisé » de la planche)
    const blob = (cx, cy, rx, ry) => Math.max(0, 1 - Math.hypot((x - cx) / rx, (y - cy) / ry));
    const wash = z > 0 ? 0.55 * blob(legx, -0.25, 0.05, 0.09) + 0.3 * blob(legx, -0.34, 0.045, 0.03) : 0.2 * blob(legx, -0.26, 0.05, 0.08);
    const c = rgb('#202127').map((v, i) => v + (streak - 0.5) * 14 + (grain - 0.5) * 10 + 6 * vnoise(x * 40, y * 40, z * 40) + wash * (i === 2 ? 30 : 24) * (0.5 + streak));
    if (y < -0.2) { // coutures extérieures (doubles) et intérieures des jambes
      const cx = sx * 0.088, cz = -0.02;
      const ph = Math.atan2(x - cx, z - cz), rr = Math.hypot(x - cx, z - cz);
      const outer = (ph - sx * Math.PI / 2) * rr, inner = (ph + sx * Math.PI / 2) * rr;
      if (dashed(y, 0.0045) && (Math.abs(Math.abs(outer) - 0.0028) < W || Math.abs(inner) < W)) return ST;
      if (Math.abs(outer) < 0.0006) return EDGE;
    }
    if (y < -0.41) { // ourlet : deux rangs de surpiqûres
      const s = Math.atan2(x - legx, z + 0.02) * 0.06;
      if (dashed(s, 0.0045) && (Math.abs(y + 0.4318) < W || Math.abs(y + 0.4352) < W)) return ST;
    }
    if (z < -0.03) { // poches arrière : contour + double surpiqûre
      for (const pk of BACK_POCKETS) {
        const d = polyDist(x, y, pk, true);
        if (d > 0.006) continue;
        if (d < 0.0007) return EDGE;
        if (inside(x, y, pk) && dashed(x + y, 0.0045) && (Math.abs(d - 0.0021) < W || Math.abs(d - 0.0038) < W)) return ST;
      }
    } else if (z > 0.02) {
      // braguette : surpiqûre en J, double
      const dJ = polyDist(x, y, FLY, false), dJ2 = polyDist(x - 0.0022, y, FLY, false);
      if (y < -0.149 && dashed(y + x, 0.0045) && (dJ < W || dJ2 < W)) return ST;
      if (y < -0.149 && y > -0.222 && Math.abs(x + 0.002) < 0.0006) return EDGE;
      // ouvertures des poches avant
      const pcx = sx * 0.158, pcy = -0.148, R = 0.083, rr = Math.hypot(x - pcx, y - pcy);
      if ((x - pcx) * sx < 0 && y < pcy) {
        if (Math.abs(rr - R) < 0.0007) return EDGE;
        if (dashed(Math.atan2(y - pcy, x - pcx) * R, 0.0045) && Math.abs(rr - R + 0.0022) < W) return ST;
      }
    }
    return c;
  },
  belt(x, y, z) {
    const t = (y + 0.149) / 0.034; const s = Math.atan2(x, z) * 0.17;
    if (t < 0.1 || t > 0.9) return rgb('#140d09');
    if ((Math.abs(t - 0.2) < 0.025 || Math.abs(t - 0.8) < 0.025) && dashed(s, 0.005)) return rgb('#5a4330');
    return mix(rgb('#2a1a10'), rgb('#4a2d19'), 0.55 * vnoise(x * 700, y * 250, z * 700) + 0.25 * vnoise(x * 2600, y * 2600, z * 2600));
  },
  shoe(x, y, z) {
    const f = x > 0 ? FEET[0] : FEET[1], L = f.z1 - f.z0, t = (z - f.z0) / L, lat = x - f.cx, h = y + 0.4725;
    const SEAM = rgb('#c9c9c5'), ST = rgb('#d9d9d5'), line = (d, w = 0.0011) => Math.abs(d) < w;
    const c = rgb('#f5f5f3');
    const dTc = (t - (0.79 + 0.1 * (lat / 0.08) ** 2)) * L; // bout rapporté
    if (line(dTc)) return SEAM;
    if (line(dTc + 0.0042, 0.0007) && dashed(lat, 0.005)) return ST;
    if (dTc > 0.006 && h > 0.012) { // perforations du bout
      const gx = Math.round(lat / 0.0068) * 0.0068, gz = Math.round(z / 0.0068) * 0.0068;
      if (Math.hypot(lat - gx, z - gz) < 0.0012) return rgb('#b9b9b5');
    }
    if (line(h - 0.0145)) return SEAM; // pare-boue
    if (line(h - 0.0105, 0.0007) && dashed(t * L, 0.005)) return ST;
    if (h > 0.015) {
      const dH = (t - 0.2 + 0.05 * ((h - 0.015) / 0.04)) * L; // contrefort du talon
      if (line(dH)) return SEAM;
      if (line(dH - 0.0042, 0.0007) && dashed(h, 0.005)) return ST;
      if (Math.abs(lat) > 0.035) { // panneau latéral
        const dS = (t - (0.37 + 0.12 * ((h - 0.015) / 0.04))) * L;
        if (line(dS)) return SEAM;
        if (line(dS + 0.0042, 0.0007) && dashed(h, 0.005)) return ST;
      }
    }
    if (h > 0.03 && t > 0.42 && t < 0.78 && Math.abs(lat) < 0.034) { // laçage
      if (line(Math.abs(lat) - 0.03)) return SEAM;
      const p = (((t * L) / 0.012) % 1);
      if (Math.abs(Math.abs(lat) - 0.024) < 0.0035 && Math.abs(p - 0.5) < 0.12) return rgb('#a9a9a5'); // œillets
      if (Math.abs(lat) < 0.022) return p < 0.55 ? mix(c, rgb('#d6d6d2'), Math.abs(p - 0.27) * 2.5) : rgb('#e3e3df');
    }
    return c;
  },
  sole(x, y, z, nx, ny) {
    const f = x > 0 ? FEET[0] : FEET[1], h = y + 0.5;
    if (ny < -0.6) return mix(rgb('#d9d8d3'), rgb('#cfcec9'), vnoise(x * 400, 0, z * 400)); // dessous
    const s = Math.atan2(x - f.cx, z - (f.z0 + f.z1) / 2) * 0.1;
    if (Math.abs(h - 0.0205) < 0.0008 && dashed(s, 0.0045)) return rgb('#cfcec9');
    if (Math.abs(h - 0.012) < 0.0012) return rgb('#d6d5d0');
    return h < 0.012 ? rgb('#e9e8e4') : rgb('#f0efeb');
  },
};

// ─── 9. Maillages, UV et cuisson ──────────────────────────────────────────
const PARTS = [
  { id: 'skin', name: 'Visage', uv: 'cyl', center: HEAD, v0: 0.14, v1: 0.34, tex: [2048, 2048], shade: SH.skin,
    front: { minDz: 0.03, x0: -0.13, x1: 0.13, y0: 0.15, y1: 0.33 } },
  { id: 'hand', name: 'Mains' },
  { id: 'bonnet', name: 'Bonnet', uv: 'cyl', center: BON, v0: 0.28, v1: 0.51, seam: Math.PI / 2, tex: [2048, 2048], shade: (...a) => SH.bonnet(...a),
    front: { minDz: 0.06, x0: -0.17, x1: 0.17, y0: 0.28, y1: 0.51 } },
  { id: 'sweat', name: 'Sweat' },
  { id: 'belt', name: 'Ceinture', uv: 'box', tex: [1024, 1024], shade: SH.belt },
  { id: 'buckle', name: 'Boucle' },
  { id: 'jeans', name: 'Jean', uv: 'box', tex: [3072, 2048], shade: SH.jeans },
  { id: 'shoe', name: 'Baskets', uv: 'box', tex: [2048, 2048], shade: SH.shoe },
  { id: 'sole', name: 'Semelles', uv: 'box', tex: [1536, 1024], shade: SH.sole },
];
const MATERIALS = {
  skin: { color: '#ffffff', rough: 0.32, clearcoat: 0.8 },
  hand: { color: SKIN, rough: 0.32, clearcoat: 0.8 },
  bonnet: { color: '#ffffff', rough: 0.62, clearcoat: 0.25 },
  sweat: { color: '#f3f3f2', rough: 0.45, clearcoat: 0.35 },
  belt: { color: '#ffffff', rough: 0.45, clearcoat: 0.3 },
  buckle: { color: '#d9a43e', metal: 1, rough: 0.25, clearcoat: 0.5 },
  jeans: { color: '#ffffff', rough: 0.78, clearcoat: 0.08 },
  shoe: { color: '#ffffff', rough: 0.38, clearcoat: 0.5 },
  sole: { color: '#ffffff', rough: 0.5, clearcoat: 0.25 },
};

function buildPart(part, tris) {
  const map = new Map(); const pos = [], nor = [], uv = [], idx = [];
  let bb = null;
  if (part.uv === 'box') { bb = [9, 9, 9, -9, -9, -9]; for (const v of tris) for (let a = 0; a < 3; a++) { bb[a] = Math.min(bb[a], P[v * 3 + a]); bb[a + 3] = Math.max(bb[a + 3], P[v * 3 + a]); } }
  const ext = bb ? Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) : 1;
  for (let f = 0; f < tris.length; f += 3) {
    const vs = [tris[f], tris[f + 1], tris[f + 2]];
    let uvs = null, chart = 0;
    const fr = part.front;
    const facing = () => { // normale du triangle tournée vers l'avant : pas de recouvrement dans la projection plane
      const [a, b, c] = vs; const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1];
      const uz = P[b * 3 + 2] - P[a * 3 + 2], vz = P[c * 3 + 2] - P[a * 3 + 2];
      const nz = ux * vy - uy * vx; return nz / (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, nz) || 1) > 0.3;
    };
    if (fr && vs.every((v) => P[v * 3 + 2] - part.center.cz > fr.minDz) && facing()) {
      // face avant : projection plane (x, y) dans la moitié basse de la texture
      chart = 2;
      uvs = vs.map((v) => [(P[v * 3] - fr.x0) / (fr.x1 - fr.x0), 0.5 + 0.5 * (fr.y1 - P[v * 3 + 1]) / (fr.y1 - fr.y0)]);
    } else if (part.uv === 'cyl') {
      uvs = vs.map((v) => {
        let th = Math.atan2(P[v * 3] - part.center.cx, P[v * 3 + 2] - part.center.cz) - (part.seam ?? Math.PI);
        th = (((th / (2 * Math.PI)) % 1) + 1) % 1;
        return [th, ((part.v1 - P[v * 3 + 1]) / (part.v1 - part.v0)) * (fr ? 0.5 : 1)];
      });
      const us = uvs.map((q) => q[0]); if (Math.max(...us) - Math.min(...us) > 0.5) { chart = 1; uvs.forEach((q) => { if (q[0] < 0.5) q[0] += 1; }); }
    } else if (part.uv === 'box') { // normale → l'une des 6 vues ; cases d'un atlas 3 × 2
      let nx = 0, ny = 0, nz = 0; for (const v of vs) { nx += N[v * 3]; ny += N[v * 3 + 1]; nz += N[v * 3 + 2]; }
      const ax = Math.abs(nx) >= Math.abs(ny) && Math.abs(nx) >= Math.abs(nz) ? 0 : Math.abs(ny) >= Math.abs(nz) ? 1 : 2;
      chart = ax * 2 + ([nx, ny, nz][ax] >= 0 ? 0 : 1);
      const [a, b] = ax === 0 ? [2, 1] : ax === 1 ? [0, 2] : [0, 1];
      const col = chart % 3, row = Math.floor(chart / 3);
      uvs = vs.map((v) => [(col + 0.02 + 0.96 * (P[v * 3 + a] - bb[a]) / ext) / 3, (row + 0.02 + 0.96 * (bb[b + 3] - P[v * 3 + b]) / ext) / 2]);
    }
    vs.forEach((v, k) => {
      const key = v * 8 + chart; let ni = map.get(key);
      if (ni === undefined) {
        ni = pos.length / 3; map.set(key, ni);
        pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
        if (uvs) uv.push(uvs[k][0], uvs[k][1]);
      }
      idx.push(ni);
    });
  }
  return { pos: Float32Array.from(pos), nor: Float32Array.from(nor), uv: uv.length ? Float32Array.from(uv) : null, idx: Uint32Array.from(idx) };
}

/** Cuisson : rastérisation des triangles dans l'espace UV ; couleur calculée depuis la position 3D. */
function bake(geo, part) {
  const [W, H] = part.tex; const img = new Uint8ClampedArray(W * H * 4); const filled = new Uint8Array(W * H);
  const wrap = part.uv === 'cyl';
  for (let t = 0; t < geo.idx.length; t += 3) {
    const v = [geo.idx[t], geo.idx[t + 1], geo.idx[t + 2]];
    const U = v.map((i) => geo.uv[i * 2] * W), V = v.map((i) => geo.uv[i * 2 + 1] * H);
    const x0 = Math.floor(Math.min(...U) - 1), x1 = Math.ceil(Math.max(...U) + 1), y0 = Math.max(0, Math.floor(Math.min(...V) - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(...V) + 1));
    const den = (V[1] - V[2]) * (U[0] - U[2]) + (U[2] - U[1]) * (V[0] - V[2]); if (Math.abs(den) < 1e-12) continue;
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const cx = px + 0.5, cy = py + 0.5;
      const w0 = ((V[1] - V[2]) * (cx - U[2]) + (U[2] - U[1]) * (cy - V[2])) / den;
      const w1 = ((V[2] - V[0]) * (cx - U[2]) + (U[0] - U[2]) * (cy - V[2])) / den;
      const w2 = 1 - w0 - w1; if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      let tx = px; if (wrap) tx = ((px % W) + W) % W; else if (px < 0 || px >= W) continue;
      const k = py * W + tx; if (filled[k] === 2) continue;
      const g = (a, o) => a[v[0] * 3 + o] * w0 + a[v[1] * 3 + o] * w1 + a[v[2] * 3 + o] * w2;
      const c = part.shade(g(geo.pos, 0), g(geo.pos, 1), g(geo.pos, 2), g(geo.nor, 0), g(geo.nor, 1), g(geo.nor, 2));
      img[k * 4] = c[0]; img[k * 4 + 1] = c[1]; img[k * 4 + 2] = c[2]; img[k * 4 + 3] = 255;
      filled[k] = w0 >= 0 && w1 >= 0 && w2 >= 0 ? 2 : 1;
    }
  }
  for (let it = 0; it < 10; it++) { // dilatation : remplit les gouttières entre îlots UV
    const add = [];
    for (let k = 0; k < W * H; k++) if (!filled[k]) {
      const x = k % W, y = (k / W) | 0; let r = 0, gg = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const q = yy * W + xx; if (filled[q]) { r += img[q * 4]; gg += img[q * 4 + 1]; b += img[q * 4 + 2]; n++; } }
      if (n) add.push([k, r / n, gg / n, b / n]);
    }
    for (const [k, r, gg, b] of add) { img[k * 4] = r; img[k * 4 + 1] = gg; img[k * 4 + 2] = b; img[k * 4 + 3] = 255; filled[k] = 1; }
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(new ImageData(img, W, H), 0, 0);
  return c;
}

/** Ordre des sommets optimisé pour le GPU et la compression. */
function reorder(geo) {
  const [remap, unique] = MeshoptEncoder.reorderMesh(geo.idx, true, true); // geo.idx est réécrit sur place
  const move = (a, n) => { if (!a) return null; const o = new Float32Array(unique * n); for (let v = 0; v < remap.length; v++) if (remap[v] !== 0xffffffff) for (let k = 0; k < n; k++) o[remap[v] * n + k] = a[v * n + k]; return o; };
  const idx = unique < 65536 ? Uint16Array.from(geo.idx) : geo.idx;
  return { pos: move(geo.pos, 3), nor: move(geo.nor, 3), uv: move(geo.uv, 2), idx };
}

const built = [];
for (const part of PARTS) {
  let geo = buildPart(part, partTris[part.id]);
  if (!geo.idx.length) { log('partie vide', part.id); continue; }
  let jpg = null;
  if (part.tex) { const t = performance.now(); jpg = bake(geo, part).toDataURL('image/jpeg', 0.9); log('cuisson', part.id, Math.round(performance.now() - t), 'ms'); }
  geo = reorder(geo);
  built.push({ part, geo, jpg });
  log(part.name, geo.pos.length / 3, 'sommets', geo.idx.length / 3, 'triangles');
}

// ─── 10. Écriture du GLB (glTF 2.0 + KHR_materials_clearcoat + EXT_meshopt_compression) ─
// buffers[0] = données du GLB (flux compressés + images) ; buffers[1] = tampon de repli virtuel (non stocké)
const chunks = []; let offset = 0, fallback = 0;
const bufferViews = [], accessors = [], images = [], textures = [], materials = [], meshes = [], nodes = [];
const store = (bytes) => { const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; } const at = offset; chunks.push(bytes); offset += bytes.byteLength; return at; };
const rawView = (bytes) => { bufferViews.push({ buffer: 0, byteOffset: store(bytes), byteLength: bytes.byteLength }); return bufferViews.length - 1; };
const meshoptView = (arr, size, mode, target) => {
  const raw = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), count = arr.byteLength / size;
  const enc = MeshoptEncoder.encodeGltfBuffer(raw, count, size, mode);
  const fbOffset = fallback; fallback += Math.ceil(raw.byteLength / 4) * 4;
  bufferViews.push({
    buffer: 1, byteOffset: fbOffset, byteLength: raw.byteLength, ...(mode === 'ATTRIBUTES' ? { byteStride: size } : {}), target,
    extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: store(enc), byteLength: enc.byteLength, byteStride: size, mode, count } },
  });
  return bufferViews.length - 1;
};
const attribute = (arr, type, minmax) => {
  const n = { VEC3: 3, VEC2: 2 }[type]; const a = { bufferView: meshoptView(arr, n * 4, 'ATTRIBUTES', 34962), componentType: 5126, count: arr.length / n, type };
  if (minmax) { const mn = [9, 9, 9], mx = [-9, -9, -9]; for (let i = 0; i < arr.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], arr[i + k]); mx[k] = Math.max(mx[k], arr[i + k]); } a.min = mn; a.max = mx; }
  accessors.push(a); return accessors.length - 1;
};
const b64bytes = (d) => Uint8Array.from(atob(d.split(',')[1]), (c) => c.charCodeAt(0));
const texturesOut = {};
for (const { part, geo, jpg } of built) {
  const m = MATERIALS[part.id];
  const mat = { name: part.name, pbrMetallicRoughness: { baseColorFactor: [...toLinear(m.color), 1], metallicFactor: m.metal || 0, roughnessFactor: m.rough }, extensions: { KHR_materials_clearcoat: { clearcoatFactor: m.clearcoat, clearcoatRoughnessFactor: 0.2 } } };
  if (jpg) {
    texturesOut[part.id] = jpg;
    images.push({ name: part.name, mimeType: 'image/jpeg', bufferView: rawView(b64bytes(jpg)) });
    textures.push({ sampler: part.uv === 'cyl' ? 0 : 1, source: images.length - 1 });
    mat.pbrMetallicRoughness.baseColorTexture = { index: textures.length - 1 };
  }
  materials.push(mat);
  const attributes = { POSITION: attribute(geo.pos, 'VEC3', true), NORMAL: attribute(geo.nor, 'VEC3') };
  if (geo.uv) attributes.TEXCOORD_0 = attribute(geo.uv, 'VEC2');
  const isize = geo.idx.BYTES_PER_ELEMENT;
  accessors.push({ bufferView: meshoptView(geo.idx, isize, 'TRIANGLES', 34963), componentType: isize === 2 ? 5123 : 5125, count: geo.idx.length, type: 'SCALAR' });
  meshes.push({ name: part.name, primitives: [{ attributes, indices: accessors.length - 1, material: materials.length - 1 }] });
  nodes.push({ name: part.name, mesh: meshes.length - 1 });
}
nodes.push({ name: 'LoveFaith_Playmobil', children: nodes.map((_, i) => i) });
const json = {
  asset: { version: '2.0', generator: 'Love&Faith build.js (d\'après Personnage 3D.glb)' },
  extensionsUsed: ['KHR_materials_clearcoat', 'EXT_meshopt_compression'], extensionsRequired: ['EXT_meshopt_compression'],
  scene: 0, scenes: [{ nodes: [nodes.length - 1] }], nodes, meshes, materials, textures, images, accessors, bufferViews,
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 }, { magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  buffers: [{ byteLength: offset }, { byteLength: fallback, extensions: { EXT_meshopt_compression: { fallback: true } } }],
};
const bin = new Uint8Array(offset + ((4 - (offset % 4)) % 4)); { let o = 0; for (const c of chunks) { bin.set(c, o); o += c.byteLength; } }
json.buffers[0].byteLength = bin.length;
const js = new TextEncoder().encode(JSON.stringify(json)); const jsonBytes = new Uint8Array(js.length + ((4 - (js.length % 4)) % 4)).fill(0x20); jsonBytes.set(js);
const total = 28 + jsonBytes.length + bin.length; const out = new Uint8Array(total); const dv = new DataView(out.buffer);
dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(jsonBytes, 20);
dv.setUint32(20 + jsonBytes.length, bin.length, true); dv.setUint32(24 + jsonBytes.length, 0x004e4942, true); out.set(bin, 28 + jsonBytes.length);
let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
window.result = { glb: btoa(s), textures: texturesOut };
log('GLB', (total / 1048576).toFixed(2), 'Mo — terminé en', Math.round((performance.now() - T0) / 1000), 's');
