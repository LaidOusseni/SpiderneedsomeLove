/**
 * Migrations de drops/votes, d’intentions de précommande et leurs évolutions exécutées sur :
 *   - une base « en production » (toutes les migrations précédentes + votes et inscriptions existants) ;
 *   - un projet Supabase vierge.
 * Vérifie : conservation des données, drops, classement, statuts de candidature, newsletter, droits anonymes.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const legacy = read('supabase-setup.sql');
const community = read('supabase/migrations/20261029120000_community_vote.sql');
const newsletterV1 = read('supabase/migrations/20261031120000_newsletter.sql');
const seed = read('supabase/seed_creations.sql');
const preorders = read('supabase/migrations/20261105120000_preorders.sql');
const openVote = read('supabase/migrations/20261105130000_open_candidate_vote.sql');
const migration = read('supabase/migrations/20261114120000_drops_votes_newsletter.sql');
const preorderRegistrations = read('supabase/migrations/20261114130000_preorder_registrations.sql');
const preorderIdentity = read('supabase/migrations/20261115160000_preorder_identity.sql');
const openVotingWithoutBatmanCandidate = read('supabase/migrations/20261115170000_open_voting_without_batman_candidate.sql');

const SUPABASE_ROLES = `
  create role anon nologin; create role authenticated nologin;
  create schema extensions; grant usage on schema extensions to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

async function makeDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_ROLES);
  return db;
}

function helpers(db) {
  const asAnon = async (sql, params) => {
    await db.exec('set role anon');
    try {
      return await db.query(sql, params);
    } finally {
      await db.exec('reset role');
    }
  };
  return {
    asAnon,
    vote: async (slug, ig, first = 'Ada', last = 'L') =>
      (await asAnon('select public.cast_vote($1, $2, $3, $4) as r', [slug, first, last, ig])).rows[0].r,
    totals: async () => (await asAnon('select * from public.drop_vote_totals order by position')).rows,
    subscribe: async (email, consent = true, website = null) =>
      (await asAnon('select public.newsletter_subscribe($1, $2, $3) as r', [email, consent, website])).rows[0].r,
  };
}

describe('base existante (production)', () => {
  let db;
  let h;
  beforeAll(async () => {
    db = await makeDb();
    h = helpers(db);
    await db.exec(legacy);
    await db.exec(community);
    await db.exec(newsletterV1);
    await db.exec(seed);
    await db.exec(preorders);
    await db.exec(openVote);
    // Données réelles déjà présentes avant la migration
    await db.exec(`set role anon;
      select public.cast_vote('world-love', 'A', 'A', 'alpha');
      select public.cast_vote('world-love', 'B', 'B', 'bravo');
      select public.cast_vote('lva', 'A', 'A', 'alpha');
      select public.cast_vote('love-in-darkness', 'A', 'A', 'batman.legacy.vote');
      insert into public.newsletter (email) values ('ancien@exemple.fr');
      reset role;`);
    await db.exec(`insert into public.preorders (first_name, last_name, email, product, size)
      values ('Ancien', 'Test', 'ancien.preorder@example.fr', 'long', 'M')`);
    await db.exec(migration);
    await db.exec(preorderRegistrations);
    await db.exec(preorderRegistrations);
    await db.exec(migration); // idempotence
    await db.exec(preorderIdentity);
    await db.exec(openVotingWithoutBatmanCandidate);
    await db.exec(preorderIdentity);
    await db.exec(openVotingWithoutBatmanCandidate);
  }, 60000);

  it('renomme votes en drop_votes sans perdre un seul vote', async () => {
    expect((await db.query('select to_regclass($1) as t', ['public.votes'])).rows[0].t).toBeNull();
    const { rows } = await db.query('select count(*)::int as n from public.drop_votes');
    expect(rows[0].n).toBe(4);
    const cols = (await db.query(`select column_name from information_schema.columns where table_name = 'drop_votes'`)).rows.map((r) => r.column_name);
    expect(cols).toContain('candidate_id');
    expect(cols).not.toContain('creation_id');
  });

  it('enregistre Batman (current, précommandes ouvertes) et Masks & Hearts (archived), hors vote', async () => {
    const { rows } = await h.asAnon('select slug, status, preorder_open, is_vote_candidate from public.drops order by slug');
    expect(rows).toEqual([
      { slug: 'batman-drop-01', status: 'current', preorder_open: true, is_vote_candidate: false },
      { slug: 'masks-and-hearts', status: 'archived', preorder_open: false, is_vote_candidate: false },
    ]);
    await expect(db.exec(`insert into public.drops (slug, name, status) values ('autre', 'Autre', 'current')`))
      .rejects.toThrow(/drops_single_current/);
  });

  it('classement : uniquement les candidates, votes réels, tri décroissant et ordre stable', async () => {
    const t = await h.totals();
    expect(t.map((r) => r.slug)).not.toContain('batman-drop-01');
    expect(t.map((r) => r.slug)).not.toContain('masks-and-hearts');
    expect(t).toHaveLength(5);
    expect(t.map((r) => r.slug)).not.toContain('love-in-darkness');
    expect((await db.query(`select count(*)::int as n from public.drop_votes v
      join public.creations c on c.id = v.candidate_id where c.slug = 'love-in-darkness'`)).rows[0].n).toBe(1);
    expect(t[0]).toMatchObject({ slug: 'world-love', votes: 2, rank: 1, position: 1, vote_status: 'voting_open' });
    expect(t[1]).toMatchObject({ slug: 'lva', votes: 1, rank: 2 });
    const zeros = t.filter((r) => r.votes === 0);
    expect(new Set(zeros.map((r) => r.rank)).size).toBe(1); // égalité = même rang
    expect(JSON.stringify(t)).not.toMatch(/alpha|bravo/);   // aucune donnée personnelle
  });

  it('retire Love in Darkness du classement sans supprimer ses anciens votes et ouvre le vote', async () => {
    const overview = (await h.asAnon('select public.get_drop_overview() as r')).rows[0].r;
    expect(overview.drop.vote_status).toBe('open');
    expect(overview.drop.winner_slug).toBeNull();
    expect(overview.creations.find((c) => c.slug === 'love-in-darkness'))
      .toMatchObject({ is_candidate: false, status: 'preparing', vote_status: null, votes: 1 });
    expect((await h.vote('love-in-darkness', 'not.eligible')).code).toBe('not_eligible');
  });

  it('un nouveau vote met le classement à jour ; les doublons restent refusés', async () => {
    expect((await h.vote('lva', 'charlie')).ok).toBe(true);
    expect((await h.vote('lva', '@Charlie')).code).toBe('already_voted');
    expect((await h.vote('lva', 'bravo')).ok).toBe(true);
    const t = await h.totals();
    expect(t[0]).toMatchObject({ slug: 'lva', votes: 3, rank: 1 });
    expect(t[1]).toMatchObject({ slug: 'world-love', votes: 2, rank: 2 });
  });

  it('refuse le vote pour Batman et Masks & Hearts, même si on tente de les rendre candidats', async () => {
    expect((await h.vote('batman-drop-01', 'zed')).code).toBe('not_eligible');
    expect((await h.vote('masks-and-hearts', 'zed')).code).toBe('not_eligible');
    await expect(db.query(`select lf_admin.set_candidate('batman-drop-01', true)`)).rejects.toThrow(/drop/);
  });

  it('les visiteurs ne peuvent ni lire les votes, ni modifier scores, statuts ou drops, ni administrer', async () => {
    await expect(h.asAnon('select * from public.drop_votes')).rejects.toThrow(/permission denied/);
    await expect(h.asAnon(`update public.drop_votes set candidate_id = candidate_id`)).rejects.toThrow(/permission denied/);
    await expect(h.asAnon(`delete from public.drop_votes`)).rejects.toThrow(/permission denied/);
    await expect(h.asAnon(`update public.creations set vote_status = 'voting_closed'`)).rejects.toThrow(/permission denied/);
    await expect(h.asAnon(`update public.drops set preorder_open = false`)).rejects.toThrow(/permission denied/);
    await expect(h.asAnon(`update public.drop_settings set vote_status = 'closed'`)).rejects.toThrow(/permission denied/);
    await expect(h.asAnon(`select lf_admin.close_voting()`)).rejects.toThrow(/permission denied/);
    await expect(h.asAnon(`insert into public.drop_vote_totals (slug) values ('x')`)).rejects.toThrow(/permission denied|cannot insert into view/);
  });

  it('fermeture manuelle : plus de vote, classement et scores conservés ; réouverture possible', async () => {
    const before = await h.totals();
    await db.query('select lf_admin.close_voting()');
    expect((await h.vote('plva', 'late')).code).toBe('voting_closed');
    const after = await h.totals();
    expect(after.map((r) => [r.slug, r.votes])).toEqual(before.map((r) => [r.slug, r.votes]));
    expect(after.every((r) => r.vote_status === 'voting_closed')).toBe(true);
    // Fermeture depuis le Table Editor (drop_settings) : même effet grâce au déclencheur
    await db.query('select lf_admin.open_voting()');
    expect((await h.totals()).every((r) => r.vote_status === 'voting_open')).toBe(true);
    await db.exec(`update public.drop_settings set vote_status = 'closed' where id = 1`);
    expect((await h.totals()).every((r) => r.vote_status === 'voting_closed')).toBe(true);
    await db.query('select lf_admin.open_voting()');
    expect((await h.vote('plva', 'reopen')).ok).toBe(true);
  });

  it('une candidate fermée individuellement ne reçoit plus de votes', async () => {
    await db.exec(`update public.creations set vote_status = 'voting_closed' where slug = 'heart-of-ice'`);
    expect((await h.vote('heart-of-ice', 'solo')).code).toBe('voting_closed');
    expect((await h.vote('world-love', 'solo')).ok).toBe(true);
    await db.exec(`update public.creations set vote_status = 'voting_open' where slug = 'heart-of-ice'`);
  });

  it('get_drop_overview reste compatible et compte depuis drop_votes', async () => {
    const o = (await h.asAnon('select public.get_drop_overview() as r')).rows[0].r;
    expect(o.drop.vote_status).toBe('open');
    expect(o.creations.find((c) => c.slug === 'lva')).toMatchObject({ votes: 3, vote_status: 'voting_open' });
    expect(o.creations.find((c) => c.slug === 'batman-drop-01')).toMatchObject({ is_candidate: false, vote_status: null });
  });

  it('reprend les adresses de l\'ancienne newsletter sans les supprimer', async () => {
    const { rows } = await db.query(`select email, status, source from public.newsletter_subscribers`);
    expect(rows).toEqual([{ email: 'ancien@exemple.fr', status: 'subscribed', source: 'legacy_newsletter' }]);
    expect((await db.query('select count(*)::int as n from public.newsletter')).rows[0].n).toBe(1);
    await expect(h.asAnon(`insert into public.newsletter (email) values ('z@z.fr')`)).rejects.toThrow(/permission denied/);
  });

  it('conserve les données de l’ancienne table preorders tout en fermant son accès public', async () => {
    const { rows } = await db.query('select email from public.preorders');
    expect(rows).toEqual([{ email: 'ancien.preorder@example.fr' }]);
    await expect(h.asAnon('select email from public.preorders')).rejects.toThrow(/permission denied/);
  });
});

describe('newsletter_subscribe / newsletter_unsubscribe', () => {
  let db;
  let h;
  beforeAll(async () => {
    db = await makeDb();
    h = helpers(db);
    await db.exec(community);
    await db.exec(newsletterV1);
    await db.exec(seed);
    await db.exec(preorders);
    await db.exec(openVote);
    await db.exec(migration);
    await db.exec(preorderRegistrations);
    await db.exec(preorderIdentity);
    await db.exec(openVotingWithoutBatmanCandidate);
  }, 60000);

  it('inscrit une adresse valide avec consentement et normalise la casse', async () => {
    expect(await h.subscribe('  Ada@Exemple.FR ')).toMatchObject({ ok: true, code: 'subscribed' });
    const { rows } = await db.query('select email, status, consent_at from public.newsletter_subscribers');
    expect(rows[0]).toMatchObject({ email: 'ada@exemple.fr', status: 'subscribed' });
    expect(rows[0].consent_at).toBeTruthy();
  });

  it('ne crée jamais de doublon', async () => {
    expect(await h.subscribe('ada@exemple.fr')).toMatchObject({ ok: true, code: 'already_subscribed' });
    expect(await h.subscribe('ADA@exemple.fr')).toMatchObject({ code: 'already_subscribed' });
    expect((await db.query('select count(*)::int as n from public.newsletter_subscribers')).rows[0].n).toBe(1);
  });

  it('refuse adresse invalide, absence de consentement et robots', async () => {
    expect((await h.subscribe('pas-une-adresse')).code).toBe('invalid_email');
    expect((await h.subscribe('a@b')).code).toBe('invalid_email');
    expect((await h.subscribe('ok@exemple.fr', false)).code).toBe('consent_required');
    expect((await h.subscribe('ok@exemple.fr', true, 'http://spam')).ok).toBe(false);
    expect((await db.query('select count(*)::int as n from public.newsletter_subscribers')).rows[0].n).toBe(1);
  });

  it('désinscription par jeton, puis réinscription', async () => {
    const { rows } = await db.query(`select unsubscribe_token from public.newsletter_subscribers where email = 'ada@exemple.fr'`);
    const token = rows[0].unsubscribe_token;
    const un = (await h.asAnon('select public.newsletter_unsubscribe($1) as r', [token])).rows[0].r;
    expect(un).toMatchObject({ ok: true, code: 'unsubscribed' });
    expect((await db.query(`select status from public.newsletter_subscribers`)).rows[0].status).toBe('unsubscribed');
    const bad = (await h.asAnon('select public.newsletter_unsubscribe($1) as r', ['00000000-0000-0000-0000-000000000000'])).rows[0].r;
    expect(bad.code).toBe('invalid_token');
    expect(await h.subscribe('ada@exemple.fr')).toMatchObject({ ok: true, code: 'resubscribed' });
  });

  it('limite la fréquence par connexion', async () => {
    await db.exec(`select set_config('request.headers', '{"x-forwarded-for":"203.0.113.7"}', false)`);
    let last;
    for (let i = 0; i < 11; i++) last = await h.subscribe(`bot${i}@exemple.fr`);
    expect(last.code).toBe('rate_limited');
    await db.exec(`select set_config('request.headers', '{}', false)`);
  });

  it('le public ne peut ni lire, ni modifier, ni supprimer les inscrits', async () => {
    await expect(h.asAnon('select email from public.newsletter_subscribers')).rejects.toThrow(/permission denied/);
    await expect(h.asAnon(`update public.newsletter_subscribers set status = 'unsubscribed'`)).rejects.toThrow(/permission denied/);
    await expect(h.asAnon('delete from public.newsletter_subscribers')).rejects.toThrow(/permission denied/);
    await expect(h.asAnon(`insert into public.newsletter_subscribers (email, consent_at) values ('x@y.fr', now())`)).rejects.toThrow(/permission denied/);
  });
});

describe('projet Supabase vierge', () => {
  it('toutes les migrations passent et le vote fonctionne', async () => {
    const db = await makeDb();
    const h = helpers(db);
    await db.exec(community);
    await db.exec(newsletterV1);
    await db.exec(seed);
    await db.exec(preorders);
    await db.exec(openVote);
    await db.exec(migration);
    await db.exec(preorderRegistrations);
    await db.exec(preorderIdentity);
    await db.exec(openVotingWithoutBatmanCandidate);
    expect((await h.vote('heart-of-ice', 'ada')).ok).toBe(true);
    const t = await h.totals();
    expect(t[0]).toMatchObject({ slug: 'heart-of-ice', votes: 1, rank: 1 });
    expect((await h.asAnon('select count(*)::int as n from public.drops')).rows[0].n).toBe(2);
  });

  describe('register_preorder', () => {
    let db;
    let h;

    beforeAll(async () => {
      db = await makeDb();
      h = helpers(db);
      await db.exec(community);
      await db.exec(newsletterV1);
      await db.exec(seed);
      await db.exec(preorders);
      await db.exec(openVote);
      await db.exec(migration);
      await db.exec(preorderRegistrations);
      await db.exec(preorderIdentity);
      await db.exec(openVotingWithoutBatmanCandidate);
    }, 60000);

    beforeEach(async () => {
      await db.exec(`delete from public.preorder_registrations;
        delete from lf_private.preorder_request_log;
        update public.drops set preorder_open = true, preorders_closed_at = null where slug = 'batman-drop-01'`);
    });

    const register = (email, sizes, firstName = 'Ada', consent = true, website = null, lastName = 'Lovelace', instagram = 'ada.love') =>
      h.asAnon(
        'select public.register_preorder_with_identity($1, $2, $3, $4, $5, $6::jsonb, $7, $8) as r',
        ['batman-drop-01', firstName, lastName, email, instagram, JSON.stringify(sizes), consent, website],
      ).then(({ rows }) => rows[0].r);

    it('crée une inscription multi-tailles puis met à jour la même personne sans doublon', async () => {
      expect(await register('Ada@Exemple.fr', [
        { size: 'S', quantity: 1 }, { size: 'M', quantity: 2 },
      ])).toMatchObject({ ok: true, code: 'registered', people: 1 });
      expect(await register('ada@exemple.fr', [
        { size: 'XL', quantity: 3 },
      ], 'Ada')).toMatchObject({ ok: true, code: 'updated', people: 1 });

      expect((await db.query('select count(*)::int as n from public.preorder_registrations')).rows[0].n).toBe(1);
      expect((await db.query(
        'select first_name, last_name, instagram_handle from public.preorder_registrations',
      )).rows[0]).toEqual({ first_name: 'Ada', last_name: 'Lovelace', instagram_handle: 'ada.love' });
      expect((await db.query(
        'select size, quantity from public.preorder_registration_items order by size',
      )).rows).toEqual([{ size: 'XL', quantity: 3 }]);
    });

    it('sépare le nombre de personnes du nombre de T-shirts et détaille les tailles', async () => {
      await register('ada@example.fr', [{ size: 'S', quantity: 2 }, { size: 'M', quantity: 1 }]);
      await register('grace@example.fr', [{ size: 'M', quantity: 2 }], 'Grace');
      const stats = (await db.query(
        `select people::int, shirts::int from public.preorder_stats_by_drop where slug = 'batman-drop-01'`,
      )).rows[0];
      expect(stats).toEqual({ people: 2, shirts: 5 });
      const sizes = (await db.query(
        `select size, people::int, shirts::int from public.preorder_size_breakdown where slug = 'batman-drop-01' order by size`,
      )).rows;
      expect(sizes).toEqual([
        { size: 'M', people: 2, shirts: 3 },
        { size: 'S', people: 1, shirts: 2 },
      ]);
    });

    it('valide consentement, tailles, robot et limite de fréquence', async () => {
      expect((await register('a@exemple.fr', [{ size: 'S', quantity: 1 }], 'Ada', false)).code).toBe('consent_required');
      expect((await register('bad@exemple.fr', [{ size: 'OTHER', quantity: 1 }])).code).toBe('invalid_input');
      expect((await register('bad-name@exemple.fr', [{ size: 'S', quantity: 1 }], 'Ada', true, null, ' ')).code).toBe('invalid_input');
      expect((await register('bad-ig@exemple.fr', [{ size: 'S', quantity: 1 }], 'Ada', true, null, 'Lovelace', 'bad..handle')).code).toBe('invalid_input');
      expect((await register('robot@exemple.fr', [{ size: 'S', quantity: 1 }], 'Robot', true, 'spam')).code).toBe('robot_detected');

      await db.exec('delete from lf_private.preorder_request_log');
      for (let i = 0; i < 5; i++) {
        expect((await register('rate@exemple.fr', [{ size: 'S', quantity: 1 }])).ok).toBe(true);
      }
      expect((await register('rate@exemple.fr', [{ size: 'S', quantity: 1 }])).code).toBe('rate_limited');
    });

    it('ferme et rouvre les précommandes et conserve la date de fermeture', async () => {
      await db.query(`select lf_admin.close_preorders('batman-drop-01')`);
      const drop = (await db.query(
        `select preorder_open, preorders_closed_at from public.drops where slug = 'batman-drop-01'`,
      )).rows[0];
      expect(drop.preorder_open).toBe(false);
      expect(drop.preorders_closed_at).toBeTruthy();
      expect((await register('late@exemple.fr', [{ size: 'S', quantity: 1 }])).code).toBe('closed');
      await db.query(`select lf_admin.open_preorders('batman-drop-01')`);
      expect((await register('late@exemple.fr', [{ size: 'S', quantity: 1 }])).ok).toBe(true);
    });

    it('fixe un prix final uniquement dans la fourchette de 25 à 35 euros', async () => {
      await db.query(`select lf_admin.set_final_price('batman-drop-01', 29.90)`);
      expect((await db.query(
        `select final_price::numeric::float8 as price from public.drops where slug = 'batman-drop-01'`,
      )).rows[0].price).toBe(29.9);
      await expect(db.query(`select lf_admin.set_final_price('batman-drop-01', 24.99)`))
        .rejects.toThrow(/compris entre 25 et 35/);
      await expect(db.query(`select lf_admin.set_final_price('batman-drop-01', 35.01)`))
        .rejects.toThrow(/compris entre 25 et 35/);
    });

    it('refuse tout accès anonyme aux données et vues détaillées, mais expose le total public', async () => {
      await register('private@example.fr', [{ size: 'M', quantity: 1 }]);
      await expect(h.asAnon('select email from public.preorder_registrations')).rejects.toThrow(/permission denied/);
      await expect(h.asAnon('select * from public.preorder_registration_items')).rejects.toThrow(/permission denied/);
      await expect(h.asAnon('select * from public.preorder_stats_by_drop')).rejects.toThrow(/permission denied/);
      await expect(h.asAnon('select * from public.preorder_size_breakdown')).rejects.toThrow(/permission denied/);
      await expect(h.asAnon(
        `insert into public.preorders (first_name, last_name, email, size) values ('A', 'B', 'a@b.fr', 'M')`,
      )).rejects.toThrow(/permission denied|violates row-level security/);
      await expect(h.asAnon('select public.count_preorders()')).rejects.toThrow(/permission denied/);
      await expect(h.asAnon(`select lf_admin.close_preorders('batman-drop-01')`)).rejects.toThrow(/permission denied/);
      expect((await h.asAnon(
        `select public.count_preorder_registrations('batman-drop-01')::int as n`,
      )).rows[0].n).toBe(1);
    });
  });
});
