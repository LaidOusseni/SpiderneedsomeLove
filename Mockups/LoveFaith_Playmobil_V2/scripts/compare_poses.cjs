/**
 * Planche de comparaison des poses : les 7 poses de la planche (rangée du haut) / les rendus du rig (rangée du bas).
 * Usage : node compare_poses.cjs <dossier des rendus Pose_*.png> <sortie.png>
 */
const path = require('path');
const sharp = require('sharp');

const REF = path.join(__dirname, '../../Planche personnage Playmobil Love&Faith.png');
// cases des poses sur la planche (x, largeur) — rangée y 640..940
const CROPS = [[14, 150], [171, 156], [334, 158], [497, 165], [664, 158], [824, 162], [994, 178]];
const NAMES = ['Pose_1_Neutre', 'Pose_2_Bras_croises', 'Pose_3_Main_dans_la_poche', 'Pose_4_Pouce_vers_l_avant',
  'Pose_5_Regard_de_cote', 'Pose_6_Ajuste_le_bonnet', 'Pose_7_Assis'];
const [dir, out] = process.argv.slice(2);
const W = 300;
const H = 450;

(async () => {
  const tiles = [];
  for (const [i, n] of NAMES.entries()) {
    const [x, w] = CROPS[i];
    const ref = await sharp(REF).extract({ left: x, top: 640, width: w, height: 300 })
      .resize(W, H, { fit: 'contain', background: '#000' }).png().toBuffer();
    const ren = await sharp(path.join(dir, n + '.png')).resize(W, H, { fit: 'contain', background: '#000' }).png().toBuffer();
    tiles.push({ input: ref, left: i * W, top: 0 }, { input: ren, left: i * W, top: H });
  }
  await sharp({ create: { width: W * NAMES.length, height: H * 2, channels: 3, background: '#000' } })
    .composite(tiles).png().toFile(out);
  console.log(out);
})();
