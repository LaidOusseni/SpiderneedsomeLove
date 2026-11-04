/**
 * Planche de rendu : six angles (rangée du haut) + gros plans (rangée du bas), d'après renders/*.png.
 * Usage : node make_sheet.cjs [dossier des rendus] [sortie.png]
 */
const path = require('path');
const sharp = require('sharp');

const dir = process.argv[2] || path.join(__dirname, '../renders');
const out = process.argv[3] || path.join(dir, 'planche-rendu.png');
const ANGLES = [
  ['face', 'FACE'], ['trois-quarts-avant', '3/4 AVANT'], ['profil-gauche', 'PROFIL GAUCHE'],
  ['dos', 'DOS'], ['profil-droit', 'PROFIL DROIT'], ['trois-quarts-arriere', '3/4 ARRIÈRE'],
];
const CLOSE = [
  ['gros-plan-visage', 'VISAGE'], ['gros-plan-bonnet-avant', 'BONNET (AVANT)'], ['gros-plan-bonnet-arriere', 'BONNET (ARRIÈRE)'],
  ['gros-plan-sweat', 'SWEAT'], ['gros-plan-main', 'MAIN ET POIGNET'], ['gros-plan-ceinture', 'CEINTURE'],
  ['gros-plan-baskets', 'BASKETS'], ['gros-plan-jean-dos', 'JEAN'],
];
const TW = 400;
const TH = 600;
const CW = 300;
const CH = 400;
const W = TW * 6;
const H = 110 + TH + 50 + 60 + CH + 50;

const label = (text, x, y) =>
  `<text x="${x}" y="${y}" fill="#fff" font-family="Arial, sans-serif" font-size="20" letter-spacing="3" text-anchor="middle">${text}</text>`;

(async () => {
  const layers = [];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <text x="40" y="62" fill="#fff" font-family="Georgia, serif" font-style="italic" font-weight="bold" font-size="48">Playmobil Love&amp;Faith</text>
    <text x="42" y="96" fill="#e0262f" font-family="Arial, sans-serif" font-size="20" letter-spacing="4">MODÈLE BLENDER — VUE GÉNÉRALE 360°</text>`;
  for (const [i, [f, t]] of ANGLES.entries()) {
    layers.push({ input: await sharp(path.join(dir, f + '.png')).resize(TW, TH, { fit: 'cover' }).toBuffer(), left: i * TW, top: 110 });
    svg += label(t, i * TW + TW / 2, 110 + TH + 34);
  }
  const y2 = 110 + TH + 50 + 60;
  svg += `<text x="40" y="${y2 - 20}" fill="#e0262f" font-family="Arial, sans-serif" font-size="20" letter-spacing="4">DÉTAILS</text>`;
  for (const [i, [f, t]] of CLOSE.entries()) {
    layers.push({ input: await sharp(path.join(dir, f + '.png')).resize(CW, CH, { fit: 'cover', position: 'centre' }).toBuffer(), left: i * CW, top: y2 });
    svg += label(t, i * CW + CW / 2, y2 + CH + 34);
  }
  svg += '</svg>';
  layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#0b0405' } }).composite(layers).png().toFile(out);
  console.log(out);
})();
