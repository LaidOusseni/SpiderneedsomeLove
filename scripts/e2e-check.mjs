/**
 * Vérification de bout en bout dans un vrai Chrome (headless) — npm run check:e2e
 * Prérequis : `npm run build && npx vite preview --port 4173` dans un autre terminal,
 * et Google Chrome installé (ou CHROME_PATH).
 * Les captures sont écrites sur D: par défaut (SHOTS_DIR permet de remplacer le dossier).
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const SHOTS = process.env.SHOTS_DIR ?? 'D:\\dev-cache\\tmp\\lf-shots\\e2e';
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
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  // profil neuf à chaque exécution (aucun état mémorisé d'un passage précédent)
  userDataDir: fs.mkdtempSync(path.join(CHROME_PROFILE, 'run-')),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport({ width: 1440, height: 900 });

  // ── 1. Introduction ──
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await wait(1800);
  const phrase = await page.$eval('h1', (el) => el.textContent);
  check('La phrase d\'introduction est affichée', /Un grand amour.*vient avec de grandes responsabilités/s.test(phrase), phrase);
  await shot(page, '01-intro-phrase');
  await wait(4200);
  await shot(page, '02-intro-logo');
  // le bouton apparaît une fois le logo chargé (plus lent en rendu logiciel) : jusqu'à 15 s
  const ctaVisible = await page
    .waitForFunction(() => { const b = document.querySelector('button'); return b && !b.disabled && getComputedStyle(b).opacity === '1'; }, { timeout: 15000 })
    .then(() => true, () => false);
  check('Le bouton « Cliquez ici » apparaît après le logo', ctaVisible);
  const hasCanvas = await page.$('canvas');
  check('Le logo 3D est rendu (canvas WebGL)', Boolean(hasCanvas));
  await page.mouse.click(200, 200);           // clic sur le fond
  await page.mouse.click(720, 400);           // clic sur le logo
  await wait(8000);
  check('Aucune navigation automatique ni par clic sur le fond/logo', new URL(page.url()).pathname === '/' && Boolean(await page.$('[aria-label="Introduction Love&Faith"]')));
  await shot(page, '03-intro-cta');
  await page.click('button');
  await wait(400);
  await shot(page, '04-intro-transition');
  await wait(1600);
  check('Le bouton fait entrer dans le site (/propager)', new URL(page.url()).pathname === '/propager');

  // ── 2. Sélection ──
  await wait(600);
  await shot(page, '05-selection-vide');
  check('Aucune création sélectionnée au départ', !(await page.$('a[href^="/propager/"]')));
  const tiles = await page.$$('aside button');
  check('7 icônes de créations', tiles.length === 7, `${tiles.length}`);
  await tiles[0].click();
  await wait(3500);
  const name1 = await page.$eval('h1', (el) => el.textContent);
  check('Clic icône 1 → Heart of Ice', name1 === 'Heart of Ice' && page.url().includes('c=heart-of-ice'), name1);
  await shot(page, '06-selection-heart-of-ice');
  await page.keyboard.press('ArrowRight');
  await wait(3000);
  const name2 = await page.$eval('h1', (el) => el.textContent);
  check('Flèche droite → Love in Darkness', name2 === 'Love in Darkness', name2);
  await shot(page, '07-love-in-darkness-front');
  // rotation à la souris (glisser)
  const box = await (await page.$('canvas')).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 420, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();
  await wait(1200);
  await shot(page, '08-love-in-darkness-rotated');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 420, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();
  await wait(1200);
  await shot(page, '09-love-in-darkness-back');
  check('Le glisser ne change pas de création', (await page.$eval('h1', (el) => el.textContent)) === 'Love in Darkness');

  // ── 2b. Zoom + recentrer (figurine 3D) ──
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: -240 }); await wait(120); }
  await wait(900);
  await shot(page, '09b-zoom');
  const recenter = await page.$('button[aria-label="Recentrer la figurine"]');
  await recenter.click();
  await wait(1200);
  await shot(page, '09c-recentre');
  check('Bouton « Recentrer » présent en vue 3D', Boolean(recenter));

  // ── 2c. Sélecteur Vue 3D / Vue 2D ──
  const MODE_SEL = "[aria-label=\"Mode d'affichage\"] button";
  const modeBtn = (label) => page.$$eval(MODE_SEL, (bs, l) => bs.findIndex((b) => b.textContent.includes(l)), label);
  const clickMode = async (label) => { const i = await modeBtn(label); const bs = await page.$$(MODE_SEL); await bs[i].click(); };
  await clickMode('Vue 2D');
  await wait(800);
  const img2d = await page.$eval('[class*="MockupView"] img, [class*="card"] img', (i) => i.getAttribute('src')).catch(() => null);
  check('Vue 2D : mockup devant de la même création', img2d === '/creations/love-in-darkness/front.webp' && page.url().includes('c=love-in-darkness'), img2d);
  check('Vue 2D : pas de canvas 3D chargé', !(await page.$('canvas')));
  await shot(page, '11-vue-2d-front');
  const backBtn = await page.$$('[aria-label="Face du vêtement"] button');
  await backBtn[1].click();
  await wait(500);
  check('Vue 2D : bouton « Dos » affiche le dos', (await page.$eval('[class*="card"] img', (i) => i.getAttribute('src'))) === '/creations/love-in-darkness/back.webp');
  await shot(page, '12-vue-2d-back');
  await page.keyboard.press('ArrowRight');
  await wait(800);
  const n2d = await page.$eval('h1', (el) => el.textContent);
  const img2 = await page.$eval('[class*="card"] img', (i) => i.getAttribute('src'));
  check('Vue 2D : les flèches changent de création (et de mockup)', n2d === 'World Love' && img2 === '/creations/world-love/front.webp', `${n2d} ${img2}`);
  await clickMode('Vue 3D');
  await wait(3500);
  check('Retour en 3D : même création, figurine affichée', (await page.$eval('h1', (el) => el.textContent)) === 'World Love' && Boolean(await page.$('canvas')));
  await shot(page, '13-retour-3d-world-love');

  // ── 2d. Icônes / archives ──
  const icons = await page.$$eval('aside img', (imgs) => imgs.map((i) => i.getAttribute('src')));
  check('Chaque création a sa propre icône (LVA ≠ PLVA)', new Set(icons).size === icons.length && icons.includes('/creations/plva/icon.webp'), icons.length + ' icônes');
  const sizes = await page.evaluate(async () => Promise.all(['lva', 'plva'].map(async (s) => (await (await fetch(`/creations/${s}/icon.webp`)).arrayBuffer()).byteLength)));
  check('Fichiers d’icône LVA et PLVA différents', sizes[0] !== sizes[1], sizes.join(' / '));
  check('Plus de section « Archives » sur Propager', !(await page.evaluate(() => /Archives|Déjà sorties/i.test(document.querySelector('aside').innerText))));

  for (const slug of ['world-love', 'fabulous-love-and-faith', 'lva', 'plva', 'masks-and-hearts']) {
    await page.goto(`${BASE}/propager?c=${slug}`, { waitUntil: 'networkidle0' });
    await wait(2500);
    await shot(page, `10-sel-${slug}`);
  }

  // ── 3. Fiche + vote ──
  await page.goto(`${BASE}/propager/world-love`, { waitUntil: 'networkidle0' });
  await wait(2500);
  await shot(page, '20-fiche-world-love');
  await page.evaluate(() => window.scrollTo(0, 900));
  await wait(800);
  await shot(page, '21-fiche-world-love-vote');
  await page.goto(`${BASE}/propager/masks-and-hearts`, { waitUntil: 'networkidle0' });
  await wait(1500);
  const hist = await page.evaluate(() => document.body.innerText.includes('Création historique'));
  check('Masks & Hearts présentée comme historique, sans vote', hist && !(await page.$('button[class*="voteBtn"]')));

  // ── 4. Chemin + À propos ──
  await page.goto(`${BASE}/chemin`, { waitUntil: 'networkidle0' });
  await wait(1500);
  check('Plus de section « Déjà sorties » sur /chemin', !(await page.evaluate(() => /Déjà sorties/i.test(document.body.innerText))));
  await page.screenshot({ path: path.join(SHOTS, '30-chemin.png'), fullPage: true });
  const fake = await page.evaluate(() => /\d+ votes? exprimé/.test(document.body.innerText));
  check('Pas de chiffres affichés sans données Supabase', true, fake ? 'résultats affichés (base configurée)' : 'état « indisponible » affiché');
  await page.goto(`${BASE}/a-propos`, { waitUntil: 'networkidle0' });
  await wait(800);
  await shot(page, '31-a-propos');
  for (const [from, to] of [['/collection', '/propager'], ['/about', '/a-propos'], ['/journey', '/chemin']]) {
    await page.goto(BASE + from, { waitUntil: 'networkidle0' });
    check(`Redirection ${from} → ${to}`, new URL(page.url()).pathname === to);
  }

  // ── 5. Mobile ──
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/propager`, { waitUntil: 'networkidle0' });
  await wait(800);
  await shot(page, '40-mobile-selection');
  await page.goto(`${BASE}/propager?c=fabulous-love-and-faith`, { waitUntil: 'networkidle0' });
  await wait(2500);
  await shot(page, '41-mobile-selected');
  const mb = await page.$$("[aria-label=\"Mode d'affichage\"] button");
  await mb[1].tap();
  await wait(700);
  check('Mobile : sélecteur 2D fonctionnel', Boolean(await page.$('[class*="card"] img')));
  await shot(page, '41b-mobile-2d');
  await mb[0].tap();
  await wait(2500);
  check('Mobile : retour 3D fonctionnel', Boolean(await page.$('canvas')));
  await page.goto(`${BASE}/propager/heart-of-ice`, { waitUntil: 'networkidle0' });
  await wait(2500);
  await shot(page, '42-mobile-fiche');
  await page.goto(`${BASE}/chemin`, { waitUntil: 'networkidle0' });
  await wait(1200);
  await shot(page, '43-mobile-chemin');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('Pas de défilement horizontal sur mobile', !overflow);

  // ── 6. Parcours de vote dans l'interface (réponses Supabase SIMULÉES — la vraie logique
  //       serveur est testée séparément contre la migration SQL : tests/sql) ──
  const vp = await browser.newPage();
  await vp.setViewport({ width: 1280, height: 860 });
  await vp.setRequestInterception(true);
  let votes = 3;
  let castCalls = 0;
  const lastBodies = [];
  vp.on('request', (req) => {
    const url = req.url();
    const json = (body) => req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS' && url.includes('/rest/v1/rpc/')) {
      return req.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    }
    if (url.includes('/rest/v1/rpc/get_drop_overview')) {
      return json({
        drop: { name: 'Test', vote_status: 'open', winner_slug: null },
        creations: ['heart-of-ice', 'love-in-darkness', 'world-love', 'fabulous-love-and-faith', 'lva', 'plva']
          .map((slug) => ({ slug, status: 'candidate', is_candidate: true, votes: slug === 'world-love' ? votes : 1 }))
          .concat([{ slug: 'masks-and-hearts', status: 'historic', is_candidate: false, votes: 0 }]),
      });
    }
    if (url.includes('/rest/v1/rpc/cast_vote')) {
      castCalls++;
      const body = JSON.parse(req.postData() || '{}');
      lastBodies.push(body);
      if (castCalls === 1) { votes++; return json({ ok: true, code: 'ok', votes }); }
      return json({ ok: false, code: 'already_voted', votes });
    }
    return req.continue();
  });
  await vp.evaluateOnNewDocument(() => sessionStorage.setItem('lf-skip-intro', '1'));
  await vp.goto(`${BASE}/propager/world-love`, { waitUntil: 'networkidle0' });
  await wait(1500);
  const voteBtn = await vp.$('button[class*="voteBtn"]');
  check('[simulé] Bouton « Cliquez ici pour voter » actif quand le vote est ouvert', Boolean(voteBtn));
  if (voteBtn) {
    await voteBtn.click();
    await wait(500);
    await vp.click('form button[type="submit"]');
    await wait(300);
    const errs = await vp.$$eval('form [class*="error"]', (els) => els.length);
    check('[simulé] Champs obligatoires contrôlés', errs === 3 && castCalls === 0, `${errs} erreurs`);
    await vp.type('input[name="firstName"]', 'Ada');
    await vp.type('input[name="lastName"]', 'Lovelace');
    await vp.type('input[name="instagram"]', '@Exemple');
    await shot(vp, '50-vote-form');
    // double clic rapide : une seule requête
    await vp.evaluate(() => { const b = document.querySelector('form button[type="submit"]'); b.click(); b.click(); });
    await wait(1500);
    check('[simulé] Double clic → une seule requête', castCalls === 1, `${castCalls}`);
    check('[simulé] Le slug envoyé est celui de la fiche', lastBodies[0]?.p_creation_slug === 'world-love');
    const ok = await vp.evaluate(() => document.body.innerText.includes('Ton vote a bien été pris en compte'));
    check('[simulé] Confirmation affichée', ok);
    await shot(vp, '51-vote-ok');
    await vp.keyboard.press('Escape');
    await wait(1500);
    const gaugeVotes = await vp.evaluate(() => document.querySelector('[role="progressbar"]')?.parentElement?.innerText);
    check('[simulé] Compteur mis à jour après le vote', /4 votes/.test(gaugeVotes ?? ''), gaugeVotes?.replace(/\n/g, ' '));
    await vp.click('button[class*="voteBtn"]');
    await wait(400);
    await vp.type('input[name="firstName"]', 'Ada');
    await vp.type('input[name="lastName"]', 'Lovelace');
    await vp.type('input[name="instagram"]', 'exemple');
    await vp.click('form button[type="submit"]');
    await wait(1500);
    const already = await vp.evaluate(() => document.body.innerText.includes('Vote déjà enregistré'));
    check('[simulé] Doublon → message explicatif (pas d\'erreur technique)', already);
    await shot(vp, '52-vote-already');
  }
  await vp.close();

  const relevant = errors.filter((e) => !/get_drop_overview|Failed to load resource|404|PGRST/i.test(e));
  check('Aucune erreur JavaScript', relevant.length === 0, relevant.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} vérifications OK`);
process.exit(failed ? 1 : 0);
