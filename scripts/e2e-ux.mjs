/**
 * Recette des corrections UX (intro une fois par visite, persistance des routes, popup de confidentialité,
 * « Vous avez déjà voté », parcours après vote, visionneuse des mockups, footer mobile) — node scripts/e2e-ux.mjs
 * Prérequis : `npm run build && npx vite preview --port 4173`.
 *
 * Les appels Supabase sont exécutés sur une vraie base PostgreSQL embarquée (PGlite) contenant TOUTES les migrations
 * du dépôt, avec le rôle `anon` : aucune donnée de production n'est lue ni écrite.
 * Tous les fichiers temporaires (profils Chrome, captures) restent sur D:.
 */
import puppeteer from 'puppeteer-core';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';
import { MUSIC_TRACKS } from '../src/constants/music.js';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const TEMP_DIR = process.env.LF_TMP ?? 'D:\\dev-cache\\tmp';
const SHOTS = path.join(TEMP_DIR, 'lf-shots', 'ux');
const PROFILES = path.join(TEMP_DIR, 'chrome-ux');
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
for (const d of [SHOTS, PROFILES]) fs.mkdirSync(d, { recursive: true });
process.env.TEMP = TEMP_DIR;
process.env.TMP = TEMP_DIR;

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? '✔' : '✘'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Base PostgreSQL avec les migrations réelles ──
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`create role anon nologin; create role authenticated nologin;
  create schema extensions; grant usage on schema extensions to anon, authenticated;
  grant usage on schema public to anon, authenticated;`);
const MIGRATIONS = [
  'supabase/migrations/20261029120000_community_vote.sql',
  'supabase/migrations/20261031120000_newsletter.sql',
  'supabase/seed_creations.sql',
  'supabase/migrations/20261105120000_preorders.sql',
  'supabase/migrations/20261105130000_open_candidate_vote.sql',
  'supabase/migrations/20261114120000_drops_votes_newsletter.sql',
  'supabase/migrations/20261114130000_preorder_registrations.sql',
  'supabase/migrations/20261115160000_preorder_identity.sql',
  'supabase/migrations/20261115170000_open_voting_without_batman_candidate.sql',
  'supabase/migrations/20261117120000_voter_status.sql',
];
for (const f of MIGRATIONS) await db.exec(fs.readFileSync(f, 'utf8'));

let ipCounter = 10;
async function asAnon(sql, params = [], ip = '198.51.100.30') {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'x-forwarded-for': ip })]);
    await tx.exec('set local role anon');
    return tx.query(sql, params);
  });
}
const RPC = {
  get_drop_overview: () => ['select public.get_drop_overview() as r', []],
  cast_vote: (b) => ['select public.cast_vote($1, $2, $3, $4, $5) as r', [b.p_creation_slug, b.p_first_name, b.p_last_name, b.p_instagram, b.p_website ?? null]],
  cast_vote_tracked: (b) => ['select public.cast_vote_tracked($1, $2, $3, $4, $5, $6::uuid) as r',
    [b.p_creation_slug, b.p_first_name, b.p_last_name, b.p_instagram, b.p_website ?? null, b.p_voter_token ?? null]],
  get_my_votes: (b) => ['select public.get_my_votes($1::uuid) as r', [b.p_voter_token ?? null]],
  count_preorder_registrations: (b) => ['select public.count_preorder_registrations($1) as r', [b.p_drop_slug]],
  newsletter_subscribe: (b) => ['select public.newsletter_subscribe($1, $2, $3) as r', [b.p_email, b.p_consent, b.p_website ?? null]],
};
const netErrors = [];
async function handle(req) {
  const url = new URL(req.url());
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const json = (status, body) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  try {
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (rpc) {
      if (!RPC[rpc]) { netErrors.push(rpc); return json(404, { code: 'PGRST202', message: `Could not find the function public.${rpc}` }); }
      const [sql, params] = RPC[rpc](JSON.parse(req.postData() || '{}'));
      const { rows } = await asAnon(sql, params, `198.51.100.${ipCounter}`);
      return json(200, rows[0].r);
    }
    // Bibliothèque « Le son de l'amour » (chargée par le lecteur sur toutes les pages)
    if (url.pathname.endsWith('/rest/v1/music_tracks')) {
      return json(200, MUSIC_TRACKS.map((t, i) => ({ id: t.id, artist: t.artist, title: t.title, file_path: t.src, mime_type: t.type,
        cover_path: t.cover, duration_seconds: t.duration, position: i + 1 })));
    }
    if (url.pathname.endsWith('/rest/v1/drop_vote_totals')) {
      const cols = (url.searchParams.get('select') ?? '*').split(',').map((c) => c.trim()).filter((c) => /^[a-z_]+$/.test(c));
      const { rows } = await asAnon(`select ${cols.join(', ') || '*'} from public.drop_vote_totals order by position`);
      return json(200, rows);
    }
    netErrors.push(url.pathname);
    return json(404, { code: 'PGRST205', message: 'not found' });
  } catch (err) {
    netErrors.push(`${url.pathname}: ${err.message}`);
    return json(400, { code: err.code ?? 'XX000', message: err.message });
  }
}
const dbVotes = async (slug) => (await db.query(
  `select count(*)::int as n from public.drop_votes v join public.creations c on c.id = v.candidate_id where c.slug = $1`, [slug])).rows[0].n;
