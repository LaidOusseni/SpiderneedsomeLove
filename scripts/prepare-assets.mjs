/**
 * scripts/prepare-assets.mjs
 *
 * Prépare les ressources web à partir des fichiers sources (Intro/, Icon/, Mockups/, public/Comics/).
 * Les fichiers sources ne sont JAMAIS modifiés : tout est écrit dans public/creations/ et public/intro/.
 *
 * Pour chaque création :
 *   - front.webp / back.webp : mockups 2D (galerie), proportions d'origine
 *   - icon.webp              : icône du panneau de sélection
 *   - print-front.png / print-back.png : motif extrait du mockup (fond tissu rendu transparent),
 *     utilisé comme texture sur le vêtement 3D
 * + src/constants/generated/prints.json : position de chaque motif sur le vêtement (normalisée
 *   par rapport à la silhouette du mockup) et couleur du tissu mesurée.
 *
 * Usage : npm run assets
 * Remplacer une texture plus tard : déposer un PNG transparent dans public/creations/<slug>/print-front.png
 * et ajuster `printOverrides` dans src/constants/creations.js (pas besoin de relancer ce script).
 */

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CREATION_SOURCES } from './creation-sources.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const OUT = path.join(ROOT, 'public', 'creations');
const META_OUT = path.join(ROOT, 'src', 'constants', 'generated', 'prints.json');

// Seuils de détourage (distance max par canal entre le pixel et la couleur du tissu)
const KEY_LOW = 26;   // en dessous : tissu (transparent) — absorbe les ombres de plis
const KEY_HIGH = 64;  // au-dessus : motif (opaque)
const BG_LEVEL = 251; // fond du mockup = blanc pur

async function readRaw(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Boîte englobante de la silhouette du vêtement (pixels différents du fond blanc pur). */
function silhouette({ data, w, h }) {
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (data[i] < BG_LEVEL || data[i + 1] < BG_LEVEL || data[i + 2] < BG_LEVEL) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { x0, x1, y0, y1 };
}

/** Couleur médiane du tissu, mesurée sous le motif (bas du torse). */
function fabricColor({ data, w, h }) {
  const samples = [[], [], []];
  for (let y = Math.round(h * 0.78); y < h * 0.83; y++) {
    for (let x = Math.round(w * 0.38); x < w * 0.62; x++) {
      const i = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) samples[c].push(data[i + c]);
    }
  }
  return samples.map((s) => s.sort((a, b) => a - b)[s.length >> 1]);
}

const dist = (data, i, ref) =>
  Math.max(Math.abs(data[i] - ref[0]), Math.abs(data[i + 1] - ref[1]), Math.abs(data[i + 2] - ref[2]));

/**
 * Masque « extérieur du vêtement » : remplissage depuis les bords de l'image sur le fond blanc,
 * puis dilatation de quelques pixels pour écarter le liseré anticrénelé de la silhouette.
 */
