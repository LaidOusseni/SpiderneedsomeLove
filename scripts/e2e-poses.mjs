/**
 * Tests des 7 poses de la figurine dans un vrai Chrome — node scripts/e2e-poses.mjs
 * Prérequis : `npm run build && npx vite preview --port 4173`.
 * Les comparaisons se font pixel à pixel sur le canvas (écart moyen en niveaux /255) :
 * immobilité, tenue de la pose, retour exact au neutre, conservation de la caméra.
 */
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const SHOTS = process.env.SHOTS_DIR ?? 'D:\\dev-cache\\tmp\\lf-shots\\poses';
const CHROME_PROFILE = process.env.CHROME_PROFILE ?? 'D:\\dev-cache\\tmp\\chrome-runs';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = process.env.POSE_PAGE ?? '/propager/heart-of-ice';
const ENTERED_KEY = 'lf-entered';
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(CHROME_PROFILE, { recursive: true });

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✘'} ${name}${extra ? ` — ${extra}` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SAME = 1.0; // écart moyen maximal pour « image identique »
const DIFF = 3.0; // écart moyen minimal pour « image différente »

async function grab(page, name) {
  const el = await page.$('[data-pose] canvas');
  const buf = await el.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  return sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}
function diff(a, b) {
  if (a.data.length !== b.data.length) return 255;
  let s = 0;
  for (let i = 0; i < a.data.length; i++) s += Math.abs(a.data[i] - b.data[i]);
  return s / a.data.length;
}
const fmt = (d) => d.toFixed(2);

