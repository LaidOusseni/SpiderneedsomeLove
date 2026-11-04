/**
 * Régénère uniquement les mockups 2D détourés (public/creations/<slug>/front.webp, back.webp) à partir des PNG
 * originaux de Mockups/ — sans relancer tout `npm run assets`. Les sources ne sont jamais modifiées.
 * Usage : node scripts/cutout-mockups.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CREATION_SOURCES } from './creation-sources.mjs';
import { cutoutMockup } from './lib/cutout.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const src of CREATION_SOURCES) {
  if (src.extractPrints === false) continue; // couvertures comics (Masks & Hearts) : pas de vêtement à détourer
  for (const side of ['front', 'back']) {
    if (!src[side]) continue;
    const dest = path.join(ROOT, 'public', 'creations', src.slug, `${side}.webp`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const { coverage } = await cutoutMockup(path.join(ROOT, src[side]), dest);
    console.log(`${src.slug} ${side} : vêtement ${(coverage * 100).toFixed(1)} % de l'image`);
  }
}
