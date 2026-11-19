import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startStorybookStatic } from './helpers/storybookStatic.mjs';

const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for fun deck layout browser tests');

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

// The fun-decks page shows each deck as builder tiles by default, as rows of
// round portraits, or as the Deckview picture. Card art comes from the site's
// card-image route; the stub answers it so only the requested variants matter.
const storybook = await startStorybookStatic();
let browser;
try {
  browser = await launchBrowser({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const runtimeErrors = [];
  const artRequests = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/card-image/')) {
      artRequests.push(pathname);
      void request.respond({ status: 200, contentType: 'image/gif', body: PIXEL });
      return;
    }
    void request.continue();
  });

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(storybook.storyUrl('constructed-fun-deck-layouts--tiles'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('a[aria-label="4 маны · Зиллиакс Делюкс 3000"]');

  const pressed = () => page.$eval('[role="group"][aria-label="Вид колод"] [aria-pressed="true"]', button => button.textContent.trim());
  assert.equal(await pressed(), 'Плитки');

  // Mech Rogue opens with its built Zilliax: 2 + 2 mana of modules, a link to its page, the modules under it.
  const mechRogue = await page.$eval('ul[aria-label="Состав колоды Mech Rogue"]', list => [...list.querySelectorAll('[aria-label]')]
    .slice(0, 4).map(item => [item.getAttribute('aria-label'), item.getAttribute('href')]));
  assert.deepEqual(mechRogue, [
    ['4 маны · Зиллиакс Делюкс 3000', '/standard/cards/wild/TOY_330/'],
    ['Модули Зиллиакса', null],
    ['2 маны · Аварийный модуль', null],
    ['2 маны · Энергетический модуль', null],
  ]);
  const deckText = await page.$eval('main, #storybook-root', root => root.textContent);
  assert.match(deckText, /Шаман · Вольный · 40 карт/);
  assert.doesNotMatch(deckText, /HSGuru/);
  assert.ok(artRequests.length > 0 && artRequests.every(path => path.endsWith('/row.webp')), 'tiles load only the row art');

  // Rows: one deck per line with portraits and a mana curve; the choice is remembered.
  await page.click('[aria-label="Вид колод"] button[aria-pressed="false"]:nth-of-type(2)');
  await page.waitForSelector('[aria-label^="Кривая маны"]');
  assert.equal(await pressed(), 'Строки');
  assert.equal(await page.$$eval('[aria-label^="Кривая маны"]', curves => curves.length), 3);
  await page.waitForFunction(() => document.querySelectorAll('img[src*="/portrait.webp"]').length > 0);
  assert.equal(await page.evaluate(() => window.localStorage.getItem('hp:fun-decks:layout')), 'rows');
  assert.equal(await page.$eval('a[aria-label="4 маны · Зиллиакс Делюкс 3000"]', link => link.getAttribute('href')), '/standard/cards/wild/TOY_330/');

  // Pictures: the earlier Deckview card with its copy button.
  await page.click('[aria-label="Вид колод"] button:nth-of-type(3)');
  await page.waitForFunction(() => document.querySelectorAll('article .fun-deck-card__copy, article button[aria-label^="Скопировать код колоды"]').length === 3);
  assert.equal(await pressed(), 'Картинки');

  // A phone keeps every view inside the screen.
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  for (const view of [1, 2]) {
    await page.click(`[aria-label="Вид колод"] button:nth-of-type(${view})`);
    await page.waitForFunction(() => document.querySelectorAll('img[src*="/api/card-image/"]').length > 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `view ${view} overflows a 390px screen by ${overflow}px`);
  }
  assert.deepEqual(runtimeErrors, []);
} finally {
  await browser?.close();
  await storybook.close();
}
