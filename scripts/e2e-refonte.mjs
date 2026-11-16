/**
 * Recette de la refonte (footer, vue 2D, créations, classement, newsletter, mentions légales et précommandes)
 * dans un vrai Chrome — node scripts/e2e-refonte.mjs
 * Prérequis : `npm run build && npx vite preview --port 4173`.
 *
 * Les appels Supabase du site sont INTERCEPTÉS et exécutés sur une vraie base PostgreSQL embarquée (PGlite) qui
 * contient TOUTES les migrations du dépôt, avec le rôle `anon` du site : les règles testées (votes, doublons,
 * classement, fermeture, newsletter et précommandes) sont donc celles du SQL réel, pas une imitation.
 */
import puppeteer from 'puppeteer-core';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const SHOTS = process.env.SHOTS_DIR ?? 'D:\\dev-cache\\tmp\\lf-shots\\refonte';
const CHROME_PROFILE = process.env.CHROME_PROFILE ?? 'D:\\dev-cache\\tmp\\chrome-runs';
const TEMP_DIR = process.env.LF_TMP ?? 'D:\\dev-cache\\tmp';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(CHROME_PROFILE, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });
process.env.TEMP = TEMP_DIR;
process.env.TMP = TEMP_DIR;

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? '✔' : '✘'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name, full = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });

// ── Base PostgreSQL avec les migrations réelles ──
const read = (p) => fs.readFileSync(p, 'utf8');
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`create role anon nologin; create role authenticated nologin;
  create schema extensions; grant usage on schema extensions to anon, authenticated;
  grant usage on schema public to anon, authenticated;`);
for (const f of [
  'supabase/migrations/20261029120000_community_vote.sql',
  'supabase/migrations/20261031120000_newsletter.sql',
  'supabase/seed_creations.sql',
  'supabase/migrations/20261105120000_preorders.sql',
  'supabase/migrations/20261105130000_open_candidate_vote.sql',
  'supabase/migrations/20261114120000_drops_votes_newsletter.sql',
  'supabase/migrations/20261114130000_preorder_registrations.sql',
  'supabase/migrations/20261115160000_preorder_identity.sql',
  'supabase/migrations/20261115170000_open_voting_without_batman_candidate.sql',
]) await db.exec(read(f));

let requests = 0;
let paymentCalls = 0;
async function asAnon(sql, params = [], ip = '198.51.100.20') {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'x-forwarded-for': ip })]);
    await tx.exec('set local role anon');
    return tx.query(sql, params);
  });
}
const RPC = {
  get_drop_overview: () => ['select public.get_drop_overview() as r', []],
  cast_vote: (b) => ['select public.cast_vote($1, $2, $3, $4, $5) as r', [b.p_creation_slug, b.p_first_name, b.p_last_name, b.p_instagram, b.p_website ?? null]],
  newsletter_subscribe: (b) => ['select public.newsletter_subscribe($1, $2, $3) as r', [b.p_email, b.p_consent, b.p_website ?? null]],
  newsletter_unsubscribe: (b) => ['select public.newsletter_unsubscribe($1) as r', [b.p_token]],
  count_preorders: () => ['select public.count_preorders() as r', []],
  count_preorder_registrations: (b) => ['select public.count_preorder_registrations($1) as r', [b.p_drop_slug]],
  register_preorder_with_identity: (b) => [
    'select public.register_preorder_with_identity($1, $2, $3, $4, $5, $6::jsonb, $7, $8) as r',
    [b.p_drop_slug, b.p_first_name, b.p_last_name, b.p_email, b.p_instagram, JSON.stringify(b.p_sizes), b.p_consent, b.p_website ?? null],
  ],
};

