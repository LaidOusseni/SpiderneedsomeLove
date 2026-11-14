import { describe, it, expect } from 'vitest';
import { normalizeInstagram, validateInstagram, cleanName } from '../../src/utils/instagram';
import { computeStandings, formatShare } from '../../src/utils/voteStats';
import { resolveCreationStatus, canVote } from '../../src/utils/creationStatus';
import { CANDIDATES, CURRENT_DROP } from '../../src/constants/creations';

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

describe('drop actuel', () => {
  it('Batman est séparé des six candidates et des anciens drops', () => {
    expect(CURRENT_DROP?.slug).toBe('batman-drop-01');
    expect(CANDIDATES.map((c) => c.slug)).toEqual([
      'heart-of-ice',
      'love-in-darkness',
      'world-love',
      'fabulous-love-and-faith',
      'lva',
      'plva',
    ]);
    expect(CANDIDATES.some((c) => c.status === 'historic')).toBe(false);
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
  it('drop actuel jamais votable même si le serveur le renvoie par erreur comme candidate', () => {
    const currentDrop = { slug: 'batman-drop-01', status: 'current_drop', isCurrentDrop: true };
    const r = ready({ voteStatus: 'open' }, { isCandidate: true, status: 'candidate' });
    expect(resolveCreationStatus(currentDrop, r)).toBe('current_drop');
    expect(canVote(currentDrop, r)).toBe(false);
  });
  it('toutes les candidates locales sont votables lorsque le backend les confirme', () => {
    const results = {
      status: 'ready',
      drop: { voteStatus: 'open' },
      bySlug: Object.fromEntries(CANDIDATES.map((c) => [c.slug, { isCandidate: true, status: 'candidate' }])),
    };
    expect(CANDIDATES.every((candidate) => canVote(candidate, results))).toBe(true);
  });
  it('backend indisponible : jamais votable', () => {
    expect(canVote(c, { status: 'unavailable' })).toBe(false);
  });
});