const openSlugs = (await db.query(
  `select slug from public.creations where is_active and is_candidate and status = 'candidate' and vote_status = 'voting_open' order by slug`)).rows.map((r) => r.slug);

const DEVICES = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  iphone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  android: { width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' },
};

const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'];
const launch = (profile) => puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ARGS });

async function preparePage(browser, device) {
  const page = (await browser.pages())[0] ?? await browser.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  // Bruit propre au banc de test : icône du manifeste lue par Chrome pendant l'interception réseau,
  // requêtes annulées par les rechargements rapides du test
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|from the Manifest|Failed to fetch/.test(m.text()) && page.errors.push(m.text()));
  await page.setRequestInterception(true);
  page.on('request', (req) => (req.url().includes('.supabase.co/rest/v1/') ? handle(req) : req.continue()));
  const { ua, ...vp } = DEVICES[device];
  if (ua) await page.setUserAgent(ua);
  await page.setViewport(vp);
  page.setDefaultNavigationTimeout(90000);
  return page;
}
const isIntro = (page) => page.evaluate(() => Boolean(document.querySelector('[data-intro-enter]')));
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const bodyLocked = (page) => page.evaluate(() => document.body.style.overflow === 'hidden');

async function enterIntro(page) {
  await page.waitForSelector('[data-intro-enter]:not([disabled])', { timeout: 30000 });
  await page.click('[data-intro-enter]');
  await page.waitForFunction(() => !document.querySelector('[data-intro-enter]'), { timeout: 10000 });
  await wait(600);
}

