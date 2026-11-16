/**
 * src/services/newsletterService.js
 *
 * Newsletter « Lettres d'amour » — table Supabase `newsletter_subscribers`
 * (supabase/migrations/20261114120000_drops_votes_newsletter.sql).
 *
 * Le navigateur n'a AUCUN accès direct à la table : il appelle deux fonctions contrôlées côté serveur.
 *   - newsletter_subscribe(email, consentement, champ piège) → subscribed | already_subscribed | resubscribed
 *                                                              | invalid_email | consent_required | rate_limited
 *   - newsletter_unsubscribe(jeton)                          → unsubscribed | invalid_token
 */

import { supabase } from './supabase';

const TIMEOUT_MS = 12000;
// Même règle que la contrainte SQL (validation finale côté serveur)
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const isValidEmail = (value) => {
  const email = String(value ?? '').trim().toLowerCase();
  return email.length >= 3 && email.length <= 254 && EMAIL_RE.test(email);
};

const MESSAGES = {
  subscribed: "C'est fait : tu recevras nos prochaines lettres d'amour. Bienvenue dans l'aventure.",
  resubscribed: 'Content de te revoir : ton inscription est réactivée.',
  already_subscribed: 'Cette adresse est déjà inscrite : tu fais déjà partie des premiers.',
  invalid_email: "Cette adresse e-mail ne semble pas valide. Vérifie-la puis réessaie.",
  consent_required: "Coche la case de consentement pour recevoir nos lettres d'amour.",
  rate_limited: 'Trop de tentatives depuis cette connexion. Réessaie dans quelques minutes.',
  unavailable: "L'inscription n'est pas disponible pour le moment. Réessaie un peu plus tard.",
  network: 'Impossible de joindre le serveur. Vérifie ta connexion puis réessaie.',
  server: 'Une erreur est survenue de notre côté. Réessaie dans un instant.',
  unsubscribed: "Ta désinscription est confirmée. Tu ne recevras plus nos lettres d'amour.",
  invalid_token: "Ce lien de désinscription n'est pas valide ou a déjà été utilisé.",
};

export const newsletterMessage = (code) => MESSAGES[code] ?? MESSAGES.server;

const isMissingFunction = (error) =>
  error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message));

async function callRpc(name, args) {
  if (!supabase) return { ok: false, code: 'unavailable' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await supabase.rpc(name, args).abortSignal(controller.signal);
    if (res.error) {
      if (isMissingFunction(res.error)) return { ok: false, code: 'unavailable' };
      console.error(`[newsletterService] ${name}:`, res.error.code, res.error.message);
      return { ok: false, code: /fetch|network|abort/i.test(res.error.message) ? 'network' : 'server' };
    }
    return { ok: Boolean(res.data?.ok), code: res.data?.code ?? 'server' };
  } catch {
    return { ok: false, code: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Inscrit une adresse (consentement explicite obligatoire).
 * @returns {Promise<{ ok: boolean, code: string, message: string }>}
 */
export async function subscribe({ email, consent, website = '' }) {
  if (!isValidEmail(email)) return { ok: false, code: 'invalid_email', message: MESSAGES.invalid_email };
  if (consent !== true) return { ok: false, code: 'consent_required', message: MESSAGES.consent_required };
  const r = await callRpc('newsletter_subscribe', {
    p_email: email.trim().toLowerCase(),
    p_consent: true,
    p_website: website || null,
  });
  return { ...r, message: newsletterMessage(r.code) };
}

/** Désinscription à partir du jeton présent dans chaque lettre. */
export async function unsubscribe(token) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(token ?? ''))) {
    return { ok: false, code: 'invalid_token', message: MESSAGES.invalid_token };
  }
  const r = await callRpc('newsletter_unsubscribe', { p_token: token });
  return { ...r, message: newsletterMessage(r.code) };
}