function outsideMask({ data, w, h }, grow = 3) {
  const out = new Uint8Array(w * h);
  const stack = [];
  const isBg = (p) => data[p * 3] >= BG_LEVEL && data[p * 3 + 1] >= BG_LEVEL && data[p * 3 + 2] >= BG_LEVEL;
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (out[p] || !isBg(p)) continue;
    out[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  let cur = out;
  for (let g = 0; g < grow; g++) {
    const next = cur.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (!cur[p] && (cur[p - 1] || cur[p + 1] || cur[p - w] || cur[p + w])) next[p] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * Extrait le motif imprimé : on cherche, dans la zone du torse, les pixels qui s'écartent
 * nettement de la couleur du tissu, puis on rend le tissu transparent avec un fondu doux
 * et une « dé-prémultiplication » pour éviter les liserés blancs (ou noirs) autour du motif.
 */
async function extractPrint(file, outFile) {
  const img = await readRaw(file);
  const { data, w, h } = img;
  const sil = silhouette(img);
  const fabric = fabricColor(img);
  const outside = outsideMask(img);
  // Tissu foncé : les reflets des plis sont plus marqués → seuils plus hauts
  const dark = (fabric[0] + fabric[1] + fabric[2]) / 3 < 80;
  const keyLow = dark ? 55 : KEY_LOW;
  const keyHigh = dark ? 115 : KEY_HIGH;

  const zx0 = Math.round(w * 0.2), zx1 = Math.round(w * 0.8);
  const zy0 = Math.round(h * 0.17), zy1 = Math.round(h * 0.86);
  const colCount = new Array(w).fill(0);
  const rowCount = new Array(h).fill(0);
  for (let y = zy0; y < zy1; y++) {
    for (let x = zx0; x < zx1; x++) {
      if (outside[y * w + x]) continue;
      if (dist(data, (y * w + x) * 3, fabric) > keyHigh) { colCount[x]++; rowCount[y]++; }
    }
  }
  const MIN = dark ? 4 : 2; // ignore les pixels isolés (bruit de compression, reflets)
  let bx0 = colCount.findIndex((c) => c >= MIN);
  let by0 = rowCount.findIndex((c) => c >= MIN);
  if (bx0 < 0 || by0 < 0) return { fabric, sil, print: null, w, h };
  let bx1 = w - 1 - [...colCount].reverse().findIndex((c) => c >= MIN);
  let by1 = h - 1 - [...rowCount].reverse().findIndex((c) => c >= MIN);
  const pad = 4;
  bx0 = Math.max(zx0, bx0 - pad); by0 = Math.max(zy0, by0 - pad);
  bx1 = Math.min(zx1 - 1, bx1 + pad); by1 = Math.min(zy1 - 1, by1 + pad);

  const cw = bx1 - bx0 + 1, ch = by1 - by0 + 1;
  const rgba = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((y + by0) * w + (x + bx0)) * 3;
      const di = (y * cw + x) * 4;
      const d = outside[(y + by0) * w + (x + bx0)] ? 0 : dist(data, si, fabric);
      const t = Math.min(1, Math.max(0, (d - keyLow) / (keyHigh - keyLow)));
      const a = t * t * (3 - 2 * t);
      // Dé-prémultiplication : retire la part de tissu mélangée dans les pixels de bord
      const ad = Math.max(a, 0.35);
      for (let c = 0; c < 3; c++) {
        const v = (data[si + c] - (1 - ad) * fabric[c]) / ad;
        rgba[di + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
      rgba[di + 3] = Math.round(a * 255);
    }
  }
  // Agrandissement Lanczos (lissage du rééchantillonnage uniquement — aucun détail ajouté)
  const scale = Math.max(1, Math.min(3, 1024 / Math.max(cw, ch)));
  await sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } })
    .resize(Math.round(cw * scale), Math.round(ch * scale), { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(outFile);

  const sw = sil.x1 - sil.x0, sh = sil.y1 - sil.y0;
  return {
    fabric,
    print: {
      // rectangle du motif, normalisé dans la silhouette du vêtement (0..1, origine en haut à gauche)
      rect: [
        +((bx0 - sil.x0) / sw).toFixed(4), +((by0 - sil.y0) / sh).toFixed(4),
        +((bx1 - sil.x0) / sw).toFixed(4), +((by1 - sil.y0) / sh).toFixed(4),
      ],
    },
  };
}

const hex = (rgb) => '#' + rgb.map((c) => c.toString(16).padStart(2, '0')).join('');

async function toWebp(src, dest, maxSize) {
  let s = sharp(src);
  if (maxSize) s = s.resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true });
  await s.webp({ quality: 90 }).toFile(dest);
}

/** Rend le blanc transparent (logo 2D sur fond blanc). */
async function keyOutWhite(src, dest) {
  const { data, w, h } = await readRaw(src);
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const d = 255 - Math.min(data[i], data[i + 1], data[i + 2]);
    const a = Math.min(1, Math.max(0, (d - 8) / 60));
    const ad = Math.max(a, 0.35);
    for (let c = 0; c < 3; c++) rgba[j + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - (1 - ad) * 255) / ad)));
    rgba[j + 3] = Math.round(a * 255);
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toFile(dest);
}

/**
 * Bisou du bonnet de la figurine (planche de référence : lèvres roses, cœur Love&Faith blanc).
 * À partir des lèvres noires « Kiss Love.png » : noir → rose, blanc intérieur conservé,
 * fond (extérieur des lèvres) transparent, recadré au plus juste.
 */
