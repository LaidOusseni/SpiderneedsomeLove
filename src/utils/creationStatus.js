/**
 * Statut affiché d'une création, à partir de la configuration locale et des données Supabase.
 * Le gagnant officiel vient UNIQUEMENT de drop_settings.winner (jamais du simple classement).
 */
export const STATUS_LABELS = {
  candidate: 'Candidate',
  current_drop: 'Drop actuel',
  preparing: 'En préparation',
  closed: 'Votes clôturés',
  winner: 'Gagnante officielle',
  not_selected: 'Non retenue',
  historic: 'Ancien drop',
};

/**
 * @param creation — entrée de CREATIONS
 * @param results  — état du contexte VoteResults ({ status, drop, bySlug })
 */
export function resolveCreationStatus(creation, results) {
  if (creation.isCurrentDrop || creation.status === 'current_drop') return 'current_drop';
  if (creation.status === 'historic') return 'historic';
  const remote = results?.bySlug?.[creation.slug];
  const drop = results?.drop;
  if (remote?.status === 'historic') return 'historic';
  if (drop?.winnerSlug) return drop.winnerSlug === creation.slug ? 'winner' : 'not_selected';
  if (remote && (!remote.isCandidate || remote.status === 'preparing')) return 'preparing';
  if (!remote && creation.status === 'preparing') return 'preparing';
  if (drop && drop.voteStatus !== 'open') return drop.voteStatus === 'preparing' ? 'preparing' : 'closed';
  return 'candidate';
}

/** Le vote est-il possible pour cette création ? (le serveur revérifie de toute façon) */
export function canVote(creation, results) {
  if (creation.isCurrentDrop || creation.status !== 'candidate') return false;
  if (results?.status !== 'ready') return false;
  if (results.drop?.voteStatus !== 'open') return false;
  const remote = results.bySlug?.[creation.slug];
  return Boolean(remote?.isCandidate && remote.status === 'candidate');
}
