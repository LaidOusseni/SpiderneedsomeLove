/**
 * Captures des motifs sur la figurine 3D (face et dos) pour chaque création — contrôle visuel.
 * Prérequis : `npm run build && npx vite preview --port 4173`. Usage : node scripts/shots-prints.mjs [dossier]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const OUT = process.env.SHOTS_DIR ?? process.argv[2] ?? 'D:\\dev-cache\\tmp\\lf-shots\\prints';
const CHROME_PROFILE = process.env.CHROME_PROFILE ?? 'D:\\dev-cache\\tmp\\chrome-runs';
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SLUGS = (process.env.SLUGS ?? 'heart-of-ice,love-in-darkness,world-love,fabulous-love-and-faith,lva,plva,masks-and-hearts').split(',');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CHROME_PROFILE, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: fs.mkdtempSync(path.join(CHROME_PROFILE, 'run-')),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    sessionStorage.setItem('lf-skip-intro', '1');
    localStorage.setItem('lf-view-mode', '3d');
  });
  await page.setViewport({ width: 1100, height: 900 });
  for (const slug of SLUGS) {
    await page.goto(`${BASE}/propager?c=${slug}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.querySelector('[role="radio"]'); return b && !b.disabled; }, { timeout: 120000 });
    await wait(5000);
    const canvas = await page.$('[data-pose] canvas');
    await canvas.screenshot({ path: path.join(OUT, `${slug}-face.png`) });
    // demi-tour : glisser horizontalement (OrbitControls), puis attendre la fin de l'amortissement
    const b = await canvas.boundingBox();
    await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.2 + b.height * 0.5 / 0.75 * 1.0, b.y + b.height * 0.5, { steps: 12 });
    await page.mouse.up();
    await wait(9000);
    await canvas.screenshot({ path: path.join(OUT, `${slug}-dos.png`) });
    console.log(slug);
  }
} finally {
  await browser.close();
}
