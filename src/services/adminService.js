/**
 * Espace administrateur : authentification Supabase Auth + statistiques agrégées.
 * La sécurité est assurée par la base : public.is_admin() et public.admin_dashboard() vérifient auth.uid()
 * dans lf_private.admin_users (erreur 42501 sinon). Aucune clé de service dans le navigateur.
 */
import { supabase } from './supabase';

export const isAuthAvailable = () => Boolean(supabase);

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  if (!supabase) return { ok: false, message: 'Service indisponible.' };
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (!error) return { ok: true };
  if (/invalid login credentials/i.test(error.message)) return { ok: false, message: 'Identifiants incorrects.' };
  if (/email not confirmed/i.test(error.message)) return { ok: false, message: "Adresse e-mail non confirmée dans Supabase Auth." };
  if (error.status === 429) return { ok: false, message: 'Trop de tentatives. Réessaie dans quelques minutes.' };
  return { ok: false, message: 'Connexion impossible pour le moment.' };
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

/** @returns {Promise<boolean|null>} null si la vérification est impossible (réseau, migration absente) */
export async function checkIsAdmin() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('is_admin');
  if (error) return null;
  return data === true;
}

export class AdminError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Statistiques agrégées calculées dans Supabase. period : today | 7d | 30d | 90d | all */
export async function fetchDashboard(period) {
  if (!supabase) throw new AdminError('unavailable', 'Service indisponible.');
  const { data, error } = await supabase.rpc('admin_dashboard', { p_period: period });
  if (error) {
    if (error.code === '42501' || error.code === '401' || error.code === '403') throw new AdminError('forbidden', 'Accès refusé.');
    if (error.code === 'PGRST202') throw new AdminError('missing', 'La migration du tableau de bord n\'est pas appliquée.');
    throw new AdminError('network', 'Statistiques momentanément indisponibles.');
  }
  return data;
}
