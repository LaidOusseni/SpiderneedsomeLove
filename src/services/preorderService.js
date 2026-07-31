/**
 * src/services/preorderService.js
 *
 * Toutes les interactions avec la table Supabase `preorders`.
 * Les composants React ne doivent JAMAIS importer supabase directement.
 *
 * Table schema (à créer dans Supabase) :
 * ─────────────────────────────────────────────────────
 * CREATE TABLE preorders (
 *   id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   first_name  TEXT NOT NULL,
 *   last_name   TEXT NOT NULL,
 *   instagram   TEXT,
 *   email       TEXT,
 *   product     TEXT NOT NULL,
 *   size        TEXT NOT NULL,
 *   quantity    INTEGER DEFAULT 1,
 *   status      TEXT DEFAULT 'pending',
 *   created_at  TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * RLS — activer Row Level Security et ajouter la politique :
 * CREATE POLICY "allow_insert" ON preorders FOR INSERT WITH CHECK (true);
 * CREATE POLICY "allow_count"  ON preorders FOR SELECT USING (true);
 * ─────────────────────────────────────────────────────
 */

import { supabase } from './supabase';

/**
 * Soumet une précommande dans Supabase.
 *
 * @param {Object} formData
 *   { nom, prenom, instagram, email, taille, quantite, productId }
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function submitPreorder(formData) {
  const payload = {
    first_name: formData.prenom,
    last_name:  formData.nom,
    instagram:  formData.instagram || null,
    email:      formData.email     || null,
    product:    formData.productId,
    size:       formData.taille,
    quantity:   Number(formData.quantite) || 1,
    status:     'pending',
  };

  const { error } = await supabase.from('preorders').insert([payload]);

  if (error) {
    console.error('[preorderService] Erreur Supabase:', error.message);
    throw new Error(error.message);
  }

  return { success: true, message: 'Précommande enregistrée avec succès.' };
}

/**
 * Retourne le nombre total de précommandes.
 * Utilisé pour afficher le compteur communautaire.
 *
 * @returns {Promise<number>} — 0 en cas d'erreur (ne fait pas planter le site)
 */
export async function countPreorders() {
  const { count, error } = await supabase
    .from('preorders')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.warn('[preorderService] countPreorders — erreur:', error.message);
    return 0;
  }

  return count ?? 0;
}

/**
 * Récupère toutes les précommandes (usage admin futur).
 *
 * @returns {Promise<Array>}
 */
export async function getPreorders() {
  const { data, error } = await supabase
    .from('preorders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[preorderService] getPreorders — erreur:', error.message);
    return [];
  }

  return data ?? [];
}
