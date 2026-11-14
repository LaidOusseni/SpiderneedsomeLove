/**
 * Exécute la VRAIE migration Supabase dans un PostgreSQL embarqué (PGlite) et vérifie
 * les règles de vote et les accès des rôles publics (anon).
 * Limite : PGlite n'a qu'une connexion → la concurrence réelle n'est pas simulable ici ;
 * elle est garantie par la contrainte UNIQUE (votes_one_per_creation), testée ci-dessous.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261029120000_community_vote.sql'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'supabase/seed_creations.sql'), 'utf8');
const legacy = fs.readFileSync(path.join(root, 'supabase-setup.sql'), 'utf8');
const newsletter = fs.readFileSync(path.join(root, 'supabase/migrations/20261031120000_newsletter.sql'), 'utf8');
const preorders = fs.readFileSync(path.join(root, 'supabase/migrations/20261105120000_preorders.sql'), 'utf8');
const candidateVote = fs.readFileSync(path.join(root, 'supabase/migrations/20261105130000_open_candidate_vote.sql'), 'utf8');

let db;

async function asAnon(sql, params) {
  await db.exec('set role anon');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

const vote = async (slug, first, last, ig, website = null) =>
  (await asAnon('select public.cast_vote($1, $2, $3, $4, $5) as r', [slug, first, last, ig, website])).rows[0].r;

const overview = async () => (await asAnon('select public.get_drop_overview() as r')).rows[0].r;
const votesOf = async (slug) => (await overview()).creations.find((c) => c.slug === slug).votes;
const setStatus = (s) => db.exec(`update public.drop_settings set vote_status = '${s}' where id = 1`);

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  // Environnement minimal équivalent à Supabase
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema extensions; grant usage on schema extensions to anon, authenticated;
    grant usage on schema public to anon, authenticated;
  `);
  await db.exec(legacy);                // tables V1 (preorders, newsletter)
  await db.exec(migration);
  await db.exec(migration);             // idempotence
  await db.exec(newsletter);
  await db.exec(newsletter);
  await db.exec(seed);
  await db.exec(seed);                  // relancer le seed ne duplique rien
  await db.exec(preorders);
  await db.exec(preorders);              // idempotence sur la table précommandes V1
  await setStatus('open');
  await vote('love-in-darkness', 'Ada', 'Lovelace', 'existingvote');
  await db.exec(`update public.drop_settings set vote_status = 'announced',
    closes_at = now() - interval '1 minute',
    winner_creation_id = (select id from public.creations where slug = 'world-love'),
    winner_announced_at = now() where id = 1`);
  await db.exec(candidateVote);
  await db.exec(candidateVote);          // idempotence, sans doublonner ni effacer les votes
}, 60000);

describe('migration', () => {
  it('supprime la lecture publique des précommandes', async () => {
    const { rows } = await db.query(`select policyname from pg_policies where tablename = 'preorders'`);
    expect(rows.map((r) => r.policyname)).not.toContain('preorders_select_public');
  });

  it('initialise les créations et un drop en vote ouvert', async () => {
    const o = await overview();
    expect(o.creations).toHaveLength(8);
    expect(o.drop.vote_status).toBe('open');
    expect(o.drop.winner_slug).toBeNull();
  });

  it('ouvre les six candidates sans date de fermeture et conserve les compteurs par création', async () => {
    const o = await overview();
    const candidates = o.creations.filter((creation) => creation.is_candidate);
    expect(candidates.map((creation) => creation.slug).sort()).toEqual([
      'fabulous-love-and-faith',
      'heart-of-ice',
      'love-in-darkness',
      'lva',
      'plva',
      'world-love',
    ]);
    expect(o.creations.find((creation) => creation.slug === 'batman-drop-01'))
      .toMatchObject({ is_candidate: false, status: 'preparing', votes: 0 });
    expect(o.creations.find((creation) => creation.slug === 'masks-and-hearts'))
      .toMatchObject({ is_candidate: false, status: 'historic', votes: 0 });
    expect(o.creations.find((creation) => creation.slug === 'love-in-darkness').votes).toBe(1);
    const { rows } = await db.query('select closes_at from public.drop_settings where id = 1');
    expect(rows[0].closes_at).toBeNull();
    const history = await db.query('select winner_slug from public.drop_announcement_history');
    expect(history.rows.map((row) => row.winner_slug)).toEqual(['world-love']);
  });
});

describe('accès anonymes', () => {
  it('ne peut pas lire les votes', async () => {
    await expect(asAnon('select * from public.votes')).rejects.toThrow(/permission denied/);
  });
  it('ne peut pas insérer directement un vote', async () => {
    const { rows } = await db.query(`select id from public.creations where slug = 'world-love'`);
    await expect(
      asAnon(`insert into public.votes (creation_id, first_name, last_name, instagram_handle, instagram_normalized)
              values ($1, 'a', 'b', 'x', 'x')`, [rows[0].id]),
    ).rejects.toThrow(/permission denied/);
  });
  it('ne peut pas modifier les créations ni le drop', async () => {
    await expect(asAnon(`update public.creations set name = 'x'`)).rejects.toThrow(/permission denied/);
    await expect(asAnon(`update public.drop_settings set vote_status = 'open'`)).rejects.toThrow(/permission denied/);
  });
  it('ne peut pas lire le sel privé', async () => {
    await expect(asAnon('select * from lf_private.settings')).rejects.toThrow(/permission denied/);
  });
  it('peut lire les créations actives (sans données personnelles)', async () => {
    const { rows } = await asAnon('select slug from public.creations');
    expect(rows.length).toBe(8);
  });

  it('peut enregistrer une précommande et consulter uniquement son nombre', async () => {
    await asAnon(`insert into public.preorders
      (creation_slug, first_name, last_name, email, product, size, quantity)
      values ('batman-drop-01', 'Ada', 'Lovelace', 'ada@example.test', 'long', 'M', 1)`);
    const { rows } = await asAnon('select public.count_preorders() as total');
    expect(Number(rows[0].total)).toBe(1);
    await expect(asAnon('select email from public.preorders')).rejects.toThrow(/permission denied/);
  });
});

describe('cast_vote', () => {
  it('refuse tant que le vote n\'est pas ouvert', async () => {
    await setStatus('preparing');
    expect((await vote('world-love', 'Ada', 'L', 'ada')).code).toBe('voting_closed');
  });

  it('enregistre un vote valide et met à jour le compteur', async () => {
    await setStatus('open');
    expect((await vote('batman-drop-01', 'Ada', 'Lovelace', 'batmantry')).code).toBe('not_eligible');
    const r = await vote('heart-of-ice', 'Ada', 'Lovelace', '@Exemple');
    expect(r).toMatchObject({ ok: true, code: 'ok', votes: 1 });
    expect(await votesOf('heart-of-ice')).toBe(1);
  });

  it('refuse un second vote pour la même création, quelle que soit la graphie', async () => {
    for (const ig of ['exemple', 'EXEMPLE', ' @exemple ', 'https://www.instagram.com/Exemple/']) {
      const r = await vote('heart-of-ice', 'Ada', 'Lovelace', ig);
      expect(r.code).toBe('already_voted');
    }
    expect(await votesOf('heart-of-ice')).toBe(1);
  });

  it('autorise le même identifiant sur une autre création', async () => {
    expect((await vote('world-love', 'Ada', 'Lovelace', 'exemple')).ok).toBe(true);
    expect(await votesOf('world-love')).toBe(1);
  });

  it('refuse les créations historiques ou inconnues', async () => {
    expect((await vote('masks-and-hearts', 'A', 'B', 'zed')).code).toBe('not_eligible');
    expect((await vote('nope', 'A', 'B', 'zed')).code).toBe('not_eligible');
  });

  it('valide les champs', async () => {
    expect((await vote('lva', '  ', 'B', 'zed')).code).toBe('invalid_input');
    expect((await vote('lva', 'A', 'B', 'pas valide!')).code).toBe('invalid_instagram');
    expect((await vote('lva', 'A', 'B', '.zed')).code).toBe('invalid_instagram');
    expect((await vote('lva', 'A', 'B', 'zed', 'http://spam'))).toMatchObject({ ok: false });
    expect(await votesOf('lva')).toBe(0);
  });

  it('limite la fréquence par client', async () => {
    await db.exec(`select set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}', false)`);
    let last;
    for (let i = 0; i < 16; i++) last = await vote('plva', 'Bot', 'Bot', `bot_${i}`);
    expect(last.code).toBe('rate_limited');
    expect(await votesOf('plva')).toBe(15);
    await db.exec(`select set_config('request.headers', '{}', false)`);
  });

  it('refuse les votes une fois clôturé, compteurs toujours lisibles', async () => {
    await setStatus('closed');
    expect((await vote('lva', 'A', 'B', 'late')).code).toBe('voting_closed');
    expect(await votesOf('world-love')).toBe(1);
  });

  it('interdit une date de fermeture automatique : seule la fermeture manuelle est autorisée', async () => {
    await db.exec(`update public.drop_settings set vote_status = 'open', closes_at = null where id = 1`);
    await expect(
      db.exec(`update public.drop_settings set closes_at = now() - interval '1 minute' where id = 1`),
    ).rejects.toThrow(/drop_settings_manual_closure_only/);
    expect((await overview()).drop.vote_status).toBe('open');
  });

  it('le gagnant officiel n\'existe que via drop_settings, après annonce', async () => {
    await expect(
      db.exec(`update public.drop_settings set winner_creation_id = (select id from public.creations where slug='world-love') where id = 1`),
    ).rejects.toThrow(/winner_requires_announce/);
    await db.exec(`update public.drop_settings set vote_status = 'announced',
      winner_creation_id = (select id from public.creations where slug='world-love'), winner_announced_at = now() where id = 1`);
    expect((await overview()).drop.winner_slug).toBe('world-love');
  });

  it('la contrainte UNIQUE bloque un doublon même en insertion directe (cas concurrent)', async () => {
    const { rows } = await db.query(`select id from public.creations where slug = 'heart-of-ice'`);
    await expect(
      db.query(`insert into public.votes (creation_id, first_name, last_name, instagram_handle, instagram_normalized)
                values ($1, 'x', 'y', 'exemple', 'exemple')`, [rows[0].id]),
    ).rejects.toThrow(/votes_one_per_creation/);
  });
});

describe('newsletter', () => {
  it('accepte une inscription anonyme valide mais ne laisse ni lire ni supprimer', async () => {
    await asAnon(`insert into public.newsletter (email) values ('ada@exemple.fr')`);
    await expect(asAnon('select email from public.newsletter')).rejects.toThrow(/permission denied/);
    await expect(asAnon('delete from public.newsletter')).rejects.toThrow(/permission denied/);
  });
  it('refuse une adresse invalide', async () => {
    await expect(asAnon(`insert into public.newsletter (email) values ('pas-une-adresse')`)).rejects.toThrow(/row-level security/);
  });
});

/** Nouveau projet Supabase VIDE (aucune table de la V1) : migrations + seed doivent passer tels quels. */
describe('projet Supabase vierge', () => {
  let fresh;
  beforeAll(async () => {
    fresh = new PGlite({ extensions: { pgcrypto } });
    await fresh.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema extensions; grant usage on schema extensions to anon, authenticated;
      grant usage on schema public to anon, authenticated;
    `);
    await fresh.exec(migration);
    await fresh.exec(newsletter);
    await fresh.exec(seed);
  }, 60000);

  it('crée créations, drop et newsletter ; le vote fonctionne une fois ouvert', async () => {
    await fresh.exec(`update public.drop_settings set vote_status = 'open' where id = 1`);
    await fresh.exec('set role anon');
    try {
      const r = (await fresh.query(`select public.cast_vote('lva', 'Ada', 'L', '@ada') as r`)).rows[0].r;
      expect(r).toMatchObject({ ok: true, votes: 1 });
      const o = (await fresh.query('select public.get_drop_overview() as r')).rows[0].r;
      expect(o.creations).toHaveLength(7);
      expect(JSON.stringify(o)).not.toMatch(/Ada|ada/);
      await fresh.query(`insert into public.newsletter (email) values ('x@y.fr')`);
    } finally {
      await fresh.exec('reset role');
    }
  });
});