async function makeBeanieKiss(src, dest) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = data[i + 3] / 255; // composite sur blanc
    for (let c = 0; c < 3; c++) rgb[j + c] = Math.round(data[i + c] * a + 255 * (1 - a));
  }
  const outside = outsideMask({ data: rgb, w, h }, 1);
  const PINK = [238, 88, 124];
  const out = Buffer.alloc(w * h * 4);
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let p = 0; p < w * h; p++) {
    if (outside[p]) continue;
    const lum = (rgb[p * 3] + rgb[p * 3 + 1] + rgb[p * 3 + 2]) / 765; // 0 noir → 1 blanc
    for (let c = 0; c < 3; c++) out[p * 4 + c] = Math.round(PINK[c] + (255 - PINK[c]) * lum);
    out[p * 4 + 3] = 255;
    const x = p % w, y = (p / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .resize(512, null, { kernel: 'lanczos3' })
    .png().toFile(dest);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.dirname(META_OUT), { recursive: true });
  const meta = {};

  for (const src of CREATION_SOURCES) {
    const dir = path.join(OUT, src.slug);
    fs.mkdirSync(dir, { recursive: true });
    const entry = { fabric: null, front: null, back: null };

    await toWebp(path.join(ROOT, src.icon), path.join(dir, 'icon.webp'), 640);
    if (src.iconCrop) {
      // recadrage optionnel (ex. bande blanche sous l'illustration)
      const m = await sharp(path.join(ROOT, src.icon)).metadata();
      await sharp(path.join(ROOT, src.icon))
        .extract({ left: 0, top: 0, width: m.width, height: Math.round(m.height * src.iconCrop) })
        .resize(640, 640, { fit: 'inside' }).webp({ quality: 90 }).toFile(path.join(dir, 'icon.webp'));
    }

    for (const side of ['front', 'back']) {
      const file = src[side];
      if (!file) continue;
      await toWebp(path.join(ROOT, file), path.join(dir, `${side}.webp`));
      if (src.extractPrints === false) continue;
      const res = await extractPrint(path.join(ROOT, file), path.join(dir, `print-${side}.png`));
      if (side === 'front' || !entry.fabric) entry.fabric = hex(res.fabric);
      entry[side] = res.print;
      console.log(`${src.slug} ${side}:`, res.print ? res.print.rect.join(' ') : '(pas de motif — dos uni)');
    }

    // Motif fourni directement (sans mockup exploitable) : ex. Masks & Hearts
    if (src.printFront) {
      const m = await sharp(path.join(ROOT, src.printFront.file)).metadata();
      const c = src.printFront.crop ?? [0, 0, 1, 1];
      await sharp(path.join(ROOT, src.printFront.file))
        .extract({
          left: Math.round(c[0] * m.width), top: Math.round(c[1] * m.height),
          width: Math.round((c[2] - c[0]) * m.width), height: Math.round((c[3] - c[1]) * m.height),
        })
        .png().toFile(path.join(dir, 'print-front.png'));
    }
    meta[src.slug] = entry;
  }

  fs.writeFileSync(META_OUT, JSON.stringify(meta, null, 2) + '\n');

  // ── Intro ──
  const introDir = path.join(ROOT, 'public', 'brand'); // (pas « intro » : collision de casse avec public/Intro sous Windows)
  fs.mkdirSync(introDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'Intro', 'Logo 3D.glb'), path.join(introDir, 'logo-3d.glb'));
  await keyOutWhite(path.join(ROOT, 'Intro', 'Logo 2D.png'), path.join(introDir, 'logo-2d.png'));
  await makeBeanieKiss(path.join(ROOT, 'public', 'Intro', 'Kiss Love.png'), path.join(introDir, 'beanie-kiss.png'));

  // Vidéo de fond : version web légère (sans piste audio). Nécessite ffmpeg (optionnel).
  try {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(ROOT, 'Intro', 'Intro.mp4'),
      '-an', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', '30', '-preset', 'slow',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(introDir, 'intro-bg.mp4')]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '1', '-i', path.join(ROOT, 'Intro', 'Intro.mp4'),
      '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '5', path.join(introDir, 'intro-poster.jpg')]);
    console.log('intro: vidéo web générée');
  } catch {
    console.warn('intro: ffmpeg introuvable — vidéo non régénérée (les fichiers existants sont conservés)');
  }
  console.log('Ressources prêtes →', path.relative(ROOT, OUT));
}

main().catch((e) => { console.error(e); process.exit(1); });
