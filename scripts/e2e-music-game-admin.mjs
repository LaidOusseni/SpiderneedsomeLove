/**
 * Recette « Jouer avec l'amour », « Le son de l'amour », tableau de bord /admin et mesure d'audience
 * — node scripts/e2e-music-game-admin.mjs  (prérequis : npm run build && npx vite preview --port 4173)
 *
 * Base : PostgreSQL embarqué (PGlite) avec TOUTES les migrations du dépôt + un schéma `auth` minimal
 * (auth.users, auth.uid()) qui reproduit Supabase Auth. Les appels Supabase du site (REST, RPC, Auth) sont
 * interceptés ; l'adresse du projet de production est en plus redirigée vers 127.0.0.1 : aucun test ne peut
 * écrire dans la vraie base. Le jeu, lui, est chargé pour de vrai depuis https://www.51games.fr.
 */
import puppeteer from 'puppeteer-core';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const TEMP_DIR = process.env.LF_TMP ?? 'D:\\dev-cache\\tmp';
const SHOTS = path.join(TEMP_DIR, 'lf-shots', 'music-game-admin');
const PROFILES = path.join(TEMP_DIR, 'chrome-mga');
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SKIP_GAME_READY = process.env.SKIP_GAME_READY === '1';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null; // ex. ONLY=admin,music
const run = (part) => !ONLY || ONLY.includes(part);
for (const d of [SHOTS, PROFILES]) fs.mkdirSync(d, { recursive: true });
process.env.TEMP = TEMP_DIR;
process.env.TMP = TEMP_DIR;

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? '✔' : '✘'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Base PostgreSQL : migrations réelles + Supabase Auth minimal ──
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`create role anon nologin; create role authenticated nologin;
  create schema extensions; grant usage on schema extensions to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, password text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
for (const f of fs.readdirSync('supabase/migrations').sort()) {
  await db.exec(fs.readFileSync(path.join('supabase/migrations', f), 'utf8'));
  if (f.startsWith('20261029120000')) await db.exec(fs.readFileSync('supabase/seed_creations.sql', 'utf8'));
}
const ADMIN = { email: 'fondateur@example.test', password: 'Mot-de-passe-admin-1' };
const VISITOR = { email: 'visiteur@example.test', password: 'Mot-de-passe-visiteur-1' };
const adminId = (await db.query(`insert into auth.users (email, password) values ($1, $2) returning id`, [ADMIN.email, ADMIN.password])).rows[0].id;
await db.query(`insert into auth.users (email, password) values ($1, $2)`, [VISITOR.email, VISITOR.password]);
await db.query(`select lf_admin.grant_admin($1)`, [ADMIN.email]);

async function asRole(role, sub, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.headers', $2, true)`,
      [sub ?? '', JSON.stringify({ 'x-forwarded-for': '198.51.100.77' })]);
    await tx.exec(`set local role ${role}`);
    return tx.query(sql, params);
  });
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (user) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
const tokenUser = (req) => {
  const auth = req.headers().authorization ?? '';
  const parts = auth.replace(/^Bearer /, '').split('.');
  if (parts.length !== 3) return null;
  try { const c = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); return c.sub ? c : null; } catch { return null; }
};

