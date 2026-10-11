import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { qaCardImage } from '../scripts/qa/fixtures.mjs';
import { startQaNextRuntime } from '../scripts/qa/nextRuntime.mjs';

const minions = Array.from({ length: 120 }, (_, index) => ({
  card_id: `BUILDER_QA_${index}`, dbf: 10000 + index, in_pool: true,
  card_type: { slug: 'minion' }, tavern_tier: 1 + index % 6,
  name: { ru: `Минион ${index}`, en: `Minion ${index}` },
  creature_type: { slug: 'beast' }, text_ru: 'Боевой клич: получите карту.',
  images: { art: qaCardImage, card: qaCardImage },
}));

async function editorFixtures(page) {
  let unavailableArt = false;
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/qa-unavailable-art.png') {
      void request.respond({ status: 404, body: 'Unavailable fixture' });
      return;
    }
    if (url.pathname === '/api/card-art') {
      void request.respond({ status: 200, contentType: 'image/svg+xml', body: decodeURIComponent(qaCardImage.split(',')[1]) });
      return;
    }
    let payload;
    if (url.pathname === '/api/bg/library/cards') {
      payload = { data: unavailableArt ? minions.map(card => ({ ...card, images: { art: '/qa-unavailable-art.png', card: '/qa-unavailable-art.png' } })) : minions, pagination: { total_pages: 1, total: minions.length } };
    } else if (url.pathname === '/api/bg/library/extra/trinket') {
      payload = { data: [{ card_id: 'BUILDER_QA_TRINKET', in_pool: true,
        name: { ru: 'Контрольный аксессуар', en: 'Test trinket' }, images: { card: qaCardImage } }] };
    } else if (['/api/battlegrounds-library', '/api/battlegrounds-spells', '/api/battlegrounds-card-names'].includes(url.pathname)) {
      payload = { cards: [] };
    } else if (['/api/bg/comps', '/api/bg-comps'].includes(url.pathname)) {
      payload = { comps: [{ key: 'qa-composition', title: 'Контрольная сборка', tier: 'S', cards: [{ id: 'BUILDER_QA_0', ruName: 'Минион 0' }] }] };
    }
    if (payload) void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    else void request.continue();
  });
  return () => { unavailableArt = true; };
}

async function saved(page) {
  await page.waitForFunction(() => document.querySelector('.builder-draft-status')?.textContent.includes('сохранён'));
}

async function loadFromOldRouteBundle(page, asset) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
    page.evaluate(filename => {
      delete window.__hsArenaBgBuilderWorkbenchV1;
      const previous = document.querySelector(`script[src*="${filename}"]`);
      const script = document.createElement('script');
      script.src = previous.src;
      document.body.append(script);
    }, asset),
  ]);
}

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}

async function mobileTour(page) {
  const view = await page.$eval('.strategy-builder-page', root => root.dataset.builderView);
  const selector = '.builder-sidebar, .builder-canvas-panel, .hero-tier-board';
  const visiblePanels = await page.$$eval(selector, panels => panels.map(panel => panel.getClientRects().length > 0));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.locator('.global-faq-button').click();
  await page.waitForSelector('.global-help-menu__item.is-tour', { visible: true });
  await page.click('.global-help-menu__item.is-tour');
  await page.waitForFunction(() => document.querySelector('.page-tour__progress-row')
    ?.getAttribute('aria-label')?.startsWith('Шаг 1 из 7,'));
  assert.equal(await page.$$eval('.builder-sidebar, .builder-canvas-panel, .hero-tier-board',
    panels => panels.every(panel => getComputedStyle(panel).display !== 'none')), true);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.page-tour', { hidden: true });
  assert.equal(await page.$eval('.strategy-builder-page', root => root.dataset.builderView), view);
  assert.deepEqual(await page.$$eval(selector, panels => panels.map(panel => panel.getClientRects().length > 0)), visiblePanels);
  await noOverflow(page);
}