try {
  // ═════════ 1 à 5 : introduction et persistance des routes (ordinateur + iPhone) ═════════
  for (const device of ['desktop', 'iphone']) {
    const profile = fs.mkdtempSync(path.join(PROFILES, `${device}-`));
    let browser = await launch(profile);
    let page = await preparePage(browser, device);

    await page.goto(`${BASE}/propager/heart-of-ice`, { waitUntil: 'domcontentloaded' });
    await wait(800);
    check(`[${device}] 1. Première visite : l'introduction se lance`, await isIntro(page));
    await enterIntro(page);
    check(`[${device}] 2. Fin de l'introduction : accès au site, sur la page demandée`,
      !(await isIntro(page)) && new URL(page.url()).pathname === '/propager/heart-of-ice');

    // 3. Navigation interne
    const navTo = async (pathName) => {
      await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, pathName);
      await wait(700);
    };
    let introDuringNav = false;
    for (const p of ['/chemin', '/a-propos', '/propager']) { await navTo(p); introDuringNav ||= await isIntro(page); }
    check(`[${device}] 3. Navigation entre plusieurs pages : aucune nouvelle introduction`, !introDuringNav);

    // 4. Actualisation de chaque page (dont route avec paramètres)
    const reloads = [];
    for (const p of ['/propager', '/propager/heart-of-ice', '/propager?c=world-love', '/chemin', '/a-propos']) {
      await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle0' });
      await page.reload({ waitUntil: 'networkidle0' });
      await wait(400);
      const u = new URL(page.url());
      reloads.push({ p, ok: !(await isIntro(page)) && `${u.pathname}${u.search}` === p });
    }
    check(`[${device}] 4. Actualisation de chaque page : route conservée, pas d'intro`, reloads.every((r) => r.ok), JSON.stringify(reloads.filter((r) => !r.ok)));
    await page.goBack({ waitUntil: 'networkidle0' });
    const back = new URL(page.url()).pathname;
    await page.goForward({ waitUntil: 'networkidle0' });
    const fwd = new URL(page.url()).pathname;
    check(`[${device}] 4b. Boutons précédent / suivant du navigateur`, back === '/chemin' && fwd === '/a-propos' && !(await isIntro(page)), `${back} → ${fwd}`);

    // 5. Fermeture puis réouverture du navigateur (même profil) : pas d'intro
    await browser.close();
    browser = await launch(profile);
    page = await preparePage(browser, device);
    await page.goto(`${BASE}/chemin`, { waitUntil: 'networkidle0' });
    check(`[${device}] 5. Fermeture et réouverture du navigateur : pas de retour à l'introduction`,
      !(await isIntro(page)) && new URL(page.url()).pathname === '/chemin');
    // Nouvelle visite (plus de 30 min sans activité, onglet neuf) : l'intro se rejoue
    // « 31 minutes plus tard » : posé depuis une page du même domaine sans l'application (sinon la fermeture
    // de l'onglet enregistre à juste titre la dernière activité)
    await page.goto(`${BASE}/robots.txt`);
    await page.evaluate(() => localStorage.setItem('lf-last-active', String(Date.now() - 31 * 60 * 1000)));
    await browser.close();
    browser = await launch(profile);
    page = await preparePage(browser, device);
    await page.goto(`${BASE}/chemin`, { waitUntil: 'domcontentloaded' });
    await wait(800);
    check(`[${device}] 5b. Retour après avoir quitté le site (nouvelle visite) : l'intro se rejoue, puis on reste sur /chemin`,
      await isIntro(page));
    await enterIntro(page);
    check(`[${device}] 5c. … et l'entrée garde la page demandée`, new URL(page.url()).pathname === '/chemin');
    check(`[${device}] aucune erreur JavaScript (intro / navigation)`, page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    await browser.close();
  }

  // ═════════ 6 à 11 : vote, popup de confidentialité, « déjà voté », parcours après vote ═════════
  check('Base : au moins deux créations ouvertes au vote', openSlugs.length >= 2, openSlugs.join(', '));
  const [first, second] = openSlugs;
  for (const [i, device] of ['desktop', 'iphone', 'android', 'tablet'].entries()) {
    ipCounter = 40 + i;
    const handleIg = `lf_test_${device}`;
    const browser = await launch(fs.mkdtempSync(path.join(PROFILES, `vote-${device}-`)));
    const page = await preparePage(browser, device);
    await page.evaluateOnNewDocument(() => { try { sessionStorage.setItem('lf-skip-intro', '1'); } catch { /* */ } });
    await page.goto(`${BASE}/propager/${first}`, { waitUntil: 'networkidle0' });
    await wait(800);
    const voteBtnSel = 'button[class*="voteBtn"]';
    const visibleVoteBtn = () => page.$$eval(voteBtnSel, (bs) => bs.filter((b) => b.offsetParent && /Je choisis ce T-shirt/.test(b.textContent)).length);
    check(`[${device}] bouton « Je choisis ce T-shirt » avant le vote`, (await visibleVoteBtn()) > 0);
    await page.$$eval(voteBtnSel, (bs) => bs.find((b) => b.offsetParent && /Je choisis ce T-shirt/.test(b.textContent)).click());
    await page.waitForSelector('form input[name="firstName"]');
    await page.type('input[name="firstName"]', 'Alex');
    await page.type('input[name="lastName"]', 'Martin');
    await page.type('input[name="instagram"]', handleIg);

    // 6. Popup de confidentialité
    await page.$$eval('form button', (bs) => bs.find((b) => /politique de confidentialité/.test(b.textContent)).click());
    await wait(500);
    const dialogs = () => page.$$eval('[role="dialog"]', (ds) => ds.map((d) => d.getAttribute('aria-labelledby') ? document.getElementById(d.getAttribute('aria-labelledby'))?.textContent : d.querySelector('h2')?.textContent));
    const pop = await page.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].pop();
      const body = d.querySelector('[class*="body"]');
      const r = d.getBoundingClientRect();
      const ok = [...d.querySelectorAll('button')].find((b) => /J'ai compris/.test(b.textContent));
      const close = d.querySelector('button[aria-label="Fermer"]');
      const cr = close.getBoundingClientRect();
      const okr = ok.getBoundingClientRect();
      body.scrollTop = 400;
      return {
        full: /Tes droits/.test(d.textContent) && /Le vote communautaire/.test(d.textContent),
        scrolls: body.scrollHeight > body.clientHeight && body.scrollTop > 0,
        inView: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1,
        closeOk: cr.top >= 0 && cr.right <= innerWidth && Math.round(cr.width) >= 44,
        closeBox: [Math.round(cr.top), Math.round(cr.right), cr.width, innerWidth],
        okVisible: okr.bottom <= innerHeight + 1 && okr.height >= 44,
      };
    });
    check(`[${device}] 6. Popup de confidentialité : texte complet, défilement interne, croix et « J'ai compris » visibles`,
      pop.full && pop.scrolls && pop.inView && pop.closeOk && pop.okVisible && (await bodyLocked(page)), JSON.stringify(pop));
    await shot(page, `06-${device}-confidentialite`);
    // Échap ferme seulement la popup ; clic à l'extérieur ; croix ; « J'ai compris »
    await page.keyboard.press('Escape'); await wait(300);
    const afterEsc = await dialogs();
    await page.$$eval('form button', (bs) => bs.find((b) => /politique de confidentialité/.test(b.textContent)).click()); await wait(300);
    await page.evaluate(() => { const o = [...document.querySelectorAll('[role="dialog"]')].pop().parentElement; o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await wait(300);
    const afterOutside = await dialogs();
    await page.$$eval('form button', (bs) => bs.find((b) => /politique de confidentialité/.test(b.textContent)).click()); await wait(300);
    await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].pop().querySelector('button[aria-label="Fermer"]').click());
    await wait(300);
    const afterCross = await dialogs();
    await page.$$eval('form button', (bs) => bs.find((b) => /politique de confidentialité/.test(b.textContent)).click()); await wait(300);
    await page.evaluate(() => [...[...document.querySelectorAll('[role="dialog"]')].pop().querySelectorAll('button')].find((b) => /J'ai compris/.test(b.textContent)).click());
    await wait(300);
    const afterOk = await dialogs();
    const values = await page.evaluate(() => ['firstName', 'lastName', 'instagram'].map((n) => document.querySelector(`input[name="${n}"]`)?.value));
    check(`[${device}] 7. Fermeture (Échap, clic extérieur, croix, « J'ai compris ») : formulaire toujours ouvert et rempli`,
      [afterEsc, afterOutside, afterCross, afterOk].every((d) => d.length === 1) && values.join('|') === `Alex|Martin|${handleIg}` && (await bodyLocked(page)),
      JSON.stringify({ afterEsc, afterOutside, afterCross, afterOk, values }));

    // 8. Premier vote
    const before = await dbVotes(first);
    await page.click('form button[type="submit"]');
    await page.waitForFunction(() => /Vote enregistré/.test(document.body.innerText), { timeout: 15000 });
    check(`[${device}] 8. Premier vote : enregistré dans la base (drop_votes)`, (await dbVotes(first)) === before + 1, `${before} → ${await dbVotes(first)}`);
    await shot(page, `08-${device}-vote-confirme`);

    // 11. Continuer → Le chemin de l'amour, classement à jour, sans intro
    await page.$$eval('button', (bs) => bs.find((b) => b.textContent.trim() === 'Continuer').click());
    await page.waitForFunction(() => location.pathname === '/chemin', { timeout: 8000 });
    await page.waitForSelector('tbody tr', { timeout: 15000 });
    await wait(800);
    const ranking = await page.$$eval('tbody tr', (trs) => trs.map((tr) => ({ name: tr.querySelector('strong')?.textContent, votes: Number(tr.querySelector('[class*="count"] strong')?.textContent) })));
    const expected = (await db.query(`select name from public.creations where slug = $1`, [first])).rows[0].name;
    check(`[${device}] 11. « Continuer » : directement sur Le chemin de l'amour, classement actualisé, sans intro`,
      !(await isIntro(page)) && !(await page.$('[role="dialog"]')) && ranking.some((r) => r.name === expected && r.votes === before + 1) && !(await bodyLocked(page)),
      JSON.stringify(ranking));
    await shot(page, `11-${device}-chemin`);

    // 9. Retour sur la même création (puis actualisation) : « Vous avez déjà voté ❤️ »
    await page.goto(`${BASE}/propager/${first}`, { waitUntil: 'networkidle0' });
    await page.reload({ waitUntil: 'networkidle0' });
    await wait(900);
    const voted = await page.evaluate(() => ({
      badge: [...document.querySelectorAll('[role="status"]')].some((e) => e.offsetParent && /Vous avez déjà voté ❤️/.test(e.textContent)),
      button: [...document.querySelectorAll('button')].some((b) => b.offsetParent && /Je choisis ce T-shirt/.test(b.textContent)),
      visuals: [...document.querySelectorAll('[class*="viewerPane2d"] img, figure img')].some((i) => i.offsetParent && i.naturalWidth > 0),
      story: Boolean(document.getElementById('histoire')),
    }));
    check(`[${device}] 9. Même création après actualisation : « Vous avez déjà voté ❤️ », plus de bouton, visuels et histoire accessibles`,
      voted.badge && !voted.button && voted.visuals && voted.story, JSON.stringify(voted));
    await page.goto(`${BASE}/propager/${first}?voter=1`, { waitUntil: 'networkidle0' });
    await wait(1200);
    check(`[${device}] 9b. Lien direct « voter » : le formulaire ne s'ouvre plus`, !(await page.$('form input[name="instagram"]')));
    await shot(page, `09-${device}-deja-vote`);
    // Source de vérité = Supabase : si le vote disparaît de la base, le bouton revient (pas de simple localStorage)
    if (device === 'desktop') {
      await db.query(`delete from public.drop_votes where instagram_normalized = $1`, [handleIg]);
      await page.reload({ waitUntil: 'networkidle0' }); await wait(900);
      const back2 = await visibleVoteBtn();
      await db.query(`select public.cast_vote($1, 'Alex', 'Martin', $2, null)`, [first, handleIg]);
      await page.reload({ waitUntil: 'networkidle0' }); await wait(900);
      const badge2 = await page.evaluate(() => /Vous avez déjà voté ❤️/.test(document.body.innerText));
      check('9c. L\'état « déjà voté » est relu dans Supabase à chaque chargement (pas seulement le stockage local)', back2 > 0 && badge2);
      // Scène /propager : statut affiché pour la création votée
      await page.goto(`${BASE}/propager?c=${first}`, { waitUntil: 'networkidle0' }); await wait(900);
      check('9d. Page Propager : la création votée affiche « Vous avez déjà voté ❤️ »',
        await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].some((e) => /Vous avez déjà voté/.test(e.textContent))));
    }

    // 10. Autre création : vote toujours possible
    await page.goto(`${BASE}/propager/${second}`, { waitUntil: 'networkidle0' });
    await wait(900);
    check(`[${device}] 10. Autre création : bouton de vote toujours actif`, (await visibleVoteBtn()) > 0);
    if (device === 'desktop') {
      const b2 = await dbVotes(second);
      await page.$$eval(voteBtnSel, (bs) => bs.find((b) => b.offsetParent && /Je choisis ce T-shirt/.test(b.textContent)).click());
      await page.waitForSelector('form input[name="firstName"]');
      await page.type('input[name="firstName"]', 'Alex');
      await page.type('input[name="lastName"]', 'Martin');
      await page.type('input[name="instagram"]', handleIg);
      await page.click('form button[type="submit"]');
      await page.waitForFunction(() => /Vote enregistré/.test(document.body.innerText), { timeout: 15000 });
      check('10b. Vote pour une autre création enregistré', (await dbVotes(second)) === b2 + 1);
    }
    check(`[${device}] aucune erreur JavaScript (vote)`, page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    await browser.close();
  }

  // Côté serveur : doublons et protection des votes d'autrui
  {
    const ig = 'lf_test_server';
    const v1 = (await asAnon(`select public.cast_vote_tracked($1, 'Sam', 'Durand', $2, null, null) as r`, [first, ig], '198.51.100.90')).rows[0].r;
    const v2 = (await asAnon(`select public.cast_vote_tracked($1, 'Sam', 'Durand', $2, null, null) as r`, [first, `@${ig.toUpperCase()}`], '198.51.100.91')).rows[0].r;
    const v3 = (await asAnon(`select public.cast_vote_tracked($1, 'Autre', 'Personne', $2, null, null) as r`, [first, ig], '198.51.100.92')).rows[0].r;
    const n = (await db.query(`select count(*)::int n from public.drop_votes where instagram_normalized = $1`, [ig])).rows[0].n;
    const mine = (await asAnon(`select public.get_my_votes($1::uuid) as r`, [v1.voter_token])).rows[0].r;
    const bogus = (await asAnon(`select public.get_my_votes($1::uuid) as r`, ['00000000-0000-4000-8000-000000000000'])).rows[0].r;
    let direct = 'refusé';
    try { await asAnon('select * from lf_private.voter_tokens'); direct = 'LISIBLE'; } catch { /* attendu */ }
    check('Serveur : un seul vote par création et par compte Instagram (@, majuscules)', v1.ok && v2.code === 'already_voted' && n === 1);
    check('Serveur : un autre nom ne reçoit pas de jeton (pas de consultation des votes d\'autrui)', v3.code === 'already_voted' && !v3.voter_token);
    check('Serveur : get_my_votes renvoie les votes du jeton, rien pour un jeton inconnu ; jetons illisibles par le public',
      mine.ok && mine.slugs.includes(first) && !bogus.ok && direct === 'refusé', JSON.stringify({ mine, bogus, direct }));
  }

  // ═════════ 12, 13 : visionneuse des mockups ═════════
  for (const device of ['desktop', 'tablet', 'iphone', 'android']) {
    const browser = await launch(fs.mkdtempSync(path.join(PROFILES, `zoom-${device}-`)));
    const page = await preparePage(browser, device);
    await page.evaluateOnNewDocument(() => { try { sessionStorage.setItem('lf-skip-intro', '1'); } catch { /* */ } });
    await page.goto(`${BASE}/propager/heart-of-ice`, { waitUntil: 'networkidle0' });
    await wait(900);
    const openZoom = async () => {
      await page.$$eval('button[aria-label^="Agrandir"]', (bs) => bs.find((b) => b.offsetParent).click());
      await page.waitForSelector('[class*="lightbox"] img');
      await page.waitForFunction(() => document.querySelector('[class*="lightbox"] img')?.complete);
      await wait(300);
    };
    const isOpen = () => page.evaluate(() => Boolean(document.querySelector('[class*="lightbox"][role="dialog"]')));
    await openZoom();
    const geo = await page.evaluate(() => {
      const box = document.querySelector('[class*="lightbox"][role="dialog"]');
      const img = box.querySelector('img');
      const x = box.querySelector('button[aria-label^="Fermer"]');
      const ir = img.getBoundingClientRect(); const xr = x.getBoundingClientRect();
      return {
        bg: getComputedStyle(box).backgroundColor,
        imgIn: ir.left >= 0 && ir.top >= 0 && ir.right <= innerWidth + 0.5 && ir.bottom <= innerHeight + 0.5,
        ratio: Math.abs(ir.width / ir.height - img.naturalWidth / img.naturalHeight) < 0.02,
        big: ir.height >= innerHeight * 0.55 || ir.width >= innerWidth * 0.8,
        xIn: xr.top >= 0 && xr.right <= innerWidth && xr.left >= 0,
        xSize: Math.round(Math.min(xr.width, xr.height)),
        xFree: xr.bottom <= ir.top + 1 || xr.left >= ir.right - 1,
        scroll: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    check(`[${device}] 12. Zoom : image entière et centrée, proportions respectées, fond sombre, croix visible ≥ 44 px`,
      geo.imgIn && geo.ratio && geo.big && geo.xIn && geo.xSize >= 44 && geo.xFree && !geo.scroll && /rgba\(0, 0, 0, 0\.8/.test(geo.bg) && (await bodyLocked(page)),
      JSON.stringify(geo));
    await shot(page, `12-${device}-zoom`);
    await page.click('[class*="lightbox"] button[aria-label^="Fermer"]'); await wait(300);
    const byCross = !(await isOpen()) && !(await bodyLocked(page));
    await openZoom(); await page.keyboard.press('Escape'); await wait(300);
    const byEsc = !(await isOpen());
    await openZoom();
    if (DEVICES[device].hasTouch) await page.touchscreen.tap(Math.round(DEVICES[device].width / 2), DEVICES[device].height - 6);
    else await page.mouse.click(8, Math.round(DEVICES[device].height / 2));
    await wait(300);
    const byOutside = !(await isOpen());
    await openZoom();
    await page.$eval('[class*="lightbox"] img', (img) => img.click()); await wait(300);
    const imgClickKeeps = await isOpen();
    await page.keyboard.press('Escape'); await wait(200);
    check(`[${device}] 12b/13. Fermeture par la croix, Échap et clic à l'extérieur ; un clic sur l'image ne ferme pas`,
      byCross && byEsc && byOutside && imgClickKeeps, JSON.stringify({ byCross, byEsc, byOutside, imgClickKeeps }));
    check(`[${device}] aucune erreur JavaScript (zoom)`, page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    await browser.close();
  }

  // ═════════ 14 : footer sur petits écrans (+ ordinateur) ═════════
  {
    const browser = await launch(fs.mkdtempSync(path.join(PROFILES, 'footer-')));
    const page = await preparePage(browser, 'android');
    await page.evaluateOnNewDocument(() => { try { sessionStorage.setItem('lf-skip-intro', '1'); } catch { /* */ } });
    for (const width of [320, 360, 375, 390, 430, 768, 1440]) {
      await page.setViewport({ width, height: 800, isMobile: width < 1024, hasTouch: width < 1024, deviceScaleFactor: 2 });
      await page.goto(`${BASE}/a-propos`, { waitUntil: 'networkidle0' });
      await page.$eval('footer', (f) => f.scrollIntoView());
      await wait(400);
      const label = await page.$eval('footer [class*="label"][aria-hidden]', (el) => {
        const box = el.getBoundingClientRect();
        const bw = parseFloat(getComputedStyle(el).borderLeftWidth);
        const spans = [...el.querySelectorAll('[class*="labelBottom"] > span')].map((s) => {
          const range = document.createRange(); range.selectNodeContents(s);
          return range.getBoundingClientRect();
        });
        // Boîte non tournée : on mesure dans le repère de l'étiquette (sans la rotation décorative)
        const prev = el.style.transform; el.style.transform = 'none';
        const b = el.getBoundingClientRect();
        const bottom = el.querySelector('[class*="labelBottom"]');
        const textBoxes = [...bottom.children].map((s) => { const r = document.createRange(); r.selectNodeContents(s); return r.getBoundingClientRect(); });
        const left = Math.min(...textBoxes.map((r) => r.left)) - b.left - bw;
        const right = b.right - bw - Math.max(...textBoxes.map((r) => r.right));
        const top = el.querySelector('[class*="labelTop"]').getBoundingClientRect();
        el.style.transform = prev;
        return {
          left: Math.round(left), right: Math.round(right), centered: Math.abs(left - right),
          topInside: top.right <= b.right - bw,
          inViewport: box.left >= 0 && box.right <= innerWidth + 0.5,
          twoParts: spans.length === 2,
        };
      });
      const ok = label.twoParts && label.left >= 8 && label.right >= 8 && label.topInside && label.inViewport && (width > 720 || label.centered <= 12);
      check(`14. Footer ${width}px : « N° LF-001 · Fait avec amour » centré, à distance du cadre, rien ne déborde`,
        ok && (await noHScroll(page)), JSON.stringify(label));
      if (width <= 430) await page.screenshot({ path: path.join(SHOTS, `14-footer-${width}.png`), clip: await page.$eval('footer [class*="label"][aria-hidden]', (el) => { const r = el.getBoundingClientRect(); return { x: Math.max(0, r.x - 20), y: r.y + scrollY - 20, width: Math.min(innerWidth - Math.max(0, r.x - 20), r.width + 40), height: r.height + 40 }; }), captureBeyondViewport: true });
    }
    check('Footer : aucune erreur JavaScript', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    await browser.close();
  }
} catch (err) {
  console.error(err);
  check('Exécution sans exception', false, err.message);
} finally {
  await db.close();
}

check('Aucune erreur réseau inattendue (appels Supabase inconnus)', netErrors.length === 0, netErrors.slice(0, 5).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies. Captures : ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
