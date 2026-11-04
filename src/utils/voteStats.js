/**
 * Statistiques de vote — calculées à partir des compteurs renvoyés par Supabase.
 *
 * share = votes de la création / total des votes exprimés sur les candidates × 100
 * → c'est la PART DES VOTES EXPRIMÉS, pas une probabilité de gagner, et pas un nombre de personnes :
 *   une même personne peut voter pour plusieurs créations, chaque vote compte séparément.
 */

/**
 * @param {Array<{slug: string, votes: number}>} items — candidates uniquement
 * @returns {{ total: number, rows: Array<{slug, votes, share, rank, tied, isLeader}> }}
 */
export function computeStandings(items) {
  const clean = items.map((it) => ({ slug: it.slug, votes: Math.max(0, Number(it.votes) || 0) }));
  const total = clean.reduce((sum, it) => sum + it.votes, 0);
  const max = clean.reduce((m, it) => Math.max(m, it.votes), 0);

  // Classement « compétition » : égalité → même rang (1, 1, 3…). Ordre stable en cas d'égalité.
  const sorted = clean
    .map((it, order) => ({ ...it, order }))
    .sort((a, b) => b.votes - a.votes || a.order - b.order);

  const rows = sorted.map((it, i) => {
    const firstSame = sorted.findIndex((o) => o.votes === it.votes);
    const sameCount = sorted.filter((o) => o.votes === it.votes).length;
    return {
      slug: it.slug,
      votes: it.votes,
      share: total > 0 ? (it.votes / total) * 100 : 0,
      rank: total > 0 ? firstSame + 1 : null,
      tied: total > 0 && it.votes > 0 && sameCount > 1,
      isLeader: max > 0 && it.votes === max,
    };
  });
  return { total, rows };
}

export function formatShare(share) {
  if (!share) return '0 %';
  if (share < 1) return '< 1 %';
  return `${Math.round(share)} %`;
}

export function formatVotes(n) {
  return `${n} vote${n > 1 ? 's' : ''}`;
}
