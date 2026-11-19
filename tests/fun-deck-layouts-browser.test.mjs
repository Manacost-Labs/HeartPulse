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
  assert.equal(await page.evaluate(() => window.localStorage.getItem('hp:deck-layout')), 'rows');
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

  // A tile is never empty: while its picture does not answer, the cost and the name are drawn in a 5:1 box.
  const probe = await browser.newPage();
  try {
    await probe.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await probe.setRequestInterception(true);
    probe.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/card-image/')) return; // held: never answered
      void request.continue();
    });
    await probe.goto(storybook.storyUrl('constructed-fun-deck-layouts--tiles'), { waitUntil: 'domcontentloaded' });
    await probe.waitForSelector('a[aria-label="4 маны · Зиллиакс Делюкс 3000"] .fun-deck-tile__fallback');
    const held = await probe.$eval('a[aria-label="4 маны · Зиллиакс Делюкс 3000"]', link => {
      const box = link.getBoundingClientRect();
      const fallback = link.querySelector('.fun-deck-tile__fallback');
      return { ratio: box.width / box.height, text: fallback.textContent, visible: getComputedStyle(fallback).visibility };
    });
    assert.ok(Math.abs(held.ratio - 5) < 0.2, `tile keeps 5:1 while loading, got ${held.ratio}`);
    assert.match(held.text, /4Зиллиакс Делюкс 3000/);
    assert.equal(held.visible, 'visible');
  } finally {
    await probe.close();
  }

  // A 502 gets exactly one retry, and the fallback stays when the retry fails too.
  const retry = await browser.newPage();
  try {
    const hits = new Map();
    await retry.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await retry.setRequestInterception(true);
    retry.on('request', request => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/card-image/')) {
        hits.set(pathname, (hits.get(pathname) ?? 0) + 1);
        void request.respond({ status: 502, contentType: 'application/json', body: '{}', headers: { 'cache-control': 'no-store' } });
        return;
      }
      void request.continue();
    });
    await retry.goto(storybook.storyUrl('constructed-fun-deck-layouts--tiles'), { waitUntil: 'domcontentloaded' });
    await retry.waitForSelector('a[aria-label="4 маны · Зиллиакс Делюкс 3000"]');
    await new Promise(resolve => setTimeout(resolve, 9_000));
    // One request and one retry per picture URL (tiles of the same card share the browser's request).
    assert.ok(hits.size > 0);
    for (const [pathname, count] of hits) assert.equal(count, 2, `${pathname}: asked ${count} times`);
    assert.equal(await retry.$eval('a[aria-label="4 маны · Зиллиакс Делюкс 3000"] .fun-deck-tile__fallback', node => getComputedStyle(node).visibility), 'visible');
  } finally {
    await retry.close();
  }

  // A mouse over a tile or a portrait shows the full card; leaving or Escape closes it; a tile links to its page.
  const hover = await browser.newPage();
  try {
    await hover.evaluateOnNewDocument(() => {
      const native = window.matchMedia.bind(window);
      window.matchMedia = query => {
        const list = native(query);
        return query.includes('hover: hover')
          ? new Proxy(list, { get: (target, key) => (key === 'matches' ? true : typeof target[key] === 'function' ? target[key].bind(target) : target[key]) })
          : list;
      };
    });
    await hover.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await hover.setRequestInterception(true);
    hover.on('request', request => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/card-image/') || pathname.startsWith('/api/public-resource/')) {
        void request.respond({ status: 200, contentType: 'image/gif', body: PIXEL });
        return;
      }
      void request.continue();
    });
    await hover.goto(storybook.storyUrl('constructed-fun-deck-layouts--tiles'), { waitUntil: 'domcontentloaded' });
    await hover.waitForSelector('a[aria-label="4 маны · Зиллиакс Делюкс 3000"]');
    assert.equal(await hover.$eval('a[aria-label="4 маны · Зиллиакс Делюкс 3000"]', link => link.hasAttribute('title')), false, 'no second tooltip next to the preview');
    await hover.hover('a[aria-label="4 маны · Зиллиакс Делюкс 3000"]');
    await hover.waitForSelector('[data-card-preview-id="TOY_330"]');
    await hover.keyboard.press('Escape');
    await hover.waitForFunction(() => !document.querySelector('[data-card-preview-id]'));
    await hover.hover('[role="img"][aria-label^="2 маны · Аварийный модуль"]'); // a token without a page
    await hover.waitForSelector('[data-card-preview-id]');
    await hover.mouse.move(5, 5);
    await hover.waitForFunction(() => !document.querySelector('[data-card-preview-id]'));
    await hover.click('[aria-label="Вид колод"] button:nth-of-type(2)');
    await hover.waitForSelector('a.fun-deck-portrait');
    await hover.hover('a.fun-deck-portrait');
    await hover.waitForSelector('[data-card-preview-id]');
  } finally {
    await hover.close();
  }

  // Keyboard focus on a tile below the first screen scrolls it into view and the preview stays, beside its card.
  const keys = await browser.newPage();
  try {
    await keys.setViewport({ width: 1440, height: 700, deviceScaleFactor: 1 });
    await keys.setRequestInterception(true);
    keys.on('request', request => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/card-image/') || pathname.startsWith('/api/public-resource/')) {
        void request.respond({ status: 200, contentType: 'image/gif', body: PIXEL });
        return;
      }
      void request.continue();
    });
    await keys.goto(storybook.storyUrl('constructed-fun-deck-layouts--tiles'), { waitUntil: 'domcontentloaded' });
    await keys.waitForSelector('a.fun-deck-tile');
    let tabs = 0;
    let focusedBelowFold = false;
    while (tabs < 120 && !focusedBelowFold) {
      await keys.keyboard.press('Tab');
      tabs += 1;
      focusedBelowFold = await keys.evaluate(() => {
        const active = document.activeElement;
        return Boolean(active?.matches('a.fun-deck-tile')) && window.scrollY > 300;
      });
    }
    assert.ok(focusedBelowFold, 'Tab reaches a tile that needed scrolling');
    await keys.waitForSelector('[data-card-preview-id]', { timeout: 5_000 });
    await new Promise(resolve => setTimeout(resolve, 600));
    const placed = await keys.evaluate(() => {
      const tile = document.activeElement.getBoundingClientRect();
      const preview = document.querySelector('[data-card-preview-id]').getBoundingClientRect();
      return { shown: true, overlapsVertically: preview.top < tile.bottom && preview.bottom > tile.top, inViewport: preview.top >= 0 && preview.bottom <= window.innerHeight };
    });
    assert.ok(placed.shown && placed.overlapsVertically && placed.inViewport, `the preview stays next to the focused tile: ${JSON.stringify(placed)}`);
  } finally {
    await keys.close();
  }

  // A subscriber sees all nine decks and no «Показать ещё»; a deck is resolved when it nears the screen.
  const many = await browser.newPage();
  try {
    await many.setViewport({ width: 1440, height: 700, deviceScaleFactor: 1 });
    await many.setRequestInterception(true);
    many.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/card-image/')) { void request.respond({ status: 200, contentType: 'image/gif', body: PIXEL }); return; }
      void request.continue();
    });
    await many.goto(storybook.storyUrl('constructed-fun-deck-layouts--all-decks'), { waitUntil: 'domcontentloaded' });
    await many.waitForFunction(() => document.querySelectorAll('section[aria-label="Подборка фан-колод"] > article').length === 9);
    assert.equal(await many.evaluate(() => [...document.querySelectorAll('button')].some(button => /Показать ещё/.test(button.textContent))), false);
    await new Promise(resolve => setTimeout(resolve, 800));
    // The cards within one screen of the viewport (innerHeight above and below) are resolved, no others.
    const near = await many.$$eval('section[aria-label="Подборка фан-колод"] > article', (cards, height) => cards.filter(card => card.getBoundingClientRect().top < height * 2).length, 700);
    const requested = await many.evaluate(() => new Set(window.__funDeckResolves).size);
    assert.ok(near >= 1 && near < 9, `some decks are far from the screen, got ${near} near of 9`);
    assert.equal(requested, near, `${requested} decks resolved at first, ${near} are within one screen`);
    await many.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await many.waitForFunction(() => document.querySelectorAll('.fun-deck-tiles__list').length === 9, { timeout: 15_000 });
  } finally {
    await many.close();
  }
  assert.deepEqual(runtimeErrors, []);
} finally {
  await browser?.close();
  await storybook.close();
}