async function handle(req) {
  const url = new URL(req.url());
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
  if (req.method() === 'OPTIONS') return req.respond({ status: 204, headers: cors });
  requests++;
  const json = (status, body) => req.respond({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  try {
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (rpc) {
      if (!RPC[rpc]) return json(404, { code: 'PGRST202', message: `Could not find the function public.${rpc}` });
      const [sql, params] = RPC[rpc](JSON.parse(req.postData() || '{}'));
      const { rows } = await asAnon(sql, params);
      return json(200, rows[0].r);
    }
    if (url.pathname.endsWith('/rest/v1/drop_vote_totals')) {
      const cols = (url.searchParams.get('select') ?? '*').split(',').map((c) => c.trim()).filter((c) => /^[a-z_]+$/.test(c));
      const { rows } = await asAnon(`select ${cols.join(', ') || '*'} from public.drop_vote_totals order by position`);
      return json(200, rows);
    }
    return json(404, { code: 'PGRST205', message: 'not found' });
  } catch (err) {
    return json(400, { code: err.code ?? 'XX000', message: err.message });
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: fs.mkdtempSync(path.join(CHROME_PROFILE, 'run-')),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});

async function newPage(viewport) {
  const page = await browser.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && page.errors.push(m.text()));
  await page.evaluateOnNewDocument(() => { try { sessionStorage.setItem('lf-entered', '1'); } catch { /* about:blank */ } });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (/stripe|checkout|payment/i.test(req.url())) paymentCalls++;
    return req.url().includes('.supabase.co/rest/v1/') ? handle(req) : req.continue();
  });
  await page.setViewport(viewport);
  await page.bringToFront();
  page.setDefaultNavigationTimeout(90000); // rendu logiciel (swiftshader) : pages 3D lentes
  return page;
}
const text = (page) => page.evaluate(() => document.body.innerText);
const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const tableRows = (page) => page.$$eval('tbody tr', (trs) => trs.map((tr) => ({
  name: tr.querySelector('strong')?.textContent,
  rank: tr.querySelector('td')?.innerText.trim().split('\n')[0],
  votes: Number(tr.querySelector('[class*="count"] strong')?.textContent ?? NaN),
  first: tr.className.includes('rowFirst'),
})));
const dbCount = async (slug) => (await db.query(
  `select count(*)::int as n from public.drop_votes v join public.creations c on c.id = v.candidate_id where c.slug = $1`, [slug])).rows[0].n;

