/**
 * Superpose le contour (cyan) des silhouettes orthographiques du modèle sur les vues d'une planche de référence,
 * ramenée à l'échelle du modèle (figurine de 460 px) et alignée sur le sol.
 * Usage : node overlay.cjs <dossier sil-*.png> <sortie.png> [planche]
 *   planche : « v3 » (défaut, planche orthographique) ou « v1 » (première planche)
 */
const path = require('path');
const sharp = require('sharp');

const PLANCHES = {
  // sol (y), échelle planche → modèle, centre horizontal de chaque vue
  v1: {
    file: '../../Planche personnage Playmobil Love&Faith.png', ground: 542, scale: 1,
    centers: { face: 118, 'profil-gauche': 486, dos: 681 },
  },
  v3: {
    file: '../../Planche reference 3D Love&Faith V3.png', ground: 507, scale: 460 / 425,
    centers: { face: 134.5, 'profil-gauche': 637.5, dos: 890, 'profil-droit': 1150 },
  },
};
const [dir, out, which = 'v3'] = process.argv.slice(2);
const P = PLANCHES[which];
const REF = path.join(__dirname, P.file);
const W = 300;
const H = 520; // px du modèle ; sol à 30 px du bas (voir silhouette.py)

async function outline(file) {
  const { data, info } = await sharp(file).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const rgba = Buffer.alloc(w * h * 4);
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && data[y * w + x] > 127;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = on(x, y);
      if (v !== on(x + 1, y) || v !== on(x, y + 1) || v !== on(x - 1, y) || v !== on(x, y - 1) ||
          v !== on(x + 2, y) || v !== on(x, y + 2)) {
        const i = (y * w + x) * 4;
        rgba[i] = 0; rgba[i + 1] = 255; rgba[i + 2] = 255; rgba[i + 3] = 255;
      }
    }
  }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

(async () => {
  const meta = await sharp(REF).metadata();
  const tiles = [];
  const names = Object.keys(P.centers);
  for (const [i, n] of names.entries()) {
    const cw = Math.round(W / P.scale);
    const ch = Math.round(H / P.scale);
    const left = Math.round(P.centers[n] - cw / 2);
    const top = Math.round(P.ground - (H - 30) / P.scale);
    const x0 = Math.max(0, left);
    const x1 = Math.min(meta.width, left + cw);
    // étapes séparées : dans un même pipeline, sharp redimensionne avant d'étendre
    const crop = await sharp(REF).extract({ left: x0, top, width: x1 - x0, height: ch })
      .extend({ left: x0 - left, right: left + cw - x1, background: '#000' }).toBuffer();
    const ref = await sharp(crop).resize(W * 2, H * 2, { fit: 'fill' }).toBuffer();
    const line = await outline(path.join(dir, `sil-${n}.png`));
    tiles.push({ input: await sharp(ref).composite([{ input: line }]).png().toBuffer(), left: i * W * 2, top: 0 });
  }
  await sharp({ create: { width: W * 2 * names.length, height: H * 2, channels: 3, background: '#000' } })
    .composite(tiles).png().toFile(out);
  console.log(out);
})();
