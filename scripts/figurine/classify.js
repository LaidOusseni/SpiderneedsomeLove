// Classement d'un point de la figurine (front = +Z) en partie : relevé sur les rendus orthographiques gradués.
const HEAD_CZ = -0.018;
const HANDS = [[0.19, -0.172, 0.028, 0.06, 0.058, 0.075], [-0.19, -0.16, 0.035, 0.062, 0.066, 0.075]];
const headR = (x, z) => Math.hypot(x / 0.118, (z - HEAD_CZ) / 0.112);
export default function classify(x, y, z, nx = 0, ny = 0, nz = 0) {
  const ax = Math.abs(x);
  // Bonnet : au-dessus du bord du revers, ou revers (plus large que la tête)
  if (y > 0.318) return 'bonnet';
  if (y > 0.294 && headR(x, z) > 1.1) return 'bonnet';
  // Tête et cou
  // col rond du sweat : frontière horizontale là où le cou rejoint les épaules
  if (y > 0.181) return 'skin';
  // Mains en C : ellipsoïdes relevés sur les vues de face et de profil, sous le bas des manches
  if (y < -0.131 && ax > 0.138) {
    for (const [cx, cy, cz, rx, ry, rz] of HANDS) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 < 1) return 'hand';
    }
  }
  // Sweat (torse + manches)
  if (y > -0.112) return 'sweat';
  if (ax > 0.17 && y > -0.131) return 'sweat';
  // Ceinture / boucle
  if (y > -0.149) {
    if (ax < 0.028 && z > 0.05) return 'buckle';
    return 'belt';
  }
  // Baskets : semelles + bout qui dépasse vers l'avant
  if (y < -0.468) return 'shoe';
  if (y < -0.418 && z > 0.1 && ny > -0.2) return 'shoe'; // pas le dessous retourné de l'ourlet
  if (y < -0.452 && z > -0.02) return 'shoe'; // empeigne sous l'ourlet (moitié avant du pied)
  if (y < -0.428 && z > 0.03 && ny > 0.2) return 'shoe'; // dessus du bout de la basket, devant l'ourlet
  return 'jeans';
}