try {
  // ═════════ ORDINATEUR ═════════
  const page = await newPage({ width: 1440, height: 900 });

  await page.goto(`${BASE}/propager`, { waitUntil: 'networkidle0' });
  const currentDropName = await page.$eval('aside [class*="currentDropCard"] h2', (el) => el.textContent.trim());
  const selectionTiles = await page.$$eval('aside[aria-label="Créations"] button[aria-label]', (buttons) =>
    buttons.map((button) => button.getAttribute('aria-label') ?? ''),
  );
  check('Sélection : Batman apparaît une seule fois comme drop actuel, pas comme candidate',
    currentDropName === 'Batman' && !selectionTiles.some((label) => /Batman|Love in Darkness/.test(label)),
    `${currentDropName} · ${selectionTiles.length} créations sélectionnables`);

  // ── Vue 2D par défaut (sélection) ──
  let glbRequests = 0;
  page.on('request', (r) => r.url().includes('lovefaith-figure.glb') && glbRequests++);
  await page.goto(`${BASE}/propager?c=lva`, { waitUntil: 'networkidle0' });
  const lvaFaces = await page.$$eval('figure[class*="slide"] img', (imgs) => imgs.length);
  check('Sélection LVA : vue 2D affichée par défaut (mockups entiers devant + dos)', lvaFaces === 2, `${lvaFaces} faces`);
  check('Sélection : aucun canvas 3D au chargement', !(await page.$('canvas[data-engine], [data-pose] canvas')));
  const pressed = await page.$eval('[aria-label="Mode d\'affichage"] [aria-pressed="true"]', (b) => b.textContent.trim());
  check('Sélection : le bouton actif est « Vue 2D »', /2D/.test(pressed), pressed);
  await shot(page, '01-propager-2d-lva');

  const expectedMockups = [
    { slug: 'batman-drop-01', faces: [{ src: '/creations/love-in-darkness/gallery-front.webp', ratio: 0.5625 }, { src: '/creations/love-in-darkness/gallery-back.webp', ratio: 0.5625 }] },
    { slug: 'heart-of-ice', faces: [{ src: '/creations/heart-of-ice/comic-front.webp', ratio: 0.5625 }, { src: '/creations/heart-of-ice/comic-back.webp', ratio: 0.5625 }] },
    { slug: 'world-love', faces: [{ src: '/creations/world-love/gallery-front.webp', ratio: 0.5625 }, { src: '/creations/world-love/gallery-back.webp', ratio: 0.5625 }] },
    { slug: 'fabulous-love-and-faith', faces: [{ src: '/creations/fabulous-love-and-faith/gallery-front.webp', ratio: 0.5625 }, { src: '/creations/fabulous-love-and-faith/gallery-back.webp', ratio: 0.5625 }] },
    { slug: 'lva', faces: [{ src: '/creations/lva/gallery-front.webp', ratio: 0.5625 }, { src: '/creations/lva/gallery-back.webp', ratio: 0.5625 }] },
    { slug: 'plva', faces: [{ src: '/creations/plva/gallery-front.webp', ratio: 0.5625 }, { src: '/creations/plva/gallery-back.webp', ratio: 0.5625 }] },
    { slug: 'masks-and-hearts', faces: [{ src: '/creations/masks-and-hearts/front.webp', ratio: 0.5625 }, { src: '/creations/masks-and-hearts/back.webp', ratio: 0.5625 }] },
  ];
  for (const mockup of expectedMockups) {
    await page.goto(`${BASE}/propager/${mockup.slug}`, { waitUntil: 'networkidle0' });
    const images = await page.$$eval('figure[class*="slide"] img', (imgs) => imgs.map((img) => ({
      src: img.getAttribute('src'),
      fit: getComputedStyle(img).objectFit,
      loaded: img.complete && img.naturalWidth > 0,
      aspectRatio: img.naturalWidth / img.naturalHeight,
    })));
    check(`${mockup.slug} : mockups entiers devant et dos chargés`,
      images.length === mockup.faces.length
        && images.every((image, index) => image.src === mockup.faces[index].src && image.fit === 'contain'
          && image.loaded && Math.abs(image.aspectRatio - mockup.faces[index].ratio) < 0.01),
      JSON.stringify(images));
  }

  // ── Fiche création : devant + dos côte à côte ──
  await page.goto(`${BASE}/propager/lva`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => {
    const faces = [...document.querySelectorAll('figure[class*="slide"] span[class*="face"]')];
    return faces.length === 2 && faces.every((face) => face.getAnimations().every((animation) => animation.playState === 'finished'));
  });
  const boxes = await page.$$eval('figure[class*="slide"] span[class*="face"]', (els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }));
  check('Fiche : devant et dos côte à côte', boxes.length === 2 && boxes[1].x > boxes[0].x + boxes[0].w - 2 && Math.abs(boxes[0].y - boxes[1].y) < 3, JSON.stringify(boxes));
  const imgs = await page.$$eval('figure[class*="slide"] img', (els) => els.map((i) => i.getAttribute('src')));
  check('Fiche : mockups LVA entiers (devant / dos)', imgs[0] === '/creations/lva/gallery-front.webp' && imgs[1] === '/creations/lva/gallery-back.webp', imgs.join(' '));
  let body = await text(page);
  check('LVA : nouvelle histoire (amour + foi)', body.includes('entre les mains de Dieu') && body.includes('déclarer son appartenance'));
  check('Fiche candidate : bouton de vote présent', body.includes('Je choisis ce T-shirt'));
  await shot(page, '02-fiche-lva-2d', true);

  if (process.env.SKIP_3D !== '1') {
  // ── 3D à la demande ──
  await page.hover('[aria-label="Mode d\'affichage"] button:nth-child(2)');
  await wait(400);
  check('Survol du bouton 3D : préchargement du modèle lancé', glbRequests > 0, `${glbRequests} requête(s) GLB`);
  const t0 = Date.now();
  await page.click('[aria-label="Mode d\'affichage"] button:nth-child(2)');
  const ready3d = await page.waitForFunction(() => {
    const b = document.querySelector('[role="radio"]');
    return b && !b.disabled;
  }, { timeout: 120000 }).then(() => true, () => false);
  check('Vue 3D : figurine affichée et poses disponibles', ready3d, `${((Date.now() - t0) / 1000).toFixed(1)} s (rendu logiciel)`);
  await page.$eval('[data-pose]', (el) => el.scrollIntoView({ block: 'center' }));
  await wait(3000);
  await shot(page, '03-fiche-lva-3d');
  await page.click('[role="radio"][title="Bras croisés"]');
  const posed = await page.waitForFunction(() => document.querySelector('[data-pose]')?.dataset.poseApplied === 'bras-croises', { timeout: 60000 }).then(() => true, () => false);
  check('Vue 3D : changement de pose', posed);
  await wait(1500);
  await shot(page, '04-fiche-lva-3d-bras-croises');
  // Navigation interne vers la création suivante (comme un visiteur) : 2D par défaut, modèle 3D jamais retéléchargé
  const before = glbRequests;
  await page.click('nav[aria-label="Autres créations"] a:last-child'); // LVA → PLVA
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'PLVA', { timeout: 15000 });
  await wait(800);
  check('Création suivante : retour à la vue 2D par défaut', (await page.$$('figure[class*="slide"] img')).length === 2);
  body = await text(page);
  check('PLVA : histoire (Hamza, « Juste une minute », amour intense)', body.includes('« Juste une minute »') && body.includes('parfois toxique'));
  await page.click('[aria-label="Mode d\'affichage"] button:nth-child(2)');
  const t1 = Date.now();
  await page.waitForFunction(() => document.querySelector('[role="radio"]') && !document.querySelector('[role="radio"]').disabled, { timeout: 120000 }).catch(() => {});
  check('Modèle 3D en cache : aucun nouveau téléchargement, affichage immédiat', glbRequests === before, `${glbRequests - before} requête(s), prêt en ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  await page.$eval('[data-pose]', (el) => el.scrollIntoView({ block: 'center' }));
  await wait(2500);
  await shot(page, '04b-fiche-plva-3d');
  }

  await page.goto(`${BASE}/propager/fabulous-love-and-faith`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('figure[class*="slide"] img');
  await wait(1000);
  body = await text(page);
  check('Fabulous : histoire du casino (Joke, « Casino », phrase-clé)', body.includes('« Casino »') && body.includes('nous on veut braquer le casino') && body.includes('Notre stratégie, c\'est le travail'));
  await shot(page, '05-fiche-fabulous-2d', true);

  // ── Drops hors vote ──
  const preorderPage = await newPage({ width: 1440, height: 900 });
  await preorderPage.goto(`${BASE}/propager/batman-drop-01`, { waitUntil: 'networkidle0' });
  body = await text(preorderPage);
  check('Batman : bouton de manifestation d’intérêt, aucun vote', body.includes('Précommander') && !body.includes('Je choisis ce T-shirt'));
  await preorderPage.waitForSelector('[class*="preorderPanel"] button');
  await preorderPage.$eval('[class*="preorderPanel"] button', (button) => button.click());
  const infoOpened = await preorderPage.waitForSelector('[role="dialog"] #preorder-info-title', { timeout: 10000 })
    .then(() => true, () => false);
  check('Précommander ouvre la modale d’information', infoOpened, preorderPage.errors.slice(0, 3).join(' | '));
  if (!infoOpened) {
    console.error('Précommande : aucun dialogue après le clic.', await text(preorderPage));
    throw new Error('La modale d’information de précommande ne s’est pas ouverte.');
  }
  check('Précommande : la modale d’information présente la fourchette non définitive',
    (await text(preorderPage)).includes('PLUS ON EST NOMBREUX, MOINS ON PAIE.')
      && (await text(preorderPage)).includes('25 € — 35 €')
      && (await text(preorderPage)).includes('Fourchette de prix envisagée, non définitive.'));
  await preorderPage.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')]
    .find((button) => button.textContent.includes('Je souhaite participer'))?.click());
  await preorderPage.waitForSelector('[role="dialog"] input[name="firstName"]');
  await preorderPage.type('[role="dialog"] input[name="firstName"]', 'Ada');
  await preorderPage.type('[role="dialog"] input[name="lastName"]', 'Lovelace');
  await preorderPage.type('[role="dialog"] input[name="instagram"]', '@ada.love');
  await preorderPage.type('[role="dialog"] input[name="email"]', 'ada.preorder@example.fr');
  await preorderPage.select('[role="dialog"] select[aria-label="Quantité taille S"]', '2');
  await preorderPage.select('[role="dialog"] select[aria-label="Quantité taille M"]', '1');
  await preorderPage.click('[role="dialog"] input[name="consent"]');
  await preorderPage.waitForFunction(() => document.querySelector('[role="dialog"] input[name="consent"]')?.checked === true);
  await preorderPage.click('[role="dialog"] button[type="submit"]');
  await preorderPage.waitForFunction(() => /pas d’une commande définitive/i.test(document.querySelector('[role="dialog"]')?.innerText ?? ''), { timeout: 15000 }).catch(() => {});
  check('Précommande : première personne enregistrée avec deux tailles',
    (await db.query('select count(*)::int as n from public.preorder_registrations')).rows[0].n === 1
      && (await db.query('select count(*)::int as n from public.preorder_registration_items')).rows[0].n === 2
      && JSON.stringify((await db.query(
        'select first_name, last_name, instagram_handle from public.preorder_registrations',
      )).rows[0]) === JSON.stringify({ first_name: 'Ada', last_name: 'Lovelace', instagram_handle: 'ada.love' }));
  await preorderPage.click('[role="dialog"] button[aria-label="Fermer"]');
  await preorderPage.click('[class*="preorderPanel"] button');
  await preorderPage.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')]
    .find((button) => button.textContent.includes('Je souhaite participer'))?.click());
  await preorderPage.waitForSelector('[role="dialog"] input[name="firstName"]');
  await preorderPage.type('[role="dialog"] input[name="firstName"]', 'Ada');
  await preorderPage.type('[role="dialog"] input[name="lastName"]', 'Lovelace');
  await preorderPage.type('[role="dialog"] input[name="instagram"]', '@ada.love');
  await preorderPage.type('[role="dialog"] input[name="email"]', 'ADA.PREORDER@example.fr');
  await preorderPage.select('[role="dialog"] select[aria-label="Quantité taille L"]', '2');
  await preorderPage.select('[role="dialog"] select[aria-label="Quantité taille XXL"]', '1');
  await preorderPage.click('[role="dialog"] input[name="consent"]');
  await preorderPage.waitForFunction(() => document.querySelector('[role="dialog"] input[name="consent"]')?.checked === true);
  await preorderPage.click('[role="dialog"] button[type="submit"]');
  await preorderPage.waitForFunction(() => /pas d’une commande définitive/i.test(document.querySelector('[role="dialog"]')?.innerText ?? ''), { timeout: 15000 }).catch(() => {});
  const preorderPeople = (await db.query(
    `select people::int, shirts::int from public.preorder_stats_by_drop where slug = 'batman-drop-01'`,
  )).rows[0];
  const preorderItems = (await db.query(
    `select size, quantity from public.preorder_registration_items order by size`,
  )).rows;
  check('Précommande : même e-mail mis à jour sans doublon, totaux personnes / T-shirts corrects',
    (await db.query('select count(*)::int as n from public.preorder_registrations')).rows[0].n === 1
      && preorderPeople.people === 1 && preorderPeople.shirts === 3
      && JSON.stringify(preorderItems) === JSON.stringify([{ size: 'L', quantity: 2 }, { size: 'XXL', quantity: 1 }]),
    JSON.stringify({ preorderPeople, preorderItems }));
  check('Précommande : aucun appel de paiement', paymentCalls === 0, `${paymentCalls} appel(s)`);
  await shot(preorderPage, '06-fiche-batman', true);
  await preorderPage.close();
  await page.goto(`${BASE}/propager/masks-and-hearts`, { waitUntil: 'networkidle0' });
  body = await text(page);
  check('Masks & Hearts : ancien drop, aucun vote', !body.includes('Je choisis ce T-shirt') && /historique|ANCIEN DROP/i.test(body));
  const origCovers = await page.$$eval('figure img', (els) => els.map((i) => i.getAttribute('src')));
  check('Masks & Hearts : couvertures d\'origine conservées', origCovers.includes('/creations/masks-and-hearts/front.webp') && origCovers.includes('/creations/masks-and-hearts/back.webp'));

  // ── Classement réel ──
  await page.goto(`${BASE}/chemin`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => /^\d+$/.test(document.querySelector('#preorder-interest-count')?.textContent?.trim() ?? ''), { timeout: 10000 });
  const preorderCountDisplayed = Number(await page.$eval('#preorder-interest-count', (el) => el.textContent.trim()));
  const preorderCountStored = (await db.query(
    `select count(*)::int as n from public.preorder_registrations r join public.drops d on d.id = r.drop_id where d.slug = 'batman-drop-01' and r.status = 'interested'`,
  )).rows[0].n;
  const preorderStatement = await page.$eval('[aria-labelledby="preorder-interest-title"]', (el) => el.innerText);
  check('Love in Darkness : compteur identique aux inscriptions Supabase',
    preorderCountDisplayed === preorderCountStored && /personnes? (?:veut|veulent) propager l’amour/.test(preorderStatement),
    `${preorderCountDisplayed} personne(s)`);
  await page.waitForSelector('tbody tr');
  let rows = await tableRows(page);
  check('Classement : 5 candidates, Batman et Masks & Hearts exclus', rows.length === 5 && !rows.some((r) => /Batman|Masks|Love in Darkness/.test(r.name)), rows.map((r) => r.name).join(', '));
  check('Classement : 0 vote partout au départ (chiffres réels)', rows.every((r) => r.votes === 0));
  const heads = await page.$$eval('thead th', (ths) => ths.map((t) => t.textContent.trim()));
  check('Colonnes : Classement | Création | Logo | Nombre de votes', heads.join('|') === 'Classement|Création|Logo|Nombre de votes', heads.join('|'));
  check('Plus de message « résultats non disponibles »', !(await text(page)).includes('ne sont pas disponibles'));

  // Vote réel depuis le site
  await page.goto(`${BASE}/propager/plva?voter=1`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[role="dialog"] input', { timeout: 10000 });
  const fields = await page.$$('[role="dialog"] input:not([tabindex="-1"])');
  await fields[0].type('Ada');
  await fields[1].type('Lovelace');
  await fields[2].type('@ada.love');
  await page.click('[role="dialog"] button[type="submit"]');
  await page.waitForFunction(() => /Merci de faire partie|déjà été enregistré/.test(document.querySelector('[role="dialog"]')?.innerText ?? ''), { timeout: 15000 }).catch(() => {});
  check('Vote PLVA enregistré en base', (await dbCount('plva')) === 1, `${await dbCount('plva')} vote(s) en base`);
  await shot(page, '07-vote-confirmation');
  // Doublon
  await page.goto(`${BASE}/propager/plva?voter=1`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[role="dialog"] input');
  const f2 = await page.$$('[role="dialog"] input:not([tabindex="-1"])');
  await f2[0].type('Ada'); await f2[1].type('L'); await f2[2].type('https://instagram.com/ADA.LOVE/');
  await page.click('[role="dialog"] button[type="submit"]');
  const dupMsg = await page.waitForFunction(() => /déjà été enregistré/.test(document.querySelector('[role="dialog"]')?.innerText ?? ''), { timeout: 15000 }).then(() => true, () => false);
  check('Doublon refusé (même Instagram, autre graphie)', dupMsg && (await dbCount('plva')) === 1);

  await page.goto(`${BASE}/chemin`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('tbody tr');
  rows = await tableRows(page);
  check('Classement : PLVA 1re avec 1 vote, mise en évidence', rows[0].name === 'PLVA' && rows[0].votes === 1 && rows[0].first, JSON.stringify(rows[0]));
  await shot(page, '08-classement-apres-vote', true);

  // Votes d'autres visiteurs → actualisation automatique (≤ 20 s) et changement d'ordre
  for (const [ig, ip] of [['bob', '203.0.113.1'], ['carla', '203.0.113.2']]) {
    await asAnon(`select public.cast_vote('world-love', 'X', 'Y', $1)`, [ig], ip);
  }
  const updated = await page.waitForFunction(() => document.querySelector('tbody tr strong')?.textContent === 'World Love', { timeout: 30000 }).then(() => true, () => false);
  rows = await tableRows(page);
  check('Actualisation automatique : World Love passe en tête (2 votes)', updated && rows[0].votes === 2, rows.map((r) => `${r.name}:${r.votes}`).join(' '));
  const barWidths = await page.$$eval('tbody [class*="barFill"]', (els) => els.slice(0, 2).map((e) => e.style.width));
  check('Barres proportionnelles aux votes', barWidths[0] === '100%' && barWidths[1] === '50%', barWidths.join(' / '));

  // Fermeture manuelle
  await db.query('select lf_admin.close_voting()');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('tbody tr');
  body = await text(page);
  rows = await tableRows(page);
  check('Votes fermés : classement et scores toujours visibles', body.includes('Votes clôturés') && rows[0].votes === 2 && rows.length === 5);
  check('Votes fermés : plus de lien « Voter »', !(await page.$('tbody a[href*="voter=1"]')));
  await shot(page, '09-classement-votes-fermes', true);
  const refused = (await asAnon(`select public.cast_vote('lva', 'A', 'B', 'tardif') as r`)).rows[0].r;
  check('Votes fermés : le serveur refuse tout nouveau vote', refused.code === 'voting_closed');
  await page.goto(`${BASE}/propager/lva`, { waitUntil: 'networkidle0' });
  check('Votes fermés : bouton de vote absent sur les fiches', !(await text(page)).includes('Je choisis ce T-shirt'));
  await db.query('select lf_admin.open_voting()');

  // ── Newsletter ──
  await page.goto(`${BASE}/chemin#newsletter`, { waitUntil: 'networkidle0' });
  await wait(800);
  body = await text(page);
  check('« Une application arrive » remplacée par la newsletter', !/application arrive/i.test(body) && body.includes("SOIS LE PREMIER À RECEVOIR NOS LETTRES D'AMOUR"));
  const nl = '#newsletter';
  await page.type(`${nl} input[type="email"]`, 'pas-une-adresse');
  await page.click(`${nl} button[type="submit"]`);
  check('Newsletter : adresse invalide refusée', (await page.$eval(`${nl}`, (e) => e.innerText)).includes('ne semble pas valide'));
  await page.$eval(`${nl} input[type="email"]`, (i) => { i.value = ''; });
  await page.click(`${nl} input[type="email"]`, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(`${nl} input[type="email"]`, 'Lettre@Exemple.fr');
  await page.click(`${nl} button[type="submit"]`);
  check('Newsletter : consentement obligatoire', (await page.$eval(nl, (e) => e.innerText)).includes('consentement'));
  await page.click(`${nl} input[type="checkbox"]`);
  await page.click(`${nl} button[type="submit"]`);
  await page.waitForFunction((s) => /C'est fait/.test(document.querySelector(s)?.innerText ?? ''), { timeout: 10000 }, nl).catch(() => {});
  let subs = (await db.query(`select email, status, consent_at from public.newsletter_subscribers`)).rows;
  check('Newsletter : inscription enregistrée dans newsletter_subscribers', subs.length === 1 && subs[0].email === 'lettre@exemple.fr' && subs[0].status === 'subscribed' && subs[0].consent_at, JSON.stringify(subs));
  await shot(page, '10-newsletter-confirmation');
  await page.goto(`${BASE}/a-propos`, { waitUntil: 'networkidle0' });
  const nl2 = '#newsletter-a-propos';
  await page.type(`${nl2} input[type="email"]`, 'lettre@exemple.fr');
  await page.click(`${nl2} input[type="checkbox"]`);
  await page.click(`${nl2} button[type="submit"]`);
  await page.waitForFunction((s) => /déjà inscrite/.test(document.querySelector(s)?.innerText ?? ''), { timeout: 10000 }, nl2).catch(() => {});
  subs = (await db.query(`select count(*)::int as n from public.newsletter_subscribers`)).rows[0].n;
  check('Newsletter : pas de doublon (message « déjà inscrite »)', subs === 1 && (await page.$eval(nl2, (e) => e.innerText)).includes('déjà inscrite'));

  // Désinscription
  const token = (await db.query(`select unsubscribe_token from public.newsletter_subscribers`)).rows[0].unsubscribe_token;
  await page.goto(`${BASE}/newsletter/desinscription?jeton=${token}`, { waitUntil: 'networkidle0' });
  await page.click('main button');
  await page.waitForFunction(() => /désinscription est confirmée/.test(document.body.innerText), { timeout: 10000 }).catch(() => {});
  const st = (await db.query(`select status from public.newsletter_subscribers`)).rows[0].status;
  check('Désinscription par lien : statut « unsubscribed » en base', st === 'unsubscribed');

  // ── À propos ──
  await page.goto(`${BASE}/a-propos`, { waitUntil: 'networkidle0' });
  body = await text(page);
  check('À propos : plus aucune mention d\'application', !/application/i.test(body));
  check('À propos : phrase centrale présente', body.includes("Les vêtements ne sont qu'un support. Ce que nous partageons, ce sont des valeurs."));
  check('À propos : nouvelle ambition vestimentaire', body.includes('Devenir une véritable maison de vêtements') && /Sacs/.test(body) && /Bonnets/.test(body));
  await shot(page, '11-a-propos', true);

  // ── Footer ──
  const links = await page.$$eval('footer a', (as) => as.map((a) => ({ t: a.innerText.replace('↗', '').replace('(nouvel onglet)', '').trim(), h: a.getAttribute('href') })));
  const want = {
    'Notre histoire': '/a-propos', 'Nos valeurs': '/a-propos#valeurs', 'Notre univers': '/propager',
    "Propager l'amour": '/propager', 'Les créations': '/propager#creations', "Le chemin de l'amour": '/chemin',
    Contact: '/chemin#communaute', Newsletter: '/chemin#newsletter',
    Instagram: 'https://www.instagram.com/allaboutloveandfaith?utm_source=qr',
    TikTok: 'https://www.tiktok.com/@haraajuku_?_r=1&_t=ZN-98Uls8eXHM6',
    'Podcast Love&Share': 'https://open.spotify.com/show/7hOmk7NRLwOxFoopFG6UFi',
    'Mentions légales': '/mentions-legales', 'En savoir plus': 'https://www.5hc.fr/',
  };
  const bad = Object.entries(want).filter(([t, h]) => !links.some((l) => l.t === t && l.h === h));
  check('Footer : 13 liens attendus avec les bonnes destinations', bad.length === 0, bad.map(([t]) => t).join(', '));
  await page.$eval('footer', (f) => f.scrollIntoView());
  await wait(600);
  await page.waitForFunction(() => {
    const img = document.querySelector('footer img[src="/brand/lovefaith-kiss.png"]');
    return img?.complete && img.naturalWidth > 0;
  }, { timeout: 8000 });
  const footerLogos = await page.$$eval('footer img', (imgs) => imgs.map((img) => img.getAttribute('src')));
  const footerText = await page.$eval('footer', (footer) => footer.innerText);
  const kissCentering = await page.$eval('footer [class*="emblem"]', (emblem) => {
    const circle = emblem.querySelector('[class*="circle"]:not([class*="circleRing"])');
    const kiss = emblem.querySelector('img[src="/brand/lovefaith-kiss.png"]');
    if (!circle || !kiss) return null;
    const circleBox = circle.getBoundingClientRect();
    const kissBox = kiss.getBoundingClientRect();
    return {
      dx: Math.abs((circleBox.left + circleBox.width / 2) - (kissBox.left + kissBox.width / 2)),
      dy: Math.abs((circleBox.top + circleBox.height / 2) - (kissBox.top + kissBox.height / 2)),
    };
  });
  check('Footer : bisou seul, centré dans le cercle',
    footerLogos.includes('/brand/lovefaith-kiss.png')
      && !footerLogos.includes('/brand/title-intro.png')
      && kissCentering?.dx < 2 && kissCentering?.dy < 2,
    footerLogos.join(' '));
  check('Footer : ancienne banderole et phrase supprimées',
    !footerText.includes('Amour · Foi') && !footerText.includes("Les vêtements ne sont qu'un support."),
    'aucune banderole ni phrase sous les logos');
  await page.screenshot({ path: path.join(SHOTS, '12-footer-desktop.png'), clip: await page.$eval('footer', (f) => { const r = f.getBoundingClientRect(); return { x: 0, y: r.y + window.scrollY - 80, width: window.innerWidth, height: r.height + 80 }; }), captureBeyondViewport: true });
  await page.click('footer a[href="/a-propos#valeurs"]');
  const valeursVisible = await page.waitForFunction(() => {
    const r = document.querySelector('#valeurs')?.getBoundingClientRect();
    return r && r.top >= -5 && r.top < window.innerHeight / 2;
  }, { timeout: 8000 }).then(() => true, () => false);
  check('Footer « Nos valeurs » : défile jusqu\'à la section', valeursVisible);
  await page.click('footer a[href="/mentions-legales"]');
  await page.waitForFunction(() => /Mentions légales/.test(document.querySelector('h1')?.textContent ?? ''), { timeout: 8000 }).catch(() => {});
  check('Mentions légales : page accessible', (await page.$eval('h1', (h) => h.textContent)) === 'Mentions légales');
  body = await text(page);
  const legalLinks = await page.$$eval('main a', (as) => as.map((a) => a.href));
  check('Mentions légales : adresse, fondateur, LinkedIn encodé et crédit 5HC',
    body.includes('30 boulevard de Sébastopol, 75004 Paris')
      && body.includes('Laïd Ousseni')
      && body.includes('Site conçu et développé par')
      && legalLinks.includes('https://www.linkedin.com/in/la%C3%AFd-ousseni/')
      && legalLinks.includes('https://www.5hc.fr/'));
  await page.goto(`${BASE}/chemin`, { waitUntil: 'networkidle0' });
  await page.click('footer a[href="/chemin#newsletter"]');
  const newsletterVisible = await page.waitForFunction(() => {
    const top = document.querySelector('#newsletter')?.getBoundingClientRect().top;
    return Number.isFinite(top) && Math.abs(top) < window.innerHeight / 2;
  }, { timeout: 8000 }).then(() => true, () => false);
  check('Footer « Newsletter » : défile jusqu\'au formulaire', newsletterVisible);
  check('Aucune erreur JavaScript (ordinateur)', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));

  // ═════════ TABLETTE / MOBILE ═════════
  for (const [label, vp] of [['tablette', { width: 820, height: 1180 }], ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const p = await newPage(vp);
    for (const url of ['/propager?c=world-love', '/propager/heart-of-ice', '/propager/batman-drop-01', '/chemin', '/a-propos', '/mentions-legales', '/confidentialite']) {
      await p.goto(BASE + url, { waitUntil: 'networkidle0' });
      await wait(500);
      check(`${label} ${url} : pas de défilement horizontal`, await noHorizontalScroll(p));
    }
    await p.goto(`${BASE}/propager/batman-drop-01`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('[class*="preorderPanel"] button');
    await p.$eval('[class*="preorderPanel"] button', (button) => button.click());
    await p.waitForSelector('[role="dialog"] #preorder-info-title');
    await p.waitForFunction(() => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog && dialog.getAnimations().every((animation) => animation.playState === 'finished');
    }, { timeout: 5000 });
    const infoBounds = await p.$eval('[role="dialog"]', (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    check(`${label} précommande : modale adaptée à l’écran et sans débordement`,
      await noHorizontalScroll(p)
        && (label !== 'mobile' || (infoBounds.width >= 389 && infoBounds.height >= 843)),
      JSON.stringify(infoBounds));
    await p.goto(`${BASE}/propager/heart-of-ice`, { waitUntil: 'networkidle0' });
    await wait(700);
    await shot(p, `20-${label}-fiche-2d`);
    if (label === 'mobile') {
      const dots = await p.$$eval('[aria-label="Face du vêtement"] button', (bs) => bs.filter((b) => b.offsetParent).length);
      check('Mobile : mockups en carrousel (devant / dos)', dots === 2);
      await p.click('[aria-label="Face du vêtement"] button:nth-child(2)');
      await wait(900);
      await shot(p, `21-${label}-carrousel-dos`);
    }
    await p.goto(`${BASE}/chemin`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('tbody tr');
    await shot(p, `22-${label}-classement`, true);
    await p.$eval('footer', (f) => f.scrollIntoView());
    await wait(600);
    await p.screenshot({ path: path.join(SHOTS, `23-${label}-footer.png`), clip: await p.$eval('footer', (f) => { const r = f.getBoundingClientRect(); return { x: 0, y: r.y + window.scrollY - 40, width: window.innerWidth, height: r.height + 40 }; }), captureBeyondViewport: true });
    check(`${label} : aucune erreur JavaScript`, p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
    await p.close();
  }
} catch (err) {
  console.error(err);
  check('Exécution sans exception', false, err.message);
} finally {
  await browser.close();
  await db.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies (${requests} appels Supabase servis par PostgreSQL). Captures : ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
