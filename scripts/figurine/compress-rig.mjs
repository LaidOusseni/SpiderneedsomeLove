/**
 * Publie le modèle riggé (7 poses) pour le site : compression meshopt de l'export Blender
 * (Mockups/LoveFaith_Playmobil_V2/LoveFaith_Playmobil_V2_rig.glb, produit par scripts/export_rig_glb.py)
 * vers public/models/lovefaith-figure.glb. L'ancien modèle statique est sauvegardé dans Mockups/backup-site-models/.
 * Usage : node scripts/figurine/compress-rig.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compressGlb } from './compress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'Mockups/LoveFaith_Playmobil_V2/LoveFaith_Playmobil_V2_rig.glb');
const DST = path.join(ROOT, 'public/models/lovefaith-figure.glb');

const { before, after } = await compressGlb(SRC, DST);
console.log(`géométrie ${(before / 1e6).toFixed(1)} → ${(after / 1e6).toFixed(1)} Mo ; fichier ${(fs.statSync(DST).size / 1e6).toFixed(2)} Mo`);
