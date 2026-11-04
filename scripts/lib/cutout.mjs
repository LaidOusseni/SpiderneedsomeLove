/**
 * Détourage des mockups 2D (vêtement sur fond blanc pur) → WebP avec transparence réelle.
 *
 * 1. Seul le fond CONNECTÉ AUX BORDS de l'image est retiré (remplissage depuis les bords sur le blanc pur) :
 *    les blancs du vêtement lui-même — tissu, motif — restent opaques.
 * 2. La silhouette obtenue est lissée (flou puis seuil) : les « dents » où le remplissage a mordu dans un reflet
 *    blanc du bord disparaissent, sans rogner le vêtement.
 * 3. Bord anticrénelé sur ~1 px ; la couleur des pixels de bord est reprise des pixels intérieurs voisins
 *    (ni liseré blanc sur fond sombre, ni points noirs). Aucun mode de fusion, aucune translucidité du vêtement.
 */
import sharp from 'sharp';

const BG = 254; // fond = pixels quasi blancs (3 canaux ≥ BG) reliés au bord de l'image

function backgroundMask(data, w, h) {
  const bg = new Uint8Array(w * h);
  const isBg = (p) => data[p * 3] >= BG && data[p * 3 + 1] >= BG && data[p * 3 + 2] >= BG;
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (bg[p] || !isBg(p)) continue;
    bg[p] = 1;
    const x = p % w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w);
    if (p < w * (h - 1)) stack.push(p + w);
  }
  return bg;
}

const gray = (buf, w, h) => sharp(buf, { raw: { width: w, height: h, channels: 1 } });
const blurred = (buf, w, h, sigma) => gray(buf, w, h).blur(sigma).extractChannel(0).raw().toBuffer();

/**
 * @param {string} src  image source (PNG/JPEG, fond blanc)
 * @param {string} dest fichier .webp de sortie (avec alpha)
 * @returns {{ coverage: number }} part de l'image occupée par le vêtement (contrôle)
 */
export async function cutoutMockup(src, dest) {
  const { data, info } = await sharp(src).flatten({ background: '#ffffff' }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const bg = backgroundMask(data, w, h);

  // silhouette lissée : flou du masque binaire puis seuil (comble les morsures de quelques pixels)
  const raw = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) raw[p] = bg[p] ? 0 : 255;
  const smooth = await blurred(raw, w, h, 2.2);
  const shape = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) shape[p] = smooth[p] >= 150 ? 255 : 0; // seuil > 50 % : bord resserré d'une fraction de pixel
  // bord anticrénelé
  const alpha = await blurred(shape, w, h, 0.7);

  // « cœur » = pixels entièrement entourés de vêtement sur ~5 px (masque flouté saturé) : les pixels anticrénelés
  // de la source, mélangés au blanc du fond, n'en font pas partie
  const core = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) core[p] = smooth[p] >= 254 && !bg[p] ? 1 : 0;

  // couleur : cœur conservé tel quel ; bord = moyenne des pixels du cœur voisins (rayon 8)
  const rgba = Buffer.alloc(w * h * 4);
  let inside = 0;
  for (let p = 0; p < w * h; p++) {
    const a = alpha[p];
    rgba[p * 4 + 3] = a;
    if (a === 0) continue;
    inside += a / 255;
    const solid = core[p] === 1;
    if (solid) {
      rgba[p * 4] = data[p * 3]; rgba[p * 4 + 1] = data[p * 3 + 1]; rgba[p * 4 + 2] = data[p * 3 + 2];
      continue;
    }
    const x = p % w;
    const y = (p / w) | 0;
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -8; dx <= 8; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (core[q]) { r += data[q * 3]; g += data[q * 3 + 1]; b += data[q * 3 + 2]; n++; }
      }
    }
    if (n) { rgba[p * 4] = r / n; rgba[p * 4 + 1] = g / n; rgba[p * 4 + 2] = b / n; }
    else { rgba[p * 4] = data[p * 3]; rgba[p * 4 + 1] = data[p * 3 + 1]; rgba[p * 4 + 2] = data[p * 3 + 2]; }
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(dest);
  return { coverage: inside / (w * h) };
}