const RPC = {
  get_drop_overview: () => ['select public.get_drop_overview() as r', []],
  get_my_votes: (b) => ['select public.get_my_votes($1::uuid) as r', [b.p_voter_token ?? null]],
  count_preorder_registrations: (b) => ['select public.count_preorder_registrations($1) as r', [b.p_drop_slug]],
  track_events: (b) => ['select public.track_events($1::jsonb) as r', [JSON.stringify(b.p_events)]],
  is_admin: () => ['select public.is_admin() as r', []],
  admin_dashboard: (b) => ['select public.admin_dashboard($1) as r', [b.p_period ?? '30d']],
};
const rpcCalls = [];
const unexpected = [];
async function handle(req) {
  const url = new URL(req.url());
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PATCH, DELETE' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  const json = (status, body) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  try {
    // Supabase Auth (connexion par e-mail et mot de passe)
    if (url.pathname === '/auth/v1/token') {
      const body = JSON.parse(req.postData() || '{}');
      const u = (await db.query('select id, email from auth.users where email = $1 and password = $2', [body.email, body.password])).rows[0];
      if (!u) return json(400, { code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
      const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
      return json(200, { access_token: fakeJwt(u), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test-refresh', user });
    }
    if (url.pathname === '/auth/v1/logout') return req.respond({ status: 204, headers: cors });
    if (url.pathname === '/auth/v1/user') {
      const c = tokenUser(req);
      return c ? json(200, { id: c.sub, email: c.email, aud: 'authenticated', role: 'authenticated' }) : json(401, { msg: 'no session' });
    }
    const claims = tokenUser(req);
    const role = claims ? 'authenticated' : 'anon';
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (rpc) {
      rpcCalls.push({ rpc, role, body: req.postData() });
      if (!RPC[rpc]) { unexpected.push(rpc); return json(404, { code: 'PGRST202', message: `Could not find the function public.${rpc}` }); }
      const [sql, params] = RPC[rpc](JSON.parse(req.postData() || '{}'));
      const { rows } = await asRole(role, claims?.sub, sql, params);
      return json(200, rows[0].r);
    }
    if (url.pathname.endsWith('/rest/v1/music_tracks')) {
      const { rows } = await asRole(role, claims?.sub, 'select id, artist, title, file_path, mime_type, cover_path, duration_seconds, position from public.music_tracks order by position');
      return json(200, rows);
    }
    if (url.pathname.endsWith('/rest/v1/drop_vote_totals')) {
      const { rows } = await asRole(role, claims?.sub, 'select slug, name, image, votes, rank, position, vote_status from public.drop_vote_totals order by position');
      return json(200, rows);
    }
    unexpected.push(url.pathname);
    return json(404, { code: 'PGRST205', message: 'not found' });
  } catch (err) {
    const status = err.code === '42501' ? 403 : 400;
    return json(status, { code: err.code ?? 'XX000', message: err.message });
  }
}

const events = async (type, track) => (await db.query(
  `select count(*)::int n from lf_private.analytics_events where event_type = $1 and ($2::text is null or track_id = $2)`, [type, track ?? null])).rows[0].n;

const launch = (name, extra = []) => puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: fs.mkdtempSync(path.join(PROFILES, `${name}-`)),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required', '--host-resolver-rules=MAP tpvmpbofkwmsjqnkuirq.supabase.co 127.0.0.1', ...extra],
});
async function preparePage(browser, viewport, { analytics = true, ua } = {}) {
  const page = await browser.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|from the Manifest|Failed to fetch|sessionStorage/.test(m.text()) && page.errors.push(m.text()));
  await page.evaluateOnNewDocument((a) => {
    try { sessionStorage.setItem('lf-skip-intro', '1'); } catch { /* iframe tierce */ }
    if (a) window.__LF_ALLOW_AUTOMATED_ANALYTICS__ = true;
  }, analytics);
  await page.setRequestInterception(true);
  page.on('request', (req) => (req.url().includes('.supabase.co/') ? handle(req) : req.continue()));
  if (ua) await page.setUserAgent(ua);
  await page.setViewport(viewport);
  page.setDefaultNavigationTimeout(90000);
  return page;
}
const flush = (page) => page.evaluate(() => new Promise((r) => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); setTimeout(r, 1200); }));
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const audio = (page) => page.evaluate(() => {
  const btn = document.querySelector('button[aria-pressed][aria-label="Pause"], button[aria-pressed][aria-label="Lecture"]');
  const vinyl = document.querySelector('[class*="vinyl"]');
  return {
    title: document.querySelector('[class*="nowTitle"]')?.textContent,
    artist: document.querySelector('[class*="nowArtist"]')?.textContent,
    label: btn?.getAttribute('aria-label'),
    spin: vinyl ? getComputedStyle(vinyl).animationPlayState : null,
    armOn: Boolean(document.querySelector('[class*="armOn"]')),
    progress: Number(document.querySelector('input[aria-label="Position dans le morceau"]')?.value),
    times: [...document.querySelectorAll('[class*="time"]')].slice(0, 2).map((e) => e.textContent),
  };
});
const DEVICES = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  iphone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  android: { width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
};
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

