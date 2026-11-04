/**
 * src/services/newsletterService.js
 *
 * Toutes les interactions avec la table Supabase `newsletter`.
 *
 * Table schema (à créer dans Supabase) :
 * ─────────────────────────────────────────────────────
 * CREATE TABLE newsletter (
 *   id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   email      TEXT NOT NULL UNIQUE,
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * RLS — activer Row Level Security et ajouter la politique :
 * CREATE POLICY "allow_insert" ON newsletter FOR INSERT WITH CHECK (true);
 * ─────────────────────────────────────────────────────
 */

import { supabase } from './supabase';

/**
 * Inscrit un e-mail à la newsletter.
 * Si l'e-mail est déjà présent (UNIQUE), on ignore l'erreur silencieusement.
 *
 * @param {string} email
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function subscribe(email) {
  if (!email || !email.includes('@')) {
    return { success: false, message: 'Adresse e-mail invalide.' };
  }

  if (!supabase) throw new Error('Supabase non configuré');

  const { error } = await supabase
    .from('newsletter')
    .insert([{ email: email.trim().toLowerCase() }]);

  // Code 23505 = UNIQUE violation (email déjà inscrit) — on traite ça comme un succès
  if (error && error.code !== '23505') {
    console.error('[newsletterService] Erreur Supabase:', error.message);
    throw new Error(error.message);
  }

  return { success: true, message: 'Inscription réussie.' };
}

/**
 * Retourne le nombre total d'inscrits newsletter.
 * (Usage futur — dashboard admin)
 *
 * @returns {Promise<number>}
 */
export async function countSubscribers() {
  const { count, error } = await supabase
    .from('newsletter')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.warn('[newsletterService] countSubscribers — erreur:', error.message);
    return 0;
  }

  return count ?? 0;
}
