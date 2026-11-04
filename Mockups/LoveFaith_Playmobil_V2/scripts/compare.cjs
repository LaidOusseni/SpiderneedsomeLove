/**
 * Planche de comparaison : vues de la planche de référence (rangée du haut) / rendus Blender (rangée du bas).
 * Usage : node compare.cjs <dossier des rendus> <sortie.png> [vue1,vue2,...]
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const REF = path.join(__dirname, '../../Planche reference 3D Love&Faith V3.png');
// découpes de la planche V3 (px) : x, largeur — rangée y 70..520
const CROPS = {
  face: [20, 240],
  'trois-quarts-avant': [270, 240],
  'profil-gauche': [520, 240],
  dos: [770, 240],
  'profil-droit': [1030, 240],
  'trois-quarts-arriere': [1280, 240],
};
const [dir, out, list] = process.argv.slice(2);
const views = (list || Object.keys(CROPS).join(',')).split(',').filter((v) => fs.existsSync(path.join(dir, v + '.png')));
const H = 600;
const W = 400;

(async () => {
  const tiles = [];
  for (const [i, v] of views.entries()) {
    const [x, w] = CROPS[v];
    const ref = await sharp(REF).extract({ left: x, top: 70, width: w, height: 450 })
      .resize(W, H, { fit: 'contain', background: '#000' }).png().toBuffer();
    const ren = await sharp(path.join(dir, v + '.png')).resize(W, H, { fit: 'contain', background: '#000' }).png().toBuffer();
    tiles.push({ input: ref, left: i * W, top: 0 }, { input: ren, left: i * W, top: H });
  }
  await sharp({ create: { width: W * views.length, height: H * 2, channels: 3, background: '#000' } })
    .composite(tiles).png().toFile(out);
  console.log(out);
})();
