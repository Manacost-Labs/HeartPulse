import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { stripVTControlCharacters } from 'node:util';
import puppeteer from 'puppeteer';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const screenshotPrefix = `/tmp/manacost-archetypes-${process.pid}`;
const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for archetype browser tests');

const vite = spawn('./node_modules/.bin/vite', [
  '--config', 'tests/fixtures/vite.modal.config.ts',
  '--host', '127.0.0.1',
  '--port', '0',
  '--strictPort',
], {
  cwd: process.cwd(),
  detached: true,
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
let origin = '';
for (const stream of [vite.stdout, vite.stderr]) {
  stream.on('data', chunk => {
    output += chunk.toString();
    const match = stripVTControlCharacters(output).match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)\/?/);
    if (match) origin = match[1];
  });
}

async function stopVite() {
  if (vite.exitCode !== null) return;
  try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* already stopped */ }
  await new Promise(resolve => setTimeout(resolve, 200));
  if (vite.exitCode === null) {
    try { process.kill(-vite.pid, 'SIGKILL'); } catch { /* already stopped */ }
  }
}

let browser;
try {
  const deadline = Date.now() + 30_000;
  while (!origin && Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error(`Vite exited before becoming ready\n${output}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  if (!origin) throw new Error(`Vite did not become ready\n${output}`);

  browser = await puppeteer.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));

  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/constructed-archetypes.html?format=wild`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-row');
  assert.equal(await page.$$eval('.archetype-row', rows => rows.length), 3);
  assert.equal(await page.$$eval('.archetypes-format-switch button', buttons => buttons.length), 2);
  assert.equal(await page.$$eval('.archetypes-class-filter button', buttons => buttons.length), 12);
  assert.equal(await page.$eval('h1', heading => heading.textContent), 'Архетипы');
  assert.ok(await page.$('[data-tour-id="archetypes-format"]'));
  assert.ok(await page.$('[data-tour-id="archetypes-class-filter"]'));
  assert.ok(await page.$('[data-tour-id="archetypes-search"]'));
  assert.ok(await page.$('[data-tour-id="archetypes-sort"]'));
  assert.ok(await page.$('[data-tour-id="archetypes-results"]'));
  await page.click('.archetypes-class-filter button[aria-label^="Маг:"]');
  await page.waitForFunction(() => document.querySelectorAll('.archetype-row').length === 1);
  assert.equal(await page.$eval('.archetype-row h2', heading => heading.textContent), 'Квест Маг');
  assert.match(page.url(), /[?&]class=mage(?:&|$)/);
  await page.click('.archetypes-class-filter button[aria-label^="Все классы:"]');
  await page.waitForFunction(() => document.querySelectorAll('.archetype-row').length === 3);
  await page.screenshot({ path: `${screenshotPrefix}-desktop.png`, fullPage: true });

  for (const width of [1024, 768, 375, 320]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    const responsiveCatalog = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      minFormatButtonHeight: Math.min(...[...document.querySelectorAll('.archetypes-format-switch button')].map(element => element.getBoundingClientRect().height)),
      minClassButtonHeight: Math.min(...[...document.querySelectorAll('.archetypes-class-filter button')].map(element => element.getBoundingClientRect().height)),
      minOpenHeight: Math.min(...[...document.querySelectorAll('.archetype-row__open')].map(element => element.getBoundingClientRect().height)),
    }));
    assert.ok(responsiveCatalog.overflow <= 1, `catalog overflowed by ${responsiveCatalog.overflow}px at ${width}px`);
    assert.ok(responsiveCatalog.minFormatButtonHeight >= 44, `format target too small at ${width}px`);
    assert.ok(responsiveCatalog.minClassButtonHeight >= 44, `class target too small at ${width}px`);
    assert.ok(
      responsiveCatalog.minOpenHeight >= 42,
      `open target was ${responsiveCatalog.minOpenHeight}px at ${width}px`,
    );
  }

  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.click('.archetype-row__open');
  await page.waitForSelector('.archetype-detail-page .archetype-trend');
  await page.waitForSelector('.archetype-deck-card .deck-tile');
  await page.waitForSelector('.constructed-matchup-ledger li');
  await page.waitForSelector('.constructed-card-stats tbody tr');
  assert.equal(await page.$eval('h1', heading => heading.textContent), 'Воровской Жрец');
  assert.equal(await page.$$eval('.archetype-trend', charts => charts.length), 3);
  assert.equal(await page.$$eval('.archetype-deck-card', cards => cards.length), 7);
  assert.equal(await page.$$eval('.archetype-deck-card .deck-tile', cards => cards.length), 56);
  const hsReplayDeckTile = await page.$eval('.archetype-deck-card .deck-tile__art', element => {
    const rect = element.getBoundingClientRect();
    const tile = element.closest('.deck-tile');
    const frame = element.closest('.hsrdv-card-frame');
    const gem = tile.querySelector('.hsrdv-card-gem');
    const fade = frame.querySelector('.hsrdv-card-fade');
    const root = tile.closest('.hsrdv');
    return {
      tagName: element.tagName,
      height: rect.height,
      width: rect.width,
      maxWidth: getComputedStyle(element).maxWidth,
      objectFit: getComputedStyle(element).objectFit,
      artRight: getComputedStyle(element).right,
      maskImage: getComputedStyle(element).maskImage,
      tileHeight: tile.getBoundingClientRect().height,
      rootWidth: root.getBoundingClientRect().width,
      gemWidth: gem.getBoundingClientRect().width,
      gemBackground: getComputedStyle(gem).backgroundColor,
      fadeBackground: getComputedStyle(fade).backgroundImage,
    };
  });
  assert.equal(hsReplayDeckTile.tagName, 'IMG');
  assert.equal(hsReplayDeckTile.tileHeight, 40);
  assert.ok(hsReplayDeckTile.rootWidth <= 486);
  assert.equal(hsReplayDeckTile.gemWidth, 40);
  assert.equal(hsReplayDeckTile.gemBackground, 'rgb(134, 96, 39)');
  assert.equal(hsReplayDeckTile.maxWidth, 'none');
  assert.equal(hsReplayDeckTile.objectFit, 'cover');
  assert.equal(hsReplayDeckTile.artRight, '27px');
  assert.equal(hsReplayDeckTile.maskImage, 'none');
  assert.match(hsReplayDeckTile.fadeBackground, /linear-gradient\(65deg/);
  const hsReplayCountBox = await page.$eval(
    '.archetype-deck-card .hsrdv-rarity-common + .hsrdv-card-frame .deck-tile__count',
    element => {
      const tile = element.closest('.deck-tile');
      const countBox = element.closest('.hsrdv-card-countbox');
      const countStyle = getComputedStyle(element);
      return {
        count: element.textContent,
        countColor: countStyle.color,
        countBackground: getComputedStyle(countBox).backgroundColor,
        countBorderLeft: getComputedStyle(countBox).borderLeft,
        tileTextShadow: getComputedStyle(tile).textShadow,
      };
    },
  );
  assert.equal(hsReplayCountBox.count, '2');
  assert.equal(hsReplayCountBox.countColor, 'rgb(247, 219, 72)');
  assert.equal(hsReplayCountBox.countBackground, 'rgb(49, 49, 49)');
  assert.equal(hsReplayCountBox.countBorderLeft, '1px solid rgb(0, 0, 0)');
  assert.match(hsReplayCountBox.tileTextShadow, /rgb\(0, 0, 0\)/);
  const exactDeckList = await page.$eval('.archetype-deck-card .deck-list-view', element => {
    const list = element.querySelector('.deck-list-view__list');
    const tile = element.querySelector('.deck-tile');
    const secondRow = list.children[1];
    const card = element.closest('.archetype-deck-card');
    return {
      listDisplay: getComputedStyle(list).display,
      secondRowMarginTop: getComputedStyle(secondRow).marginTop,
      tileHeight: tile.getBoundingClientRect().height,
      summaryHeight: card.querySelector('.archetype-deck-card__summary').getBoundingClientRect().height,
      deckHeaderHeight: element.querySelector('.deck-list-view__head').getBoundingClientRect().height,
      hsReplayRoot: Boolean(list.closest('.hsrdv')),
    };
  });
  assert.equal(exactDeckList.listDisplay, 'block');
  assert.equal(exactDeckList.secondRowMarginTop, '1px');
  assert.equal(exactDeckList.tileHeight, 40);
  assert.equal(exactDeckList.summaryHeight, 52);
  assert.equal(exactDeckList.deckHeaderHeight, 46);
  assert.equal(exactDeckList.hsReplayRoot, true);
  assert.equal(await page.$$eval('.constructed-matchup-ledger li', rows => rows.length), 11);
  assert.equal(await page.$$eval('.constructed-card-stats tbody tr', rows => rows.length), 15);
  for (const tourTarget of [
    'archetype-summary',
    'archetype-main-build',
    'archetype-analysis',
    'archetype-history',
    'archetype-other-builds',
  ]) {
    assert.ok(await page.$(`[data-tour-id="${tourTarget}"]`), `missing ${tourTarget} tour anchor`);
  }
  assert.equal(
    await page.$eval('.archetype-dossier__art', image => new URL(image.src).pathname),
    '/api/public-resource/hsjson/v1/512x/JAIL_732.jpg',
  );
  assert.equal(await page.$$eval('.archetype-dossier .archetypes-eyebrow', nodes => nodes.length), 0);
  assert.equal(await page.$$eval('.archetype-dossier__identity p, .archetype-dossier__identity small', nodes => nodes.length), 0);
  assert.equal(
    await page.$eval('.constructed-card-stats tbody tr:first-child .constructed-card-tile strong', node => node.textContent),
    'Душа Бездны',
  );
  assert.equal(
    await page.$eval('.constructed-card-stats tbody tr:first-child .constructed-card-tile__mana', node => node.textContent),
    '1',
  );
  const desktopCardStats = await page.evaluate(() => {
    const scroll = document.querySelector('.constructed-card-stats__scroll');
    const table = scroll?.querySelector('table');
    const mana = table?.querySelector('.constructed-card-tile__mana');
    return {
      tableGap: Math.abs((scroll?.clientWidth ?? 0) - (table?.getBoundingClientRect().width ?? 0)),
      manaWidth: mana?.getBoundingClientRect().width ?? 0,
      manaHeight: mana?.getBoundingClientRect().height ?? 0,
      openBadges: table?.querySelectorAll('.constructed-card-tile__open').length ?? -1,
    };
  });
  assert.ok(desktopCardStats.tableGap <= 1, `desktop table left a ${desktopCardStats.tableGap}px gap`);
  assert.ok(desktopCardStats.manaWidth >= 24 && desktopCardStats.manaWidth <= 28);
  assert.ok(desktopCardStats.manaHeight >= 24 && desktopCardStats.manaHeight <= 28);
  assert.equal(desktopCardStats.openBadges, 0);
  assert.ok(await page.$('.archetype-deck-card__builder[href*="/deck-builder?"]'));
  assert.ok(await page.$('.archetype-main-build .deck-list-view'));
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__qaCopiedDeckCode = value; } },
    });
  });
  await page.click('.archetype-main-build .deck-list-view__copy-btn');
  await page.waitForFunction(() => document.querySelector('.archetype-main-build .deck-list-view__copy-btn')
    ?.getAttribute('aria-label') === 'Код колоды скопирован');
  assert.match(await page.evaluate(() => window.__qaCopiedDeckCode || ''), /^AA/);
  await page.click('.constructed-card-stats__more');
  await page.waitForFunction(() => document.querySelectorAll('.constructed-card-stats tbody tr').length === 18);
  await page.click('.archetype-builds__more');
  await page.waitForFunction(() => document.querySelectorAll('.archetype-deck-card').length === 13);
  await page.screenshot({ path: `${screenshotPrefix}-detail-desktop.png`, fullPage: true });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.goto(`${origin}/tests/fixtures/constructed-archetypes.html?format=wild`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-row');
  const catalogMobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    minFormatButtonHeight: Math.min(...[...document.querySelectorAll('.archetypes-format-switch button')].map(element => element.getBoundingClientRect().height)),
    minClassButtonHeight: Math.min(...[...document.querySelectorAll('.archetypes-class-filter button')].map(element => element.getBoundingClientRect().height)),
    minOpenHeight: Math.min(...[...document.querySelectorAll('.archetype-row__open')].map(element => element.getBoundingClientRect().height)),
  }));
  assert.ok(catalogMobile.overflow <= 1, `catalog overflowed by ${catalogMobile.overflow}px`);
  assert.ok(catalogMobile.minFormatButtonHeight >= 44);
  assert.ok(catalogMobile.minClassButtonHeight >= 44);
  assert.ok(catalogMobile.minOpenHeight >= 42);
  await page.screenshot({ path: `${screenshotPrefix}-mobile.png`, fullPage: true });

  await page.click('.archetype-row__open');
  await page.waitForSelector('.archetype-detail-page .archetype-trend');
  await page.waitForSelector('.archetype-deck-card .deck-tile');
  await page.waitForSelector('.constructed-matchup-ledger li');
  const detailMobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    chartCount: document.querySelectorAll('.archetype-trend').length,
    copyHeight: document.querySelector('.archetype-main-build .deck-list-view__copy-btn')?.getBoundingClientRect().height ?? 0,
    builderHeight: document.querySelector('.archetype-deck-card__builder')?.getBoundingClientRect().height ?? 0,
    deckTileHeight: document.querySelector('.archetype-deck-card .deck-tile')?.getBoundingClientRect().height ?? 0,
    deckGemWidth: document.querySelector('.archetype-deck-card .hsrdv-card-gem')?.getBoundingClientRect().width ?? 0,
    deckColumnCount: document.querySelectorAll('.archetype-deck-card').length,
    matchupCount: document.querySelectorAll('.constructed-matchup-ledger li').length,
  }));
  assert.ok(detailMobile.overflow <= 1, `detail overflowed by ${detailMobile.overflow}px`);
  assert.equal(detailMobile.chartCount, 3);
  assert.ok(detailMobile.copyHeight >= 42);
  assert.ok(detailMobile.builderHeight >= 44);
  assert.equal(detailMobile.deckTileHeight, 40);
  assert.equal(detailMobile.deckGemWidth, 40);
  assert.equal(detailMobile.deckColumnCount, 7);
  assert.equal(detailMobile.matchupCount, 11);
  const mobileCardStats = await page.evaluate(() => ({
    cardCount: document.querySelectorAll('.constructed-card-stats__cards > li').length,
    desktopTableDisplay: getComputedStyle(document.querySelector('.constructed-card-stats__scroll')).display,
    minTileHeight: Math.min(...[...document.querySelectorAll('.constructed-card-stats__cards .constructed-card-tile')].map(element => element.getBoundingClientRect().height)),
    minSortHeight: Math.min(...[...document.querySelectorAll('.constructed-card-stats__mobile-sort button')].map(element => element.getBoundingClientRect().height)),
  }));
  assert.equal(mobileCardStats.cardCount, 15);
  assert.equal(mobileCardStats.desktopTableDisplay, 'none');
  assert.ok(mobileCardStats.minTileHeight >= 44);
  assert.ok(mobileCardStats.minSortHeight >= 44);
  await page.click('.constructed-card-stats__cards .constructed-card-tile');
  await page.waitForSelector('.card-preview-sheet__panel');
  assert.equal(await page.$eval('.card-preview-sheet__header h2', node => node.textContent), 'Душа Бездны');
  await page.click('.card-preview-sheet__close');
  await page.waitForSelector('.card-preview-sheet__panel', { hidden: true });
  await page.screenshot({ path: `${screenshotPrefix}-detail-mobile.png`, fullPage: true });

  for (const width of [1024, 768, 375, 320, 1440]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const responsiveDetail = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      mobileCardsDisplay: getComputedStyle(document.querySelector('.constructed-card-stats__mobile')).display,
      tableDisplay: getComputedStyle(document.querySelector('.constructed-card-stats__scroll')).display,
    }));
    assert.ok(responsiveDetail.overflow <= 1, `detail overflowed by ${responsiveDetail.overflow}px at ${width}px`);
    if (width <= 820) {
      assert.notEqual(responsiveDetail.mobileCardsDisplay, 'none', `mobile cards hidden at ${width}px`);
      assert.equal(responsiveDetail.tableDisplay, 'none', `desktop table visible at ${width}px`);
    } else {
      assert.equal(responsiveDetail.mobileCardsDisplay, 'none', `mobile cards visible at ${width}px`);
      assert.notEqual(responsiveDetail.tableDisplay, 'none', `desktop table hidden at ${width}px`);
    }
  }

  await page.click('.archetype-breadcrumb a');
  await page.waitForSelector('.archetype-row');
  await page.$$eval('.archetype-row', rows => {
    rows
      .find(row => row.textContent?.includes('Охотник на демонов Бездны'))
      ?.querySelector('.archetype-row__open')
      ?.click();
  });
  await page.waitForSelector('.archetype-dossier__art');
  assert.equal(
    await page.$eval('.archetype-dossier__art', image => new URL(image.src).pathname),
    '/archetype-art/void-soul-dh.webp',
  );
  await page.screenshot({ path: `${screenshotPrefix}-detail-void-soul.png`, fullPage: true });

  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('.archetype-detail-page'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(violations, []);
  assert.deepEqual(runtimeErrors, []);
  console.log('Constructed archetype catalog/detail browser tests passed');
} finally {
  await browser?.close();
  await stopVite();
}