async function cardsDoNotOverlap(page) {
  assert.equal(await page.evaluate(() =>
    document.querySelector('.strategy-board').getBoundingClientRect().top <
    document.querySelector('.quick-slots-panel').getBoundingClientRect().top), true,
  'the board must appear before auxiliary slots');
  assert.equal(await page.$$eval('.placed-card', cards => {
    const rects = cards.map(card => card.getBoundingClientRect());
    return rects.every((a, index) => rects.slice(index + 1).every(b =>
      a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
  }), true, 'placed cards must fit the five-column grid');
}

async function download(page, directory, selector, extension) {
  const previous = new Set(await readdir(directory));
  await page.click(selector);
  let file;
  for (let attempt = 0; attempt < 100 && !file; attempt += 1) {
    file = (await readdir(directory)).find(name => name.endsWith(extension) && !previous.has(name));
    if (!file) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(file, `expected a ${extension} download: ${await page.$eval('.builder-export-status', node => node.textContent)}`);
  const bytes = await readFile(join(directory, file));
  if (extension === '.png') assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  else assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
}

test('subscriber builders support bounded catalogs, tier selection, drafts, undo and image export', { timeout: 120000 }, async () => {
  const runtime = await startQaNextRuntime();
  const directory = await mkdtemp(join(tmpdir(), 'bg-builders-export-'));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.browserContext().setCookie({ name: 'manacost_auth_token', value: 'qa-subscriber', url: runtime.origin });
    const breakImages = await editorFixtures(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });

    await page.goto(`${runtime.origin}/battlegrounds/tier-builder/`);
    await page.waitForSelector('.hero-tier-pool .tier-builder-destination');
    assert.equal(await page.$$eval('.hero-tier-pool .tier-builder-card', cards => cards.length), 60);
    await page.select('.hero-tier-pool .tier-builder-card:first-child select', 'B');
    await page.waitForSelector('.tier-builder-dropzone[data-tier="B"] .tier-builder-card');
    await page.evaluate(() => { window.testTierRow = document.querySelector('.tier-builder-row'); });
    await page.type('#tier-builder-search', 'Минион 119');
    await page.waitForFunction(() => document.querySelectorAll('.hero-tier-pool .tier-builder-card').length === 1);
    assert.equal(await page.evaluate(() => window.testTierRow === document.querySelector('.tier-builder-row')), true);
    await page.select('.hero-tier-pool select', 'D');
    await saved(page);
    await loadFromOldRouteBundle(page, 'hero-tier-builder.js');
    await page.waitForSelector('.tier-builder-dropzone[data-tier="D"] .tier-builder-card');
    assert.equal(await page.$$eval('.tier-builder-rows .tier-builder-card', cards => cards.length), 2);
    await page.click('#tier-builder-unassigned');
    assert.equal(await page.$$eval('.tier-builder-rows .tier-builder-card', cards => cards.length), 0);
    await page.click('.builder-undo');
    assert.equal(await page.$$eval('.tier-builder-rows .tier-builder-card', cards => cards.length), 2);
    await download(page, directory, '#tier-builder-download-all-png', '.png');
    await download(page, directory, '#tier-builder-download-all-webp', '.webp');
    await noOverflow(page);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.waitForSelector('.hero-tier-pool .tier-builder-card select');
    await noOverflow(page);
    await mobileTour(page);
    await page.select('.hero-tier-pool .tier-builder-card:first-child select', 'A');
    await page.waitForSelector('.tier-builder-dropzone[data-tier="A"] .tier-builder-card');

    await page.goto(`${runtime.origin}/battlegrounds/strategies/`);
    await page.waitForSelector('.builder-library .builder-card');
    await mobileTour(page);
    assert.equal(await page.$$eval('.builder-library .builder-card', cards => cards.length), 60);
    await page.click('.builder-load-more');
    assert.equal(await page.$$eval('.builder-library .builder-card', cards => cards.length), 120);
    await page.type('#builder-search', 'Минион');
    await page.waitForFunction(() => document.querySelectorAll('.builder-library .builder-card').length === 60);
    await page.click('.builder-library .builder-card');
    await page.waitForSelector('.placed-card');
    assert.equal(await page.$eval('.builder-card-name', name => {
      const label = name.getBoundingClientRect();
      const card = name.parentElement.getBoundingClientRect();
      return label.width > 30 && label.bottom <= card.bottom;
    }), true, 'catalog names must remain readable inside their cards');
    await page.click('.builder-workspace-tab[data-view=board]');
    assert.equal(await page.$eval('.strategy-board', board => {
      const rectangle = board.getBoundingClientRect();
      return rectangle.top >= 0 && rectangle.top < innerHeight * 0.6;
    }), true, 'switching to the board must bring placed cards into view');
    await page.click('.placed-card', { clickCount: 2 });
    assert.equal(await page.$$eval('.placed-card', cards => cards.length), 1, 'double tap must not delete a card');
    await page.click('.builder-workspace-tab[data-view=library]');
    for (let index = 0; index < 5; index += 1) await page.click('.builder-library .builder-card');
    assert.equal(await page.$$eval('.placed-card', cards => cards.length), 6);
    await saved(page);
    await loadFromOldRouteBundle(page, 'strategy-builder.gridfix2.js');
    await page.waitForSelector('.placed-card');
    await page.click('.builder-workspace-tab[data-view=board]');
    await page.focus('.placed-card');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$eval('.placed-card', card => document.activeElement === card), true);
    await cardsDoNotOverlap(page);
    await page.click('#builder-clear');
    assert.equal(await page.$$eval('.placed-card', cards => cards.length), 0);
    await page.click('.builder-undo');
    assert.equal(await page.$$eval('.placed-card', cards => cards.length), 6);
    await download(page, directory, '#builder-export-png', '.png');
    await download(page, directory, '#builder-export-webp', '.webp');
    await noOverflow(page);
    await saved(page);
    await page.setViewport({ width: 1440, height: 900 });
    await page.waitForSelector('.placed-card');
    await noOverflow(page);
    await cardsDoNotOverlap(page);
    const downloads = await readdir(directory);
    breakImages();
    await page.reload();
    await page.waitForSelector('.placed-card');
    await page.click('#builder-export-png');
    await page.waitForFunction(() => document.querySelector('.builder-export-status')?.textContent.includes('Не удалось'));
    assert.equal(await page.$eval('#builder-export-png', button => button.disabled), false);
    await saved(page);
    assert.equal(await page.$eval('.builder-export-status', node => node.textContent.includes('Не удалось')), true, 'draft feedback must not overwrite export failure');
    assert.deepEqual(await readdir(directory), downloads, 'failed export must not download an incomplete board');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
