/**
 * src/services/voteService.js
 *
 * Toutes les interactions Supabase liées au vote communautaire.
 * Les composants React ne doivent JAMAIS importer supabase directement.
 *
 * Le navigateur n'a accès qu'à (voir supabase/migrations/) :
 *   - get_drop_overview() : statut du drop + nombre de votes par création (aucune donnée personnelle)
 *   - drop_vote_totals    : vue du classement des candidates (lecture seule, aucune donnée personnelle)
 *   - cast_vote(...)      : enregistre un vote après contrôle côté serveur (table drop_votes)
 */

import { supabase } from './supabase';
import { cleanName, validateInstagram } from '../utils/instagram';

const TIMEOUT_MS = 12000;

export class VoteServiceError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function withTimeout(builder) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return builder
    .abortSignal(controller.signal)
    .then((res) => res)
    .finally(() => clearTimeout(timer));
}

// PGRST202 / 42883 : la fonction n'existe pas encore (migration non appliquée)
const isMissingFunction = (error) =>
  error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message));
const isAbortError = (error) => error?.name === 'AbortError' || /abort/i.test(error?.message ?? '');

/**
 * @returns {Promise<{ drop: object|null, creations: Array }>}
 * @throws VoteServiceError('unavailable' | 'network')
 */
export async function fetchDropOverview() {
  if (!supabase) throw new VoteServiceError('unavailable', 'Supabase non configuré');
  let res;
  try {
    res = await withTimeout(supabase.rpc('get_drop_overview'));
  } catch (err) {
    throw new VoteServiceError('network', err?.message ?? 'network');
  }
  if (res.error) {
    if (isMissingFunction(res.error)) throw new VoteServiceError('unavailable', res.error.message);
    if (isAbortError(res.error)) throw new VoteServiceError('network', res.error.message);
    console.error('[voteService] get_drop_overview:', res.error.message);
    throw new VoteServiceError('network', res.error.message);
  }
  const data = res.data ?? {};
  const d = data.drop;
  return {
    drop: d
      ? {
          name: d.name,
          voteStatus: d.vote_status,
          closesAt: d.closes_at,
          winnerSlug: d.winner_slug ?? null,
          winnerAnnouncedAt: d.winner_announced_at ?? null,
        }
      : null,
    creations: (data.creations ?? []).map((c) => ({
      slug: c.slug,
      status: c.status,
      isCandidate: Boolean(c.is_candidate),
      // statut de candidature (migration 20261114) : candidate | voting_open | voting_closed | selected | null
      voteStatus: c.vote_status === undefined ? undefined : c.vote_status,
      votes: Number(c.votes) || 0,
    })),
  };
}

/**
 * Classement public (vue `drop_vote_totals`) : candidates uniquement, votes comptés depuis les votes individuels,
 * rang calculé en base (égalité = même rang, ordre d'affichage stable).
 * @returns {Promise<Array<{ slug, name, image, votes, rank, position, voteStatus }>>}
 * @throws VoteServiceError('unavailable' | 'network')
 */
export async function fetchVoteTotals() {
  if (!supabase) throw new VoteServiceError('unavailable', 'Supabase non configuré');
  let res;
  try {
    res = await withTimeout(
      supabase.from('drop_vote_totals').select('slug, name, image, votes, rank, position, vote_status').order('position'),
    );
  } catch (err) {
    throw new VoteServiceError('network', err?.message ?? 'network');
  }
  if (res.error) {
    // 42P01 / PGRST205 : la vue n'existe pas encore (migration non appliquée)
    if (['42P01', 'PGRST205', 'PGRST200'].includes(res.error.code)) throw new VoteServiceError('unavailable', res.error.message);
    if (isAbortError(res.error)) throw new VoteServiceError('network', res.error.message);
    console.error('[voteService] drop_vote_totals:', res.error.message);
    throw new VoteServiceError('network', res.error.message);
  }
  return (res.data ?? []).map((r) => ({
    slug: r.slug,
    name: r.name,
    image: r.image,
    votes: Number(r.votes) || 0,
    rank: Number(r.rank) || null,
    position: Number(r.position) || 0,
    voteStatus: r.vote_status,
  }));
}

const MESSAGES = {
  already_voted: 'Ton vote pour cette création a déjà été enregistré avec cet identifiant Instagram. Merci !',
  invalid_input: 'Merci de renseigner ton prénom et ton nom.',
  invalid_instagram: 'Cet identifiant Instagram ne semble pas valide.',
  not_eligible: "Cette création n'est pas ouverte au vote pour le moment.",
  voting_closed: 'Les votes sont clôturés pour ce drop. Suis nos réseaux pour découvrir la suite.',
  rate_limited: 'Trop de votes depuis cette connexion en peu de temps. Réessaie dans quelques minutes.',
  network: 'Impossible de joindre le serveur. Vérifie ta connexion puis réessaie.',
  timeout: 'Le serveur met trop de temps à répondre. Réessaie dans un instant.',
  unavailable: "Le vote n'est pas encore disponible. Reviens très bientôt !",
  server: 'Une erreur est survenue de notre côté. Réessaie dans un instant.',
};

export const voteMessage = (code) => MESSAGES[code] ?? MESSAGES.server;

/**
 * Enregistre un vote. Le slug est passé explicitement : jamais déduit d'un état global.
 * @returns {Promise<{ ok: boolean, code: string, votes?: number, message: string }>}
 */
export async function castVote({ creationSlug, firstName, lastName, instagram, website }) {
  const first = cleanName(firstName);
  const last = cleanName(lastName);
  const ig = validateInstagram(instagram);
  if (!first || !last) return { ok: false, code: 'invalid_input', message: MESSAGES.invalid_input };
  if (!ig.ok) return { ok: false, code: 'invalid_instagram', message: ig.error };
  if (!supabase) return { ok: false, code: 'unavailable', message: MESSAGES.unavailable };

  let res;
  try {
    res = await withTimeout(
      supabase.rpc('cast_vote', {
        p_creation_slug: creationSlug,
        p_first_name: first,
        p_last_name: last,
        p_instagram: instagram.trim(),
        p_website: website || null,
      }),
    );
  } catch (err) {
    const code = err?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, code, message: MESSAGES[code] };
  }

  if (res.error) {
    if (res.error.name === 'AbortError' || /abort/i.test(res.error.message)) {
      return { ok: false, code: 'timeout', message: MESSAGES.timeout };
    }
    if (isMissingFunction(res.error)) return { ok: false, code: 'unavailable', message: MESSAGES.unavailable };
    console.error('[voteService] cast_vote:', res.error.code, res.error.message);
    const code = /fetch|network/i.test(res.error.message) ? 'network' : 'server';
    return { ok: false, code, message: MESSAGES[code] };
  }

  const r = res.data ?? {};
  return { ok: Boolean(r.ok), code: r.code ?? 'server', votes: r.votes, message: r.ok ? '' : voteMessage(r.code) };
}