try {
  // ═════════ NAVIGATION : 5 onglets ═════════
  if (run('nav')) {
    const browser = await launch('nav');
    for (const width of [1440, 1280, 1120, 1100, 390]) {
      const page = await preparePage(browser, { width, height: 700, isMobile: width < 800, hasTouch: width < 800 }, { analytics: false });
      await page.goto(`${BASE}/propager`, { waitUntil: 'networkidle0' });
      const burger = await page.$eval('button[aria-controls="navigation-links"]', (b) => getComputedStyle(b).display !== 'none');
      await page.bringToFront();
      if (burger) {
        await page.click('button[aria-controls="navigation-links"]');
        await page.waitForFunction(() => [...document.querySelectorAll('#navigation-links a')].every((a) => getComputedStyle(a).visibility === 'visible'), { timeout: 3000 }).catch(() => {});
      }
      await wait(300);
      const nav = await page.evaluate(() => {
        const links = [...document.querySelectorAll('#navigation-links a')].map((a) => ({ t: a.textContent, r: a.getBoundingClientRect(), fs: parseFloat(getComputedStyle(a).fontSize), vis: getComputedStyle(a).visibility }));
        return {
          labels: links.map((l) => l.t),
          overlap: links.some((l, i) => i && l.r.top === links[i - 1].r.top && l.r.left < links[i - 1].r.right - 1),
          out: links.some((l) => l.r.right > innerWidth + 1 || l.r.left < -1),
          minFont: Math.min(...links.map((l) => l.fs)),
          visible: links.every((l) => l.vis === 'visible'),
        };
      });
      check(`Navigation ${width}px : 5 onglets ${burger ? '(menu)' : 'sur une ligne'}, sans chevauchement ni texte minuscule`,
        nav.labels.join('|') === "Propager l'amour|À propos de l'amour|Suivez le chemin de l'amour|Jouer avec l'amour|Le son de l'amour"
          && !nav.overlap && !nav.out && nav.minFont >= 15 && nav.visible && (await noHScroll(page)), JSON.stringify(nav));
      await page.close();
    }
    await browser.close();
  }

  // ═════════ LE SON DE L'AMOUR ═════════
  if (run('music')) {
    const browser = await launch('music');
    const page = await preparePage(browser, DEVICES.desktop);
    const mediaRequests = [];
    page.on('request', (r) => /\/music\/[^/]+\.(mp3|m4a)/.test(r.url()) && mediaRequests.push(r.url().split('/').pop()));
    await page.goto(`${BASE}/son`, { waitUntil: 'networkidle0' });
    await wait(500);
    const lib = await page.$$eval('ol li button', (bs) => bs.map((b) => b.getAttribute('aria-label')));
    check('Musique : bibliothèque des 12 vrais morceaux (artiste — titre), lue dans Supabase',
      lib.length === 12 && lib.includes('MWL — Croire en nous') && lib.includes('Rakeem — SonBody') && lib.includes('Cooper — La haine #1')
        && rpcCalls.length >= 0, `${lib.length} morceaux`);
    check('Musique : aucun fichier audio chargé avant Play, pas de lecture automatique',
      mediaRequests.length === 0 && (await audio(page)).label === 'Lecture');
    let a0 = await audio(page);
    check('Musique : artiste et titre réels affichés et centrés', a0.artist === 'Barty' && a0.title === 'Pour oublier');

    await page.click('button[aria-label="Lecture"]');
    await page.waitForFunction(() => document.querySelector('button[aria-label="Pause"]'), { timeout: 15000 });
    await page.waitForFunction(() => Number(document.querySelector('input[aria-label="Position dans le morceau"]')?.value) >= 1, { timeout: 20000 }).catch(() => {});
    await wait(1000);
    let a1 = await audio(page);
    const t1 = await page.evaluate(() => [...document.querySelectorAll('audio')].length);
    check('Lecture : Play lance le morceau, le disque tourne, le bras se pose', a1.label === 'Pause' && a1.spin === 'running' && a1.armOn && a1.progress >= 1,
      JSON.stringify(a1));
    check('Lecture : une seule piste chargée à la fois', new Set(mediaRequests).size === 1, mediaRequests.join(','));
    await page.click('button[aria-label="Pause"]');
    await wait(800);
    const paused = await audio(page);
    await wait(1500);
    const stillPaused = await audio(page);
    check('Pause : le son s\'arrête, le disque s\'arrête et le bras revient au repos', paused.label === 'Lecture' && paused.spin === 'paused' && !paused.armOn && stillPaused.progress === paused.progress);
    await page.click('button[aria-label="Lecture"]');
    await wait(2200);
    const resumed = await audio(page);
    check('Reprise au bon endroit', resumed.progress >= paused.progress && resumed.progress <= paused.progress + 4 && resumed.spin === 'running', `${paused.progress} → ${resumed.progress}`);

    // Déplacement manuel dans la barre de progression
    await page.$eval('input[aria-label="Position dans le morceau"]', (el) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, '60'); el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await wait(1500);
    const seeked = await audio(page);
    check('Barre de progression : déplacement dans la musique, temps écoulé / durée totale affichés',
      seeked.progress >= 60 && seeked.progress <= 64 && seeked.times[1] === '1:50' && /^1:0\d$/.test(seeked.times[0]), JSON.stringify(seeked.times));

    // Suivant / précédent
    await page.click('button[aria-label="Morceau suivant"]');
    await wait(2500);
    const nxt = await audio(page);
    check('Morceau suivant', nxt.artist === 'Cooper' && nxt.title === 'La haine #1' && nxt.label === 'Pause', `${nxt.artist} — ${nxt.title}`);
    await page.click('button[aria-label="Morceau précédent"]'); // < 3 s : morceau précédent
    await wait(2500);
    const prv = await audio(page);
    check('Morceau précédent', prv.artist === 'Barty' && prv.title === 'Pour oublier', `${prv.artist} — ${prv.title}`);

    // Fin du morceau → enchaînement automatique (on se place à 2 s de la fin)
    await page.$eval('input[aria-label="Position dans le morceau"]', (el) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(Number(el.max) - 2)); el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => /La haine #1/.test(document.querySelector('[class*="nowTitle"]')?.textContent ?? ''), { timeout: 20000 });
    await wait(1500);
    check('Fin de morceau : passage automatique au suivant', (await audio(page)).label === 'Pause');

    // Sélection dans la bibliothèque + écoute significative (30 s réelles) + volume
    await page.click('ol li button[aria-label="Rakeem — SonBody"]');
    await wait(31500);
    const rk = await audio(page);
    check('Sélection d\'un morceau dans la bibliothèque', rk.artist === 'Rakeem' && rk.title === 'SonBody' && rk.progress >= 29, JSON.stringify(rk));
    await page.click('button[aria-label="Couper le son"]');
    const muted = await page.evaluate(() => document.querySelector('input[aria-label="Volume"]').value);
    await page.click('button[aria-label="Réactiver le son"]');
    check('Volume : mode silencieux et curseur de volume', muted === '0' && (await page.$eval('input[aria-label="Volume"]', (e) => Number(e.value))) > 0);

    // Navigation : la musique continue, mini-lecteur sur les autres pages
    const before = (await audio(page)).progress;
    await page.click('#navigation-links a[href="/chemin"]');
    await page.waitForFunction(() => location.pathname === '/chemin');
    await wait(2500);
    const mini = await page.evaluate(() => {
      const el = document.querySelector('[aria-label="Lecteur musical"]');
      const r = el?.getBoundingClientRect();
      return { shown: Boolean(el), text: el?.innerText, onScreen: Boolean(r) && r.top >= 0 && r.bottom <= innerHeight };
    });
    await page.click('[aria-label="Lecteur musical"] a');
    await page.waitForFunction(() => location.pathname === '/son');
    await wait(800);
    const back = await audio(page);
    check('Navigation entre les pages : la lecture continue (mini-lecteur), le lecteur n\'est pas réinitialisé',
      mini.shown && mini.onScreen && /SonBody/.test(mini.text) && back.title === 'SonBody' && back.progress > before && back.label === 'Pause', `${before} → ${back.progress}`);
    await page.click('button[aria-label="Pause"]');
    await wait(500);
    await flush(page);
    await wait(1500);

    // Comptage (base) : une lecture par démarrage effectif, aucun doublon dû au remontage de la page
    const counts = {
      startBarty: await events('music_start', 'barty-pour-oublier'),
      startCooper: await events('music_start', 'cooper-la-haine-1'),
      startRakeem: await events('music_start', 'rakeem-sonbody'),
      listenRakeem: await events('music_listen', 'rakeem-sonbody'),
      complete: await events('music_complete'),
      pauses: await events('music_pause'),
      skips: await events('music_skip'),
      seconds: Number((await db.query(`select coalesce(sum(value),0) s from lf_private.analytics_events where event_type = 'music_time'`)).rows[0].s),
    };
    check('Comptage des lectures : démarrages, écoute significative, morceau terminé, pauses, changements, temps d\'écoute',
      counts.startBarty === 2 && counts.startCooper === 2 && counts.startRakeem === 1 && counts.listenRakeem === 1
        && counts.complete === 1 && counts.pauses === 2 && counts.skips === 3 && counts.seconds >= 35 && counts.seconds <= 60,
      JSON.stringify(counts));
    check('Musique : aucune erreur JavaScript', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    await browser.close();

    // Téléphone : tourne-disque centré, commandes au pouce sans défilement, pas de débordement
    for (const dev of ['iphone', 'android', 'tablet']) {
      const br = await launch(`music-${dev}`);
      const p = await preparePage(br, DEVICES[dev], { analytics: false, ua: dev === 'iphone' ? IPHONE_UA : undefined });
      await p.goto(`${BASE}/son`, { waitUntil: 'networkidle0' });
      await wait(600);
      const geo = await p.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const tt = r('svg[class*="turntable"]');
        const play = r('button[aria-label="Lecture"]');
        const prog = document.querySelector('input[aria-label="Position dans le morceau"]').getBoundingClientRect();
        return {
          centered: Math.abs((tt.left + tt.right) / 2 - innerWidth / 2) < 2, ttWidth: Math.round(tt.width),
          playVisible: play.bottom <= innerHeight, playSize: Math.round(play.width), progressH: Math.round(prog.height),
          titleVisible: r('[class*="nowArtist"]').top >= 0,
        };
      });
      await p.click('button[aria-label="Lecture"]');
      await wait(2500);
      const st = await audio(p);
      check(`Musique ${dev} : tourne-disque centré, Play visible sans défiler, barre tactile, lecture OK`,
        geo.centered && geo.playVisible && geo.playSize >= 64 && geo.progressH >= 28 && geo.titleVisible && st.spin === 'running' && (await noHScroll(p)),
        JSON.stringify({ ...geo, spin: st.spin }));
      await p.screenshot({ path: path.join(SHOTS, `son-${dev}.png`) });
      await br.close();
    }
  }

  // ═════════ JOUER AVEC L'AMOUR ═════════
  for (const dev of run('game') ? ['desktop', 'iphone', 'android', 'tablet'] : []) {
    const browser = await launch(`game-${dev}`);
    const page = await preparePage(browser, DEVICES[dev], { ua: dev === 'iphone' ? IPHONE_UA : undefined });
    if (dev === 'iphone') {
      // Safari iPhone : pas de plein écran pour un élément (seulement pour une vidéo)
      await page.evaluateOnNewDocument(() => { delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen; });
    }
    const t0 = Date.now();
    await page.goto(`${BASE}/jouer`, { waitUntil: 'domcontentloaded' });
    const frame = await page.waitForSelector('iframe');
    const info = await frame.evaluate((f) => {
      const u = new URL(f.src);
      const r = f.parentElement.getBoundingClientRect();
      return { origin: u.origin, embed: u.searchParams.get('embed'), partner: u.searchParams.get('partner'), host: u.searchParams.get('host'),
        allow: f.allow, fs: f.allowFullscreen, frames: document.querySelectorAll('iframe').length, w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight };
    });
    check(`Jeu ${dev} : iframe unique servie par https://www.51games.fr (embed=1, partner=loveandfaith)`,
      info.origin === 'https://www.51games.fr' && info.embed === '1' && info.partner === 'loveandfaith' && info.host === 'localhost'
        && /fullscreen/.test(info.allow) && /gamepad/.test(info.allow) && info.fs && info.frames === 1, JSON.stringify(info));
    const sizeOk = dev === 'desktop' ? info.w >= 1000 && Math.abs(info.w / info.h - 16 / 9) < 0.05
      : dev === 'tablet' ? info.w >= 700
        : info.w >= 360 && info.h >= 600;
    check(`Jeu ${dev} : grande fenêtre de jeu (${info.w}×${info.h}), sans défilement horizontal`, sizeOk && (await noHScroll(page)));
    const loader = Boolean(await page.$('[class*="overlay"][role="status"]'));
    await page.waitForFunction(() => !document.querySelector('[class*="overlay"]'), { timeout: 30000 }).catch(() => {});
    check(`Jeu ${dev} : écran de chargement, puis le jeu prend le relais`, loader && !(await page.$('[class*="overlay"]')));
    const liveFrame = page.frames().find((f) => f.url().startsWith('https://www.51games.fr/'));
    check(`Jeu ${dev} : le document du jeu est bien chargé depuis 51games.fr (pas de copie locale)`, Boolean(liveFrame), liveFrame?.url());

    // Plein écran
    await page.click('button[aria-label="Jouer en plein écran"]');
    await wait(800);
    const fs1 = await page.evaluate(() => ({
      native: document.fullscreenElement?.className ?? null,
      immersive: Boolean(document.querySelector('[class*="immersive"]')),
      rect: (() => { const r = document.querySelector('[class*="stage"]').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
      pos: (() => { const r = document.querySelector('[class*="stage"]').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })(),
      hint: document.querySelector('[class*="rotateHint"]')?.textContent ?? null,
      vw: innerWidth, vh: innerHeight,
    }));
    const fsOk = dev === 'iphone'
      ? fs1.immersive && !fs1.native && fs1.pos[0] === 0 && fs1.pos[1] === 0 && fs1.rect[0] === fs1.vw && Math.abs(fs1.rect[1] - fs1.vh) <= 1 && /tourne ton téléphone/.test(fs1.hint ?? '')
      : Boolean(fs1.native) || fs1.immersive;
    check(`Jeu ${dev} : plein écran ${dev === 'iphone' ? 'immersif (repli iPhone) + conseil d\'orientation' : 'natif'}`, fsOk, JSON.stringify(fs1));
    await shot(page, `jouer-${dev}-plein-ecran`);
    await page.click('button[aria-label="Quitter le plein écran"]').catch(() => page.keyboard.press('Escape'));
    await wait(800);
    check(`Jeu ${dev} : sortie du plein écran`, await page.evaluate(() => !document.fullscreenElement && !document.querySelector('[class*="immersive"]')));

    // Lien externe
    const ext = await page.$eval('a[href="https://www.51games.fr"]', (a) => ({ target: a.target, rel: a.rel, text: a.textContent.trim() }));
    const pageTarget = page.target();
    const newTarget = browser.waitForTarget((t) => t !== pageTarget && t.url().startsWith('https://www.51games.fr'), { timeout: 15000 })
      .then((t) => t.url(), () => null);
    await page.$eval('a[class*="direct"]', (a) => a.scrollIntoView({ block: 'center' }));
    await page.click('a[class*="direct"]');
    const opened = await newTarget;
    check(`Jeu ${dev} : « Jouer directement sur 51Games.fr » ouvre le site officiel dans un nouvel onglet`,
      ext.target === '_blank' && /noopener/.test(ext.rel) && /^https:\/\/www\.51games\.fr/.test(opened ?? ''), opened);
    const hc = await page.$eval('a[href="https://5hc.fr"]', (a) => ({ t: a.textContent.trim(), target: a.target }));
    const code = await page.$eval('[class*="code"]', (e) => ({ t: e.textContent, anim: getComputedStyle(e).animationName }));
    const textOk = await page.evaluate(() => /Explication du jeu/.test(document.body.innerText) && /LOVE&FAITH EVENT/.test(document.body.innerText)
      && /Ce n'est que le début/.test(document.body.innerText) && /Session Live/.test(document.body.innerText));
    check(`Jeu ${dev} : présentation, événement Love&Faith, code 5HC mis en évidence, lien « Découvrir 5HC »`,
      textOk && hc.t === 'Découvrir 5HC' && hc.target === '_blank' && code.t === '5HC' && code.anim !== 'none');

    // Messages : un faux « run_end » venant d'une autre origine est ignoré
    await page.evaluate(() => window.postMessage({ source: '51wheeling', event: 'run_end', score: 999999, mode: 'triche' }, '*'));
    await wait(500);

    // Événement « ready » réel envoyé par 51 Wheeling (le jeu met du temps à charger sans carte graphique)
    if (dev === 'desktop' && !SKIP_GAME_READY) {
      const got = await page.waitForFunction(() => window.__lfReady, { timeout: 1000 }).then(() => true, () => false);
      void got;
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline && (await events('game_ready')) === 0) { await flush(page); await wait(5000); }
      check('Jeu : événement « ready » reçu de 51 Wheeling et enregistré', (await events('game_ready')) === 1, `après ${Math.round((Date.now() - t0) / 1000)} s`);
      await shot(page, 'jouer-desktop');
    }
    await flush(page);
    await wait(800);
    check(`Jeu ${dev} : aucune erreur JavaScript`, page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    await browser.close();
  }
  if (run('game')) {
  const gameCounts = {
    open: await events('game_open'), fullscreen: await events('game_fullscreen'), external: await events('game_external'), runEnd: await events('game_run_end'),
    devices: (await db.query(`select device, count(*)::int n from lf_private.analytics_events where event_type = 'game_open' group by device order by device`)).rows,
  };
  check('Jeu : sessions ouvertes, plein écran et clics 51Games.fr comptés par appareil ; faux run_end ignoré',
    gameCounts.open === 4 && gameCounts.fullscreen === 4 && gameCounts.external === 4 && gameCounts.runEnd === 0
      && gameCounts.devices.map((d) => `${d.device}:${d.n}`).join(',') === 'desktop:1,mobile:2,tablet:1', JSON.stringify(gameCounts));
  }

  // ═════════ MESURE D'AUDIENCE : pages, refus, espace privé ═════════
  if (run('analytics')) {
    const browser = await launch('analytics');
    const page = await preparePage(browser, DEVICES.desktop);
    const pv0 = await events('page_view');
    await page.goto(`${BASE}/a-propos`, { waitUntil: 'networkidle0' });
    await page.click('#navigation-links a[href="/chemin"]');
    await page.waitForFunction(() => location.pathname === '/chemin');
    await wait(2200);
    await page.goto(`${BASE}/propager/heart-of-ice`, { waitUntil: 'networkidle0' });
    await wait(1500);
    await flush(page);
    await wait(1000);
    const pages = (await db.query(`select page_key, count(*)::int n from lf_private.analytics_events where event_type = 'page_view' and id > 0 group by page_key`)).rows;
    const times = (await db.query(`select page_key, value from lf_private.analytics_events where event_type = 'page_time' and page_key in ('a-propos', 'chemin')`)).rows;
    if (process.env.DEBUG_TRACK) console.log('TRACK', JSON.stringify(rpcCalls.filter((c) => c.rpc === 'track_events').map((c) => JSON.parse(c.body).p_events.map((e) => `${e.type}:${e.page}`))));
    check('Audience : une vue par page (navigation interne incluse), temps passé mesuré',
      (await events('page_view')) - pv0 === 3 && pages.some((p) => p.page_key === 'creation:heart-of-ice') && times.length >= 1, JSON.stringify({ pages, times }));
    const raw = (await db.query(`select * from lf_private.analytics_events limit 1`)).rows[0];
    check('Audience : aucune donnée personnelle stockée (ni IP, ni nom, ni e-mail)',
      Object.keys(raw).sort().join(',') === 'device,event_type,id,mode,occurred_at,page_key,session_id,track_id,value,visitor_id');
    // Refus depuis la politique de confidentialité
    await page.goto(`${BASE}/confidentialite`, { waitUntil: 'networkidle0' });
    await page.$$eval('button', (bs) => bs.find((b) => /Refuser la mesure d’audience/.test(b.textContent)).click());
    const n1 = await events('page_view');
    await page.goto(`${BASE}/son`, { waitUntil: 'networkidle0' });
    await flush(page); await wait(1200);
    check('Audience : le refus (politique de confidentialité) arrête toute mesure et efface l\'identifiant',
      (await events('page_view')) === n1 && (await page.evaluate(() => localStorage.getItem('lf-analytics-visitor'))) === null);
    await browser.close();
  }

  // ═════════ TABLEAU DE BORD /admin ═════════
  if (run('admin')) {
    const browser = await launch('admin');
    const page = await preparePage(browser, DEVICES.desktop);
    const pvBefore = await events('page_view');
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle0' });
    const robots = await page.$eval('meta[name="robots"]', (m) => m.content);
    const navHasAdmin = await page.$$eval('#navigation-links a', (as) => as.some((a) => a.getAttribute('href') === '/admin'));
    check('Admin : page de connexion, absente de la navigation, non indexée, sans intro',
      Boolean(await page.$('input[type="password"]')) && !navHasAdmin && /noindex/.test(robots) && !(await page.$('[data-intro-enter]')));
    // Sans connexion : les statistiques sont refusées par la base
    let anonErr = null;
    try { await asRole('anon', null, `select public.admin_dashboard('30d')`); } catch (e) { anonErr = e.code; }
    let directErr = null;
    try { await asRole('anon', null, 'select count(*) from lf_private.analytics_events'); } catch (e) { directErr = e.code; }
    const anonHttp = await page.evaluate(async () => {
      const r = await fetch('https://tpvmpbofkwmsjqnkuirq.supabase.co/rest/v1/rpc/admin_dashboard', { method: 'POST', headers: { apikey: 'x', 'Content-Type': 'application/json' }, body: '{"p_period":"30d"}' });
      return r.status;
    });
    check('Admin : statistiques refusées sans compte (fonction et table privées : 42501 / HTTP 403)', anonErr === '42501' && directErr === '42501' && anonHttp === 403, `${anonErr} ${directErr} ${anonHttp}`);

    // Mauvais mot de passe
    await page.type('input[type="email"]', ADMIN.email);
    await page.type('input[type="password"]', 'mauvais');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => /Identifiants incorrects/.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
    check('Admin : mauvais mot de passe refusé', await page.evaluate(() => /Identifiants incorrects/.test(document.body.innerText)));

    // Compte connecté mais non administrateur → 403
    for (const sel of ['input[type="email"]', 'input[type="password"]']) {
      await page.click(sel, { clickCount: 3 });
      await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
    }
    await page.type('input[type="email"]', VISITOR.email);
    await page.type('input[type="password"]', VISITOR.password);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => /Accès refusé/.test(document.body.innerText), { timeout: 10000 }).catch(() => {});
    let userErr = null;
    const visitorId = (await db.query('select id from auth.users where email = $1', [VISITOR.email])).rows[0].id;
    try { await asRole('authenticated', visitorId, `select public.admin_dashboard('30d')`); } catch (e) { userErr = e.code; }
    check('Admin : utilisateur connecté non autorisé → « Accès refusé » (403), base qui refuse aussi',
      await page.evaluate(() => /Erreur 403/i.test(document.body.innerText) && /Accès refusé/.test(document.body.innerText)) && userErr === '42501');
    await page.screenshot({ path: path.join(SHOTS, 'admin-403.png') });
    await page.$$eval('button', (bs) => bs.find((b) => /Se déconnecter/.test(b.textContent)).click());
    await page.waitForSelector('input[type="password"]');

    // Administrateur
    await page.type('input[type="email"]', ADMIN.email);
    await page.type('input[type="password"]', ADMIN.password);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => /Tableau de bord/.test(document.body.innerText) && document.querySelector('[class*="kpiValue"]'), { timeout: 15000 });
    await wait(800);
    const kpi = async () => page.$$eval('[class*="kpi"]', (ks) => Object.fromEntries(ks.filter((k) => k.querySelector('[class*="kpiLabel"]'))
      .map((k) => [k.querySelector('[class*="kpiLabel"]').textContent, k.querySelector('[class*="kpiValue"]').textContent.replace(/\s/g, '')])));
    const k30 = await kpi();
    const expect = (await asRole('authenticated', adminId, `select public.admin_dashboard('30d') r`)).rows[0].r;
    check('Admin : connexion du compte autorisé, statistiques principales affichées',
      ['Visiteurs (cumul journalier)', 'Visiteurs uniques', 'Pages vues', 'Sessions', 'Joueurs 51 Wheeling', 'Lectures musicales', 'Votes', 'Inscriptions newsletter', 'Précommandes'].every((l) => l in k30),
      Object.keys(k30).length + ' indicateurs');
    check('Admin : chiffres identiques aux données enregistrées (aucune donnée fictive)',
      Number(k30['Pages vues']) === Number(expect.totals.page_views) && Number(k30['Lectures musicales']) === Number(expect.totals.music_plays)
        && Number(k30.Lectures) === Number(expect.music.starts) && Number(expect.music.starts) === (await events('music_start'))
        && Number(k30['Sessions de jeu ouvertes']) === Number(expect.game.sessions),
      JSON.stringify({ pv: k30['Pages vues'], music: k30['Lectures musicales'], game: k30['Sessions de jeu ouvertes'] }));
    const ui = await page.evaluate(() => ({
      charts: document.querySelectorAll('figure svg').length,
      top: [...document.querySelectorAll('[class*="barName"]')].map((e) => e.textContent).filter((t) => / — /.test(t)).slice(0, 3),
      pages: [...document.querySelectorAll('table tbody tr td:first-child')].map((e) => e.textContent),
      emails: /@example\.test/.test(document.querySelector('[class*="content"]')?.innerText ?? ''),
    }));
    check('Admin : graphiques, classement des morceaux et pages les plus visitées, aucune adresse e-mail dans les statistiques',
      ui.charts >= 6 && ui.top.length > 0 && ui.pages.some((p) => /Création — Heart of Ice/.test(p)) && !ui.emails, JSON.stringify(ui));
    // Survol d'un graphique : info-bulle
    const svg = await page.$('figure svg');
    await svg.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await wait(300);
    const box = await svg.boundingBox();
    await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
    await wait(200);
    check('Admin : info-bulle au survol des courbes', Boolean(await page.$('[class*="tooltip"]')));
    // Filtres temporels
    const periods = [];
    for (const label of ["Aujourd'hui", '7 jours', '90 jours', 'Depuis le lancement']) {
      const n = rpcCalls.length;
      await page.$$eval('[aria-label="Période d\'analyse"] button', (bs, l) => bs.find((b) => b.textContent === l).click(), label);
      await page.waitForFunction((l) => document.querySelector('[aria-label="Période d\'analyse"] [aria-pressed="true"]')?.textContent === l && !document.querySelector('[class*="stale"]'), { timeout: 10000 }, label)
        .catch(async (e) => {
          console.log('DIAG', label, JSON.stringify(await page.evaluate(() => ({
            pressed: [...document.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent),
            stale: [...document.querySelectorAll('[class*="stale"]')].map((x) => x.className),
            alert: document.querySelector('[role="alert"]')?.textContent, body: document.body.innerText.slice(0, 200),
          }))), JSON.stringify(rpcCalls.slice(-2)), page.errors.join(' | ').slice(0, 600));
          throw e;
        });
      const call = rpcCalls.slice(n).find((c) => c.rpc === 'admin_dashboard');
      periods.push(JSON.parse(call?.body ?? '{}').p_period);
    }
    check('Admin : filtres Aujourd\'hui / 7 j / 90 j / depuis le lancement (calcul côté base)', periods.join(',') === 'today,7d,90d,all', periods.join(','));
    check('Admin : la visite de /admin n\'est pas comptée dans l\'audience', (await events('page_view')) === pvBefore);
    await page.screenshot({ path: path.join(SHOTS, 'admin-desktop.png'), fullPage: true });
    await page.setViewport(DEVICES.iphone);
    await wait(800);
    check('Admin : affichage téléphone sans défilement horizontal', await noHScroll(page));
    await page.screenshot({ path: path.join(SHOTS, 'admin-iphone.png'), fullPage: true });
    check('Admin : aucune erreur JavaScript', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    await browser.close();
  }
} catch (err) {
  console.error(err);
  check('Exécution sans exception', false, err.message);
} finally {
  await db.close();
}

async function shot(page, name) { await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); }

check('Aucun appel Supabase inattendu', unexpected.length === 0, unexpected.slice(0, 5).join(' | '));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies. Captures : ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
