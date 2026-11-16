/**
 * Génère les visuels SEO à partir des logos de la marque — node scripts/seo-assets.mjs
 *   public/brand/og-image.jpg        1200×630 : aperçu des liens partagés (Google, WhatsApp, Instagram, X…)
 *   public/brand/apple-touch-icon.png 180×180 : icône iPhone (écran d'accueil)
 *   public/brand/icon-192.png / icon-512.png  : icônes du manifeste web et des résultats de recherche
 */
import sharp from 'sharp';

const LOGO = 'public/brand/logo-2d.png';
const TITLE = 'public/brand/title-intro.png';

const bg = (w, h) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <radialGradient id="g" cx="50%" cy="45%" r="70%">
      <stop offset="0" stop-color="#5a0008"/><stop offset="0.55" stop-color="#1a0204"/><stop offset="1" stop-color="#050505"/>
    </radialGradient>
    <pattern id="d" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="1.6" fill="#ff1f3d" fill-opacity="0.13"/></pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#d)"/>
</svg>`);

// Image de partage : logo « Titre intro » + signature
const title = await sharp(TITLE).trim().resize({ width: 860 }).toBuffer();
const titleMeta = await sharp(title).metadata();
const caption = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="80">
  <text x="600" y="50" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-weight="700"
    font-size="34" fill="#f4ede9" letter-spacing="2">Love and Faith — streetwear, amour &amp; foi</text>
</svg>`);
await sharp(bg(1200, 630))
  .composite([
    { input: title, left: Math.round((1200 - titleMeta.width) / 2), top: Math.round(270 - titleMeta.height / 2) },
    { input: caption, left: 0, top: 470 },
  ])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile('public/brand/og-image.jpg');

// Icônes : logo rouge centré sur fond noir/rouge
for (const [size, file] of [[180, 'apple-touch-icon.png'], [192, 'icon-192.png'], [512, 'icon-512.png']]) {
  const logo = await sharp(LOGO).trim().resize({ width: Math.round(size * 0.78), height: Math.round(size * 0.78), fit: 'inside', kernel: 'lanczos3' }).toBuffer();
  const m = await sharp(logo).metadata();
  await sharp(bg(size, size))
    .composite([{ input: logo, left: Math.round((size - m.width) / 2), top: Math.round((size - m.height) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(`public/brand/${file}`);
}
console.log('Visuels SEO générés dans public/brand/.');
