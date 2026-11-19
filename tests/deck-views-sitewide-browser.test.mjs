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
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for the site deck view browser tests');

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

// The builds of an archetype and the decks with a card share the fun-decks
// views: builder tiles by default, rows of portraits, or the Deckview picture.
// One switch changes every deck list on the page and the choice is remembered.
const storybook = await startStorybookStatic();
let browser;
try {
  browser = await launchBrowser({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/card-image/') || pathname.startsWith('/api/deck/render')) {
      void request.respond(pathname.startsWith('/api/card-image/')
        ? { status: 200, contentType: 'image/gif', body: PIXEL }
        : { status: 503, contentType: 'application/json', body: '{"error":"fixture"}' });
      return;
    }
    void request.continue();
  });

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(storybook.storyUrl('constructed-deck-views-across-the-site--tiles'), { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelectorAll('a[aria-label="4 маны · Зиллиакс Делюкс 3000"]').length === 2);

  const sections = () => page.evaluate(() => ({
    builds: document.querySelectorAll('.archetype-builds article').length,
    buildTiles: document.querySelectorAll('.archetype-builds .fun-deck-tiles').length,
    cardDecks: document.querySelectorAll('.constructed-card-detail__decks article').length,
    cardDeckTiles: document.querySelectorAll('.constructed-card-detail__decks .fun-deck-tiles').length,
    pressed: [...document.querySelectorAll('[aria-label="Вид колод"] [aria-pressed="true"]')].map(button => button.textContent.trim()),
  }));
  assert.deepEqual(await sections(), { builds: 2, buildTiles: 2, cardDecks: 2, cardDeckTiles: 2, pressed: ['Плитки', 'Плитки'] });
  assert.match(await page.$eval('.archetype-builds article h3', node => node.textContent), /^Сборка 1$/);
  assert.equal(
    await page.$eval('.archetype-builds article [aria-label^="4 маны · Зиллиакс"]', link => link.getAttribute('href')),
    '/standard/cards/wild/TOY_330/',
  );

  // One switch changes both lists.
  await page.click('.archetype-builds [aria-label="Вид колод"] button:nth-of-type(2)');
  await page.waitForFunction(() => document.querySelectorAll('[aria-label^="Кривая маны"]').length === 4);
  assert.deepEqual((await sections()).pressed, ['Строки', 'Строки']);
  assert.equal(await page.evaluate(() => window.localStorage.getItem('hp:deck-layout')), 'rows');

  // Pictures: each section's earlier card.
  await page.click('.constructed-card-detail__decks [aria-label="Вид колод"] button:nth-of-type(3)');
  await page.waitForFunction(() => document.querySelectorAll('.archetype-deck-card').length === 2
    && document.querySelectorAll('.constructed-card-detail__deck').length === 2);
  assert.deepEqual((await sections()).pressed, ['Картинки', 'Картинки']);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  for (const view of [1, 2]) {
    await page.click(`.archetype-builds [aria-label="Вид колод"] button:nth-of-type(${view})`);
    await page.waitForFunction(() => document.querySelectorAll('img[src*="/api/card-image/"]').length > 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `view ${view} overflows a 390px screen by ${overflow}px`);
  }
  assert.deepEqual(runtimeErrors, []);
} finally {
  await browser?.close();
  await storybook.close();
}
