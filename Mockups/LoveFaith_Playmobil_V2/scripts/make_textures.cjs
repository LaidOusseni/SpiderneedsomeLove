/**
 * Textures graphiques de la figurine Love&Faith V2 (SVG → PNG via sharp).
 * Les repères (en px de la planche, 1 px = 1/460 de la hauteur) sont ceux de build_figure.py :
 *   - visage : X -45..45, Z 315..395, 10 texels/px ;
 *   - inscription arrière : X -7..7 × longueur d'arc 0..120 du bonnet, 10 texels/px ;
 *   - ceinture : u = tour de taille (u 0,5 = devant), v = hauteur ;
 *   - baskets : u = tour de la tige (0,75 = bout), v = hauteur 10..44.
 * Usage : node Mockups/LoveFaith_Playmobil_V2/scripts/make_textures.cjs <dossier de sortie>
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const out = process.argv[2] || path.join(__dirname, '../textures');
fs.mkdirSync(out, { recursive: true });

const save = (name, w, h, body) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`))
    .png()
    .toFile(path.join(out, name));

// ---------- Visage : (X, Z) en px → texels ----------
const FX = (x) => ((x + 45) * 10).toFixed(1);
const FZ = (z) => ((395 - z) * 10).toFixed(1);
const fp = (pts) => pts.map(([x, z], i) => `${i ? 'L' : 'M'}${FX(x)},${FZ(z)}`).join(' ');
const INK = '#120a06';

function eyes() {
  let s = '';
  for (const side of [-1, 1]) {
    const cx = 19 * side;
    s += `<ellipse cx="${FX(cx)}" cy="${FZ(367)}" rx="60" ry="70" fill="#070707"/>`;
    // reflet blanc, en haut à droite sur les deux yeux (même lumière)
    s += `<circle cx="${FX(cx + 0.9)}" cy="${FZ(368.8)}" r="18" fill="#fff"/>`;
    // petit cil en haut, côté extérieur
    s += `<path d="M${FX(cx + 3.6 * side)},${FZ(372.4)} Q${FX(cx + 6.2 * side)},${FZ(374.4)} ${FX(cx + 7.6 * side)},${FZ(373.6)}"
      stroke="#070707" stroke-width="9" stroke-linecap="round" fill="none"/>`;
  }
  return s;
}

function ink() {
  let s = '';
  // sourcils épais, légèrement arqués, extrémité extérieure effilée et un peu plus basse
  for (const side of [-1, 1]) {
    const m = (x) => x * side * 1.18;
    const top = [[m(6.6), 379.6], [m(12), 382.2], [m(19), 382.8], [m(25), 381.4], [m(28.4), 378.6]];
    const bot = [[m(27.6), 377.6], [m(24), 378.4], [m(18), 378.8], [m(11.5), 377.8], [m(6.8), 376.4]];
    s += `<path d="${fp(top)} ${fp(bot).replace('M', 'L')} Z" fill="${INK}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`;
  }
  // moustache : chevron épais au centre, pointes fines tombant légèrement
  const mt = [[-15.5, 344.0], [-10, 346.6], [-3, 348.0], [0, 347.4], [3, 348.0], [10, 346.6], [15.9, 344.0]];
  const mb = [[15.9, 343.6], [10, 344.2], [3, 344.6], [0, 344.8], [-3, 344.6], [-10, 344.2], [-15.5, 343.6]];
  s += `<path d="${fp(mt)} ${fp(mb).replace('M', 'L')} Z" fill="${INK}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
  // lèvre inférieure : arc fin
  s += `<path d="M${FX(-6.8)},${FZ(339.6)} Q${FX(0.6)},${FZ(336.2)} ${FX(7.8)},${FZ(339.6)}" stroke="${INK}" stroke-width="12" stroke-linecap="round" fill="none"/>`;
  // pli du menton : arc plus large et plus léger
  s += `<path d="M${FX(-9.5)},${FZ(331.4)} Q${FX(1)},${FZ(328.8)} ${FX(11.5)},${FZ(331.4)}" stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.85"/>`;
  // nez discret : léger trait d'ombre
  s += `<path d="M${FX(-3.6)},${FZ(352.4)} Q${FX(0.4)},${FZ(350.6)} ${FX(4.2)},${FZ(352.4)}" stroke="${INK}" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.22"/>`;
  return s;
}

// ---------- Inscription arrière du bonnet ----------
// X -8,5..8,5 → 0..170 ; arc 0 (bord) .. 120 (sommet) → y 1200..0
function backText() {
  const letters = ['L', 'O', 'V', 'E', '&amp;', 'F', 'A', 'I', 'T', 'H'];
  let s = '';
  letters.forEach((l, i) => {
    const arc = 101 - i * 9.9; // haut de la lettre : le L reste lisible avant le sommet du dôme
    const y = (120 - arc) * 10 + 86; // ligne de base
    s += `<text x="85" y="${y.toFixed(0)}" text-anchor="middle" font-family="Times New Roman, serif" font-weight="bold"
      font-size="${l === '&amp;' ? 100 : 114}" fill="#1642b8">${l}</text>`;
  });
  return s;
}

// ---------- Ceinture (boucle à u = 0,5) ----------
function belt(W, H) {
  const edge = H * 0.12;
  let s = `<rect width="${W}" height="${H}" fill="#6f4519"/>`;
  // grain et patine
  s += `<rect width="${W}" height="${H}" fill="url(#g)" opacity="0.35"/>`;
  s += `<rect width="${W}" height="${edge}" fill="#141009"/><rect y="${H - edge}" width="${W}" height="${edge}" fill="#141009"/>`;
  // surpiqûre sombre le long des bords
  s += `<line x1="0" x2="${W}" y1="${edge * 1.7}" y2="${edge * 1.7}" stroke="#3a2512" stroke-width="3" stroke-dasharray="14 8"/>`;
  s += `<line x1="0" x2="${W}" y1="${H - edge * 1.7}" y2="${H - edge * 1.7}" stroke="#3a2512" stroke-width="3" stroke-dasharray="14 8"/>`;
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.4"/><stop offset="1" stop-color="#000"/></linearGradient></defs>`;
  return defs + s;
}

// Pointe de la ceinture (dépasse de la boucle) : trous + chevrons noirs, u 0 = boucle, u 1 = pointe
function beltTail(W, H) {
  let s = belt(W, H);
  for (let i = 0; i < 3; i++) s += `<ellipse cx="${W * (0.12 + i * 0.16)}" cy="${H / 2}" rx="${H * 0.1}" ry="${H * 0.12}" fill="#120c06"/>`;
  // chevrons noirs vers la pointe
  for (let i = 0; i < 2; i++) {
    const x = W * (0.62 + i * 0.17);
    s += `<path d="M${x},${H * 0.12} L${x + H * 0.32},${H / 2} L${x},${H * 0.88} L${x + H * 0.14},${H * 0.88} L${x + H * 0.46},${H / 2} L${x + H * 0.14},${H * 0.12} Z" fill="#141009"/>`;
  }
  s += `<path d="M${W * 0.95},0 L${W},${H / 2} L${W * 0.95},${H} L${W},${H} L${W},0 Z" fill="#141009"/>`;
  return s;
}

// ---------- Tige des baskets ----------
function shoe(W, H) {
  const U = (u) => (u * W).toFixed(1);
  const V = (v) => ((1 - v) * H).toFixed(1);
  const pl = (pts) => pts.map(([u, v], i) => `${i ? 'L' : 'M'}${U(u)},${V(v)}`).join(' ');
  const seam = '#9d9d97';
  let s = `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  // bout rapporté (toe cap) autour de u = 0,75
  const cap = [[0.6, 0.0], [0.615, 0.25], [0.645, 0.5], [0.69, 0.66], [0.75, 0.71], [0.81, 0.66], [0.855, 0.5], [0.885, 0.25], [0.9, 0.0]];
  s += `<path d="${pl(cap)}" stroke="${seam}" stroke-width="5" fill="none"/>`;
  s += `<path d="${pl(cap.map(([u, v]) => [0.75 + (u - 0.75) * 0.94, v * 0.93]))}" stroke="${seam}" stroke-width="3" stroke-dasharray="7 6" fill="none"/>`;
  // perforations du bout
  for (let r = 0; r < 4; r++) {
    for (let c = -4; c <= 4; c++) {
      const v = 0.3 + r * 0.095;
      const spread = 0.085 - r * 0.012;
      const u = 0.75 + (c / 4) * spread + (r % 2 ? 0.006 : 0);
      if (Math.abs(c) === 4 && r > 1) continue;
      s += `<circle cx="${U(u)}" cy="${V(v)}" r="5" fill="#77776f"/>`;
    }
  }
  // pare-boue (bande basse) + empiècement latéral + contrefort
  s += `<line x1="0" x2="${W}" y1="${V(0.16)}" y2="${V(0.16)}" stroke="${seam}" stroke-width="4"/>`;
  s += `<line x1="0" x2="${W}" y1="${V(0.13)}" y2="${V(0.13)}" stroke="${seam}" stroke-width="2.5" stroke-dasharray="7 6"/>`;
  for (const sym of [1, -1]) {
    const m = (u) => 0.75 + (u - 0.75) * sym;
    // empiècement latéral en arc (sans logo de marque)
    s += `<path d="M${U(m(0.6))},${V(0.62)} Q${U(m(0.5))},${V(0.36)} ${U(m(0.4))},${V(0.5)}" stroke="${seam}" stroke-width="4" fill="none"/>`;
    s += `<path d="M${U(m(0.585))},${V(0.56)} Q${U(m(0.5))},${V(0.32)} ${U(m(0.415))},${V(0.44)}" stroke="${seam}" stroke-width="2.5" stroke-dasharray="7 6" fill="none"/>`;
  }
  // contrefort du talon (u = 0,25)
  const heel = [[0.13, 0.16], [0.16, 0.55], [0.2, 0.8], [0.25, 0.86], [0.3, 0.8], [0.34, 0.55], [0.37, 0.16]];
  s += `<path d="${pl(heel)}" stroke="${seam}" stroke-width="5" fill="none"/>`;
  // œillets : bande de laçage
  for (const sym of [1, -1]) {
    const u = 0.75 + 0.06 * sym;
    s += `<line x1="${U(u)}" x2="${U(0.75 + 0.03 * sym)}" y1="${V(0.62)}" y2="${V(1)}" stroke="${seam}" stroke-width="4"/>`;
  }
  return s;
}

function sole(W, H) {
  let s = `<rect width="${W}" height="${H}" fill="#ecece8"/>`;
  s += `<line x1="0" x2="${W}" y1="${H * 0.42}" y2="${H * 0.42}" stroke="#8f8f8a" stroke-width="7"/>`;
  s += `<line x1="0" x2="${W}" y1="${H * 0.25}" y2="${H * 0.25}" stroke="#c8c8c3" stroke-width="3" stroke-dasharray="9 7"/>`;
  // nervures verticales sur le bas, côté talon et côtés
  for (let u = 0.02; u < 1; u += 0.006) {
    const heel = u > 0.08 && u < 0.42;
    if (!heel) continue;
    s += `<line x1="${u * W}" x2="${u * W}" y1="${H * 0.55}" y2="${H * 0.85}" stroke="#c4c4bf" stroke-width="3"/>`;
  }
  return s;
}

(async () => {
  await save('face_eyes.png', 900, 800, eyes());
  await save('face_ink.png', 900, 800, ink());
  await save('beanie_back_text.png', 170, 1200, backText());
  await save('belt.png', 3400, 140, belt(3400, 140));
  await save('belt_tail.png', 400, 140, beltTail(400, 140));
  await save('shoe_upper.png', 2048, 512, shoe(2048, 512));
  await save('shoe_sole.png', 2048, 128, sole(2048, 128));
  fs.copyFileSync(path.join(__dirname, '../../../public/brand/beanie-kiss.png'), path.join(out, 'beanie_kiss.png'));
  console.log('textures →', out);
})();
