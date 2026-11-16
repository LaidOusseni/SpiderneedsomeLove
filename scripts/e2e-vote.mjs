/**
 * Parcours de vote dans un vrai Chrome — node scripts/e2e-vote.mjs
 * Prérequis : `npm run build && npx vite preview --port 4173`.
 *
 * Les appels Supabase (rpc/get_drop_overview, rpc/cast_vote) sont INTERCEPTÉS et servis par un faux serveur en
 * mémoire qui reproduit les règles de la migration (un vote par création et par Instagram normalisé, statut du
 * drop). Ce test vérifie donc le comportement du SITE (formulaire, erreurs, jauges, états) ; les règles côté
 * base sont vérifiées séparément par tests/sql (PGlite). La dernière étape interroge le VRAI projet Supabase.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const SHOTS = process.env.SHOTS_DIR ?? 'D:\\dev-cache\\tmp\\lf-shots\\vote';
const CHROME_PROFILE = process.env.CHROME_PROFILE ?? 'D:\\dev-cache\\tmp\\chrome-runs';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(CHROME_PROFILE, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✘'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Faux serveur Supabase ──
const SLUGS = ['heart-of-ice', 'love-in-darkness', 'world-love', 'fabulous-love-and-faith', 'lva', 'plva'];
const server = {
  status: 'preparing',
  winner: null,
  votes: Object.fromEntries(SLUGS.map((s) => [s, 0])),
  seen: new Set(),
  castCalls: 0,
  failNext: false,
  delayMs: 0,
};
const norm = (ig) => ig.trim().toLowerCase().replace(/^@+/, '');
function overview() {
  return {
    drop: { name: 'Prochain drop', vote_status: server.status, opens_at: null, closes_at: null, winner_slug: server.winner, winner_announced_at: null },
    creations: [...SLUGS.map((s) => ({ slug: s, status: 'candidate', is_candidate: true, votes: server.votes[s] })),
      { slug: 'masks-and-hearts', status: 'historic', is_candidate: false, votes: 0 }],
  };
}
function castVote(body) {
  server.castCalls++;
  if (server.status !== 'open') return { ok: false, code: 'voting_closed' };
  if (!SLUGS.includes(body.p_creation_slug)) return { ok: false, code: 'not_eligible' };
  const key = `${body.p_creation_slug}|${norm(body.p_instagram)}`;
  if (server.seen.has(key)) return { ok: false, code: 'already_voted', votes: server.votes[body.p_creation_slug] };
  server.seen.add(key);
  server.votes[body.p_creation_slug]++;
  return { ok: true, code: 'ok', votes: server.votes[body.p_creation_slug] };
}

async function mockSupabase(page) {
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = req.url();
    if (!url.includes('.supabase.co/rest/v1/')) return req.continue();
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
    if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
    if (url.includes('/rpc/cast_vote')) {
      if (server.failNext) { server.failNext = false; server.castCalls++; return req.abort('failed'); }
      const body = JSON.parse(req.postData() || '{}');
      if (server.delayMs) await wait(server.delayMs);
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(castVote(body)) });
    }
    if (url.includes('/rpc/get_drop_overview')) {
      return req.respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(overview()) });
    }
    return req.respond({ status: 404, headers: cors, contentType: 'application/json', body: '{}' });
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: fs.mkdtempSync(path.join(CHROME_PROFILE, 'run-')),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});

const text = (page) => page.evaluate(() => document.body.innerText);
const gauges = (page) => page.$$eval('[role="progressbar"]', (els) => els.map((e) => ({ label: e.getAttribute('aria-label'), now: Number(e.getAttribute('aria-valuenow')) })));

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { sessionStorage.setItem('lf-skip-intro', '1'); localStorage.setItem('lf-view-mode', '2d'); });
  await mockSupabase(page);
  await page.setViewport({ width: 1440, height: 900 });

  // ── 1. Vote pas encore ouvert ──
  await page.goto(BASE + '/chemin', { waitUntil: 'networkidle2' });
  await wait(800);
  let t = await text(page);
  check('Préparation : bannière « Le vote se prépare »', /Le vote se prépare/.test(t));
  check('Préparation : aucune jauge ni chiffre affiché', (await gauges(page)).length === 0 && !/% des votes|votes exprimés/.test(t));
  check('Préparation : aucun gagnant annoncé', !/officiellement retenue|en tête/i.test(t));
  await page.screenshot({ path: path.join(SHOTS, '01-chemin-preparation.png'), fullPage: true });

  // ── 2. Vote ouvert, résultats réels ──
  server.status = 'open';
  Object.assign(server.votes, { 'world-love': 12, lva: 6, plva: 2 });
  await page.goto(BASE + '/chemin', { waitUntil: 'networkidle2' });
  await wait(1500);
  let g = await gauges(page);
  const wl = g.find((x) => x.label?.startsWith('World Love'));
  check('Ouvert : une jauge par candidate', g.length === 6, `${g.length} jauges`);
  check('Ouvert : pourcentage = votes / total × 100 (12/20 = 60 %)', wl?.now === 60, JSON.stringify(wl));
  t = await text(page);
  check('Ouvert : création en tête identifiée (provisoire)', /World Love\s*est en tête/.test(t) && /provisoire/.test(t));
  await page.screenshot({ path: path.join(SHOTS, '02-chemin-ouvert.png'), fullPage: true });

  // ── 3. Sélection → fiche → formulaire préselectionné ──
  await page.goto(BASE + '/propager?c=lva', { waitUntil: 'networkidle2' });
  await page.waitForSelector('a[href="/propager/lva?voter=1"]', { timeout: 15000 });
  await wait(800);
  const floating = await page.$eval('img[alt^="LVA"]', (img) => ({ ok: img.complete && img.naturalWidth > 0, anim: getComputedStyle(img.parentElement).animationName }));
  check('Vue 2D : T-shirt détouré chargé et flottant', floating.ok && floating.anim === 'float' || /float/.test(floating.anim), JSON.stringify(floating));
  await page.screenshot({ path: path.join(SHOTS, '03-selection-2d.png') });
  await page.click('a[href="/propager/lva?voter=1"]');
  await page.waitForSelector('form[aria-labelledby]', { timeout: 15000 });
  t = await text(page);
  check('« Je vote pour cette création » ouvre le formulaire de LVA', /Tu votes pour\s*LVA/i.test(t), page.url());
  check('Le formulaire explique le vote (précommande, pas de commande ni de paiement, confidentialité)',
    /précommande/.test(t) && /ne constitue pas une commande/.test(t) && /aucun paiement/.test(t) && /politique de confidentialité/.test(t));
  await page.screenshot({ path: path.join(SHOTS, '04-formulaire.png') });

  // ── 4. Validation côté client ──
  const before = server.castCalls;
  await page.click('form button[type="submit"]');
  await wait(400);
  t = await text(page);
  check('Champs vides : erreurs affichées, rien n\'est envoyé', /Indique ton prénom/.test(t) && /Indique ton nom/.test(t) && server.castCalls === before);

  // ── 5. Erreur réseau : message clair, saisie conservée, nouvel essai ──
  await page.type('input[name="firstName"]', 'Ada');
  await page.type('input[name="lastName"]', 'Lovelace');
  await page.type('input[name="instagram"]', '@Ada.Test');
  server.failNext = true;
  await page.click('form button[type="submit"]');
  await page.waitForSelector('[role="alert"]', { timeout: 20000 });
  t = await text(page);
  const kept = await page.$$eval('form input', (els) => els.filter((e) => e.name !== 'website').map((e) => e.value));
  check('Erreur réseau : message affiché, vote non compté, saisie conservée',
    /Impossible de joindre|trop de temps/.test(t) && server.votes.lva === 6 && kept.join('|') === 'Ada|Lovelace|@Ada.Test', kept.join('|'));

  // ── 6. Double clic : un seul envoi ; succès confirmé par le serveur ──
  server.delayMs = 1200;
  const calls0 = server.castCalls;
  await page.evaluate(() => { const b = document.querySelector('form button[type="submit"]'); b.click(); b.click(); b.click(); });
  await page.waitForFunction(() => /Vote enregistré/.test(document.body.innerText), { timeout: 20000 });
  server.delayMs = 0;
  check('Double clic : un seul vote envoyé', server.castCalls - calls0 === 1, `${server.castCalls - calls0} appel(s)`);
  check('Succès affiché seulement après confirmation (7 votes pour LVA)', server.votes.lva === 7);
  await page.screenshot({ path: path.join(SHOTS, '05-confirmation.png') });
  await wait(3000);
  check('Pas de redirection automatique après le vote', page.url().includes('/propager/lva') && /Vote enregistré/.test(await text(page)));

  // ── 7. Jauges recalculées depuis les données ──
  await page.goto(BASE + '/chemin', { waitUntil: 'networkidle2' });
  await wait(1500);
  g = await gauges(page);
  const lva = g.find((x) => x.label?.startsWith('LVA'));
  check('Jauge LVA recalculée : 7 / 21 = 33 %', lva?.now === 33, JSON.stringify(lva));

  // ── 8. Doublon refusé par le serveur ──
  await page.goto(BASE + '/propager/lva?voter=1', { waitUntil: 'networkidle2' });
  await page.waitForSelector('form[aria-labelledby]', { timeout: 15000 });
  await page.type('input[name="firstName"]', 'Ada');
  await page.type('input[name="lastName"]', 'Lovelace');
  await page.type('input[name="instagram"]', 'ada.test');
  await page.click('form button[type="submit"]');
  await page.waitForFunction(() => /déjà enregistré/.test(document.body.innerText), { timeout: 20000 });
  check('Même Instagram (autre graphie) : « déjà enregistré », compteur inchangé', server.votes.lva === 7);

  // ── 9. Clôture et égalité ──
  server.status = 'closed';
  Object.assign(server.votes, { 'world-love': 12, lva: 12 });
  await page.goto(BASE + '/chemin', { waitUntil: 'networkidle2' });
  await wait(1200);
  t = await text(page);
  check('Clôturé avec égalité : égalité annoncée, aucun gagnant désigné', /Égalité en tête entre/.test(t) && !/officiellement retenue/.test(t));
  await page.screenshot({ path: path.join(SHOTS, '06-chemin-cloture-egalite.png'), fullPage: true });
  server.status = 'announced';
  server.winner = 'world-love';
  await page.goto(BASE + '/chemin', { waitUntil: 'networkidle2' });
  await wait(1200);
  t = await text(page);
  check('Annoncé : gagnante officielle issue de drop_settings', /Création officiellement retenue\s*World Love/i.test(t));

  // ── 10. Politique de confidentialité accessible directement (nouvel onglet, sans intro) ──
  const p2 = await browser.newPage();
  await p2.goto(BASE + '/confidentialite', { waitUntil: 'domcontentloaded' });
  await wait(1500);
  check('Politique de confidentialité accessible directement', /Politique de confidentialité/.test(await text(p2)));
  await p2.close();

  // ── 11. Tablette et smartphone ──
  server.status = 'open'; server.winner = null;
  for (const [name, vp] of [['tablette', { width: 820, height: 1180, isMobile: true, hasTouch: true }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    await page.setViewport(vp);
    await page.goto(BASE + '/propager/world-love?voter=1', { waitUntil: 'networkidle2' });
    await page.waitForSelector('form[aria-labelledby]', { timeout: 15000 });
    await wait(600);
    const fits = await page.$$eval('form input:not([name="website"]), form button[type="submit"]', (els) => els.every((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 120 && r.left >= 0 && r.right <= window.innerWidth;
    }));
    check(`${name} : formulaire utilisable (champs et bouton dans l'écran)`, fits);
    await page.screenshot({ path: path.join(SHOTS, `07-formulaire-${name}.png`) });
    await page.goto(BASE + '/chemin', { waitUntil: 'networkidle2' });
    await wait(1200);
    const ok = await page.$$eval('[role="progressbar"]', (els) => els.length === 6 && els.every((e) => e.getBoundingClientRect().width > 80));
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check(`${name} : jauges lisibles, pas de défilement horizontal`, ok && noScroll);
    await page.screenshot({ path: path.join(SHOTS, `08-chemin-${name}.png`), fullPage: true });
  }

  // ── 12. Clavier ──
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(BASE + '/propager/world-love', { waitUntil: 'networkidle2' });
  await wait(800);
  const keyboard = await page.evaluate(() => [...document.querySelectorAll('a, button')].filter((e) => !e.disabled && e.offsetParent)
    .every((e) => e.tabIndex >= 0 && (e.innerText.trim() || e.getAttribute('aria-label') || e.title)));
  check('Liens et boutons focalisables, avec un libellé', keyboard);

  check('Aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));

  // ── 13. VRAI projet Supabase (sans interception) ──
  const real = await browser.newPage();
  await real.evaluateOnNewDocument(() => sessionStorage.setItem('lf-skip-intro', '1'));
  await real.goto(BASE + '/chemin', { waitUntil: 'networkidle2' });
  await wait(2500);
  const rt = await text(real);
  const migrated = /Votes en cours|Le vote se prépare|Votes clôturés/.test(rt);
  check(`Projet Supabase réel joint (${migrated ? 'migration appliquée' : 'migration PAS encore appliquée : état « indisponible » affiché proprement'})`,
    migrated || /ne sont pas disponibles/.test(rt));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
process.exit(failed.length ? 1 : 0);
