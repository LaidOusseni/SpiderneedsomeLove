/**
 * ⚠ EXPÉRIMENTAL — NON APPLIQUÉ AU SITE (14/11/2026) : le GLB produit (3,07 Mo au lieu de 6,71) déclenche une erreur de
 * shader sur le matériau « Baskets » (« uv4294967295 », three.js r169), absente avec le modèle actuel. À reprendre
 * (piste : vérifier les attributs/matériaux des maillages Basket_G / Basket_D) avant toute publication.
 *
 * Publie la figurine riggée pour le site avec gltfpack (meshoptimizer) — remplace la compression « flottants seuls »
 * de compress-rig.mjs.
 *
 * Gain (~54 %, 6,7 → 3,1 Mo) : compression meshopt de la géométrie (index + attributs filtrés), os/poids sur 8 bits
 * (KHR_mesh_quantization), animations compactées.
 * Qualité préservée :
 *   - aucun triangle supprimé (pas de simplification) ;
 *   - positions conservées en flottants (aucune perte, et structure des nœuds identique à l'export Blender :
 *     le site projette les impressions sur la géométrie du sweat) ; UV et normales en flottants
 *     (quantifiés, ils provoquent une erreur de shader sur le matériau « Baskets » avec three.js r169) ;
 *   - animations (7 poses) conservées sans rééchantillonnage, pistes constantes comprises ;
 *   - noms des nœuds et matériaux conservés (Sweat, Tabouret, os « torse » utilisés par le site) ;
 *   - textures recopiées sans recompression.
 *
 * Usage : npm run figurine:optimize   (source par défaut : export Blender du rig V2)
 *         node scripts/figurine/optimize-glb.mjs <source.glb> [destination.glb]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.resolve(process.argv[2] ?? path.join(ROOT, 'Mockups/LoveFaith_Playmobil_V2/LoveFaith_Playmobil_V2_rig.glb'));
const DST = path.resolve(process.argv[3] ?? path.join(ROOT, 'public/models/lovefaith-figure.glb'));
const BACKUP_DIR = path.join(ROOT, 'Mockups/backup-site-models');

if (!fs.existsSync(SRC)) {
  console.error(`Source introuvable : ${SRC}`);
  process.exit(1);
}

// Sauvegarde du modèle actuellement publié (une fois par jour)
if (fs.existsSync(DST)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const backup = path.join(BACKUP_DIR, `lovefaith-figure_avant-optimisation_${stamp}.glb`);
  if (!fs.existsSync(backup)) fs.copyFileSync(DST, backup);
}

const cli = require.resolve('gltfpack/cli.js');
const tmp = `${DST}.tmp.glb`;
execFileSync(process.execPath, [
  cli,
  '-i', SRC,
  '-o', tmp,
  '-cc',            // compression meshopt (taux élevé)
  '-kn', '-km', '-ke', // conserver noms de nœuds, matériaux, extras
  '-vpf',           // positions en flottants (pas de nœud de déquantification autour de « Sweat »)
  '-vnf',           // normales en flottants
  '-vtf',           // UV en flottants (sinon gltfpack ajoute KHR_texture_transform → erreur de shader « Baskets »)
  '-af', '0',       // pas de rééchantillonnage des poses
  '-ac',            // conserver les pistes constantes (chaque pose reste complète)
], { stdio: 'inherit' });
fs.renameSync(tmp, DST);

/**
 * gltfpack fusionne les entrées de texture identiques. Quand une même texture sert à deux emplacements d'un matériau
 * (ex. « Baskets » : couleur + normal map), three.js partage alors un seul objet Texture entre deux espaces de couleur
 * et produit un shader invalide (« uv4294967295 »). On redonne une entrée distincte à chaque emplacement
 * (seul l'index JSON change : l'image n'est pas dupliquée).
 */
function splitSharedTextures(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  let fixed = 0;
  for (const mat of gltf.materials ?? []) {
    const slots = [
      mat.pbrMetallicRoughness?.baseColorTexture, mat.pbrMetallicRoughness?.metallicRoughnessTexture,
      mat.normalTexture, mat.occlusionTexture, mat.emissiveTexture,
    ].filter(Boolean);
    const seen = new Set();
    for (const slot of slots) {
      if (seen.has(slot.index)) {
        gltf.textures.push({ ...gltf.textures[slot.index] });
        slot.index = gltf.textures.length - 1;
        fixed++;
      }
      seen.add(slot.index);
    }
  }
  if (!fixed) return 0;
  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  json = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const rest = buf.subarray(20 + jsonLen); // chunk binaire inchangé
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + rest.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  fs.writeFileSync(file, Buffer.concat([header, json, rest]));
  return fixed;
}
const split = splitSharedTextures(DST);
if (split) console.log(`${split} emplacement(s) de texture partagé(s) séparé(s)`);

// Vérifications : les éléments utilisés par le site existent toujours
const glb = fs.readFileSync(DST);
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
const names = new Set([...(json.nodes ?? []).map((n) => n.name), ...(json.meshes ?? []).map((m) => m.name)]);
const clips = (json.animations ?? []).map((a) => a.name);
const missing = ['Sweat', 'Tabouret', 'torse'].filter((n) => !names.has(n));
if (missing.length) console.warn(`⚠ Nœuds attendus absents : ${missing.join(', ')}`);
if (clips.length !== 7) console.warn(`⚠ ${clips.length} poses trouvées (7 attendues) : ${clips.join(', ')}`);
console.log(`${path.relative(ROOT, SRC)} (${(fs.statSync(SRC).size / 1e6).toFixed(2)} Mo) → ${path.relative(ROOT, DST)} (${(glb.length / 1e6).toFixed(2)} Mo), ${clips.length} poses`);