async function poseState(page) {
  return page.$eval('[data-pose]', (el) => ({ pose: el.dataset.pose, applied: el.dataset.poseApplied }));
}
async function waitApplied(page, id, timeout = 90000) {
  return page.waitForFunction((p) => document.querySelector('[data-pose]')?.dataset.poseApplied === p, { timeout }, id)
    .then(() => true, () => false);
}
async function clickPose(page, label) {
  await page.click(`[role="radio"][title="${label}"]`);
}
// attend la fin de l'amortissement de la caméra (très lent en rendu logiciel) : deux images successives identiques
async function settle(page) {
  await page.mouse.move(5, 5); // aucune infobulle dans la capture
  let prev = await grab(page, '_settle');
  for (let i = 0; i < 40; i++) {
    await wait(1500);
    const cur = await grab(page, '_settle');
    if (diff(prev, cur) < 0.05) return;
    prev = cur;
  }
}
// l'introduction n'est montrée qu'à la première visite de la session : on la marque comme vue
const skipIntro = (page) => page.evaluateOnNewDocument((k) => sessionStorage.setItem(k, '1'), ENTERED_KEY);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: fs.mkdtempSync(path.join(CHROME_PROFILE, 'run-')),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport({ width: 1440, height: 900 });
  await skipIntro(page);

  // ── Test 1 : première visite ──
  await page.goto(BASE + PAGE, { waitUntil: 'domcontentloaded' });
  const ready = await page.waitForFunction(() => {
    const b = document.querySelector('[role="radio"]');
    return b && !b.disabled;
  }, { timeout: 90000 }).then(() => true, () => false);
  check('Le modèle riggé se charge (sélecteur actif)', ready);
  await page.$eval('[data-pose]', (el) => el.scrollIntoView({ block: 'center' }));
  await wait(2500);
  let st = await poseState(page);
  const checked = await page.$eval('[role="radio"][aria-checked="true"]', (b) => b.title);
  check('Pose neutre au chargement', st.pose === 'neutre' && st.applied === 'neutre' && checked === 'Neutre', JSON.stringify(st));
  const icons = await page.$$eval('[role="radio"]', (bs) => bs.map((b) => b.title));
  check('7 icônes de pose', icons.length === 7, icons.join(' | '));
  const n0 = await grab(page, '01-neutre-chargement');
  await wait(4000);
  const n1 = await grab(page, '02-neutre-4s-plus-tard');
  check('Aucune animation automatique (image identique 4 s plus tard)', diff(n0, n1) < SAME, `écart ${fmt(diff(n0, n1))}`);
  await page.hover('[role="radio"][title="Assis"]');
  await wait(1200);
  const n2 = await grab(page, '03-survol-icone');
  st = await poseState(page);
  check('Le survol d\'une icône ne déclenche rien', st.applied === 'neutre' && diff(n0, n2) < SAME, `écart ${fmt(diff(n0, n2))}`);

  // ── Test 2 : animation unique ──
  await clickPose(page, 'Bras croisés');
  const ok2 = await waitApplied(page, 'bras-croises');
  const c1 = await grab(page, '04-bras-croises');
  await wait(3000);
  const c2 = await grab(page, '05-bras-croises-3s-plus-tard');
  check('Bras croisés : pose atteinte', ok2 && diff(n0, c1) > DIFF, `écart au neutre ${fmt(diff(n0, c1))}`);
  check('Bras croisés : pose finale conservée (pas de boucle ni de retour)', diff(c1, c2) < SAME, `écart ${fmt(diff(c1, c2))}`);
  await clickPose(page, 'Bras croisés');
  await wait(1500);
  const c3 = await grab(page, '06-bras-croises-reclic');
  check('Reclic sur la même icône : rien n\'est relancé', diff(c1, c3) < SAME, `écart ${fmt(diff(c1, c3))}`);

  // ── Test 3 : changement de pose ──
  await clickPose(page, 'Ajuste le bonnet');
  const ok3 = await waitApplied(page, 'bonnet');
  const b1 = await grab(page, '07-ajuste-bonnet');
  check('Bras croisés → Ajuste le bonnet', ok3 && diff(c1, b1) > DIFF && diff(n0, b1) > DIFF, `écart ${fmt(diff(c1, b1))}`);

  // ── Test 4 : retour au neutre ──
  await clickPose(page, 'Neutre');
  const ok4 = await waitApplied(page, 'neutre');
  await wait(800);
  const r1 = await grab(page, '08-retour-neutre');
  check('Retour exact à la pose neutre', ok4 && diff(n0, r1) < SAME, `écart à l'image initiale ${fmt(diff(n0, r1))}`);

  // ── Toutes les poses ──
  for (const [label, id] of [['Main dans la poche', 'main-poche'], ['Pouce vers l’avant', 'pouce'], ['Regard de côté', 'regard']]) {
    await clickPose(page, label);
    const ok = await waitApplied(page, id);
    const img = await grab(page, `09-${id}`);
    check(`Pose « ${label} »`, ok && diff(n0, img) > DIFF, `écart au neutre ${fmt(diff(n0, img))}`);
  }

  // ── Test 6 : assis ──
  await clickPose(page, 'Assis');
  const ok6 = await waitApplied(page, 'assis');
  await wait(600);
  const s1 = await grab(page, '10-assis');
  check('Pose assise atteinte', ok6 && diff(n0, s1) > DIFF);
  await clickPose(page, 'Neutre');
  await waitApplied(page, 'neutre');
  await wait(800);
  const s2 = await grab(page, '11-assis-puis-neutre');
  check('Assis → Neutre : posture initiale, tabouret disparu', diff(n0, s2) < SAME, `écart ${fmt(diff(n0, s2))}`);

  // ── Test 5 : caméra indépendante ──
  const box = await (await page.$('[data-pose] canvas')).boundingBox();
  const cx = box.x + box.width * 0.35;
  const cy = box.y + box.height * 0.5;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx + i * 14, cy, { steps: 2 });
  await page.mouse.up();
  await settle(page);
  const k0 = await grab(page, '12-camera-tournee');
  check('La caméra tourne (vue changée)', diff(n0, k0) > DIFF, `écart ${fmt(diff(n0, k0))}`);
  check('Tourner la caméra ne change pas la pose', (await poseState(page)).applied === 'neutre');
  await clickPose(page, 'Bras croisés');
  await waitApplied(page, 'bras-croises');
  await settle(page);
  const k1 = await grab(page, '13-camera-tournee-bras-croises');
  await clickPose(page, 'Neutre');
  await waitApplied(page, 'neutre');
  await settle(page);
  const k2 = await grab(page, '14-camera-tournee-retour-neutre');
  check('Changer de pose ne réinitialise pas la caméra', diff(k0, k2) < SAME && diff(k0, k1) > DIFF,
    `neutre avant/après : ${fmt(diff(k0, k2))}`);

  // ── Test 7 : clics rapides ──
  for (const label of ['Assis', 'Pouce vers l’avant', 'Bras croisés', 'Ajuste le bonnet', 'Assis', 'Regard de côté']) {
    await clickPose(page, label);
    await wait(70);
  }
  const ok7 = await waitApplied(page, 'regard');
  check('Clics rapides : la dernière pose demandée est atteinte', ok7, JSON.stringify(await poseState(page)));
  await clickPose(page, 'Neutre');
  await waitApplied(page, 'neutre');
  await settle(page);
  const q = await grab(page, '15-clics-rapides-puis-neutre');
  check('Clics rapides : aucune articulation bloquée (retour neutre exact)', diff(k0, q) < SAME, `écart ${fmt(diff(k0, q))}`);
  await page.screenshot({ path: path.join(SHOTS, '16-page-fiche.png') });

  // ── Zoom (page Propager, zoom actif) ──
  await page.goto(BASE + '/propager?c=heart-of-ice', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.querySelector('[role="radio"]'); return b && !b.disabled; }, { timeout: 90000 });
  await wait(2000);
  const vb = await (await page.$('[data-pose] canvas')).boundingBox();
  await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
  await page.mouse.wheel({ deltaY: -400 });
  await wait(1500);
  st = await poseState(page);
  check('Le zoom ne déclenche aucune animation', st.pose === 'neutre' && st.applied === 'neutre');
  await page.screenshot({ path: path.join(SHOTS, '17-page-propager.png') });

  // ── Test 8 : mobile ──
  const m = await browser.newPage();
  await skipIntro(m);
  await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(BASE + PAGE, { waitUntil: 'domcontentloaded' });
  await m.waitForFunction(() => { const b = document.querySelector('[role="radio"]'); return b && !b.disabled; }, { timeout: 90000 });
  await m.$eval('[data-pose]', (el) => el.scrollIntoView({ block: 'center' }));
  await wait(2000);
  const inView = await m.$$eval('[role="radio"]', (bs) => bs.map((b) => {
    const r = b.getBoundingClientRect();
    const v = b.closest('[data-pose]').getBoundingClientRect(); // dans le cadre du visualiseur, pas seulement l'écran
    return r.left >= v.left && r.right <= v.right && r.width >= 40 && r.height >= 40;
  }));
  check('Mobile : les 7 icônes sont visibles et assez grandes', inView.length === 7 && inView.every(Boolean), JSON.stringify(inView));
  await m.screenshot({ path: path.join(SHOTS, '18-mobile-neutre.png') });
  await m.tap('[role="radio"][title="Pouce vers l’avant"]');
  const okm = await waitApplied(m, 'pouce');
  check('Mobile : sélection d\'une pose au toucher', okm);
  const mv = await (await m.$('[data-pose] canvas')).boundingBox();
  const tx = mv.x + mv.width * 0.3;
  const ty = mv.y + mv.height * 0.5;
  const before = await grab(m, '19-mobile-pouce');
  await m.touchscreen.touchStart(tx, ty);
  for (let i = 1; i <= 10; i++) await m.touchscreen.touchMove(tx + i * 12, ty);
  await m.touchscreen.touchEnd();
  await wait(1500);
  const after = await grab(m, '20-mobile-pouce-tourne');
  check('Mobile : rotation au doigt', diff(before, after) > DIFF && (await poseState(m)).applied === 'pouce', `écart ${fmt(diff(before, after))}`);
  await m.screenshot({ path: path.join(SHOTS, '21-mobile-page.png') });

  const real = errors.filter((e) => !/favicon|supabase|voteService|Failed to fetch|Failed to load resource/i.test(e));
  check('Aucune erreur JavaScript', real.length === 0, real.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
process.exit(failed.length ? 1 : 0);
