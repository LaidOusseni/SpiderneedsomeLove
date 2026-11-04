import { describe, it, expect } from 'vitest';
import { normalizeInstagram, validateInstagram, cleanName } from '../../src/utils/instagram';
import { computeStandings, formatShare } from '../../src/utils/voteStats';
import { resolveCreationStatus, canVote } from '../../src/utils/creationStatus';

describe('normalizeInstagram', () => {
  it('traite @Exemple, exemple et EXEMPLE de la même façon', () => {
    expect(new Set(['@Exemple', 'exemple', 'EXEMPLE', '  @@exemple ']).size).toBe(4);
    expect(new Set(['@Exemple', 'exemple', 'EXEMPLE', '  @@exemple '].map(normalizeInstagram))).toEqual(new Set(['exemple']));
  });
  it('accepte une URL de profil', () => {
    expect(normalizeInstagram('https://www.instagram.com/All.About_Love/?hl=fr')).toBe('all.about_love');
  });
  it('valide le format', () => {
    expect(validateInstagram('allaboutloveandfaith').ok).toBe(true);
    expect(validateInstagram('').ok).toBe(false);
    expect(validateInstagram('pas valide').ok).toBe(true); // espaces retirés → « pasvalide »
    expect(validateInstagram('nom!').ok).toBe(false);
    expect(validateInstagram('a'.repeat(31)).ok).toBe(false);
    expect(validateInstagram('.abc').ok).toBe(false);
  });
  it('nettoie les noms', () => {
    expect(cleanName('  Jean   Pierre ')).toBe('Jean Pierre');
  });
});

describe('computeStandings', () => {
  it('aucun vote : tout à zéro, pas de division par zéro, pas de leader', () => {
    const { total, rows } = computeStandings([{ slug: 'a', votes: 0 }, { slug: 'b', votes: 0 }]);
    expect(total).toBe(0);
    expect(rows.every((r) => r.share === 0 && !r.isLeader && r.rank === null)).toBe(true);
  });
  it('part des votes exprimés et classement avec égalités', () => {
    const { total, rows } = computeStandings([
      { slug: 'a', votes: 2 }, { slug: 'b', votes: 5 }, { slug: 'c', votes: 5 }, { slug: 'd', votes: 0 },
    ]);
    expect(total).toBe(12);
    expect(rows.map((r) => r.slug)).toEqual(['b', 'c', 'a', 'd']);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3, 4]);
    expect(rows[0]).toMatchObject({ tied: true, isLeader: true });
    expect(rows[2].share).toBeCloseTo((2 / 12) * 100);
    expect(rows.reduce((s, r) => s + r.share, 0)).toBeCloseTo(100);
  });
  it('formate les pourcentages', () => {
    expect(formatShare(0)).toBe('0 %');
    expect(formatShare(0.4)).toBe('< 1 %');
    expect(formatShare(33.4)).toBe('33 %');
  });
});

describe('statuts', () => {
  const c = { slug: 'x', status: 'candidate' };
  const ready = (drop, remote = { isCandidate: true, status: 'candidate' }) => ({
    status: 'ready', drop, bySlug: { x: remote },
  });
  it('candidate votable quand le drop est ouvert', () => {
    const r = ready({ voteStatus: 'open', winnerSlug: null });
    expect(resolveCreationStatus(c, r)).toBe('candidate');
    expect(canVote(c, r)).toBe(true);
  });
  it('clôturé : non votable', () => {
    const r = ready({ voteStatus: 'closed', winnerSlug: null });
    expect(resolveCreationStatus(c, r)).toBe('closed');
    expect(canVote(c, r)).toBe(false);
  });
  it('gagnant uniquement si désigné explicitement', () => {
    expect(resolveCreationStatus(c, ready({ voteStatus: 'announced', winnerSlug: 'x' }))).toBe('winner');
    expect(resolveCreationStatus(c, ready({ voteStatus: 'announced', winnerSlug: 'y' }))).toBe('not_selected');
  });
  it('historique jamais votable', () => {
    const h = { slug: 'x', status: 'historic' };
    const r = ready({ voteStatus: 'open' }, { isCandidate: true, status: 'candidate' });
    expect(resolveCreationStatus(h, r)).toBe('historic');
    expect(canVote(h, r)).toBe(false);
  });
  it('backend indisponible : jamais votable', () => {
    expect(canVote(c, { status: 'unavailable' })).toBe(false);
  });
});
