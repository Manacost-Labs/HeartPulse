import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { stripVTControlCharacters } from 'node:util';
import puppeteer from 'puppeteer';
import { reserveLocalPort } from './fixtures/reserve-local-port.mjs';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const screenshotPrefix = `/tmp/manacost-soft-paywall-${process.pid}`;
const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for soft paywall browser tests');

const vitePort = await reserveLocalPort();

const vite = spawn('./node_modules/.bin/vite', [
  '--config', 'tests/fixtures/vite.modal.config.ts',
  '--host', '127.0.0.1',
  '--port', String(vitePort),
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
  const consoleErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', entry => {
    if (entry.type() === 'error') consoleErrors.push(entry.text());
  });

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/soft-paywall.html?page=meta`, { waitUntil: 'networkidle0' });
  try {
    await page.waitForSelector('.arena-inline-paywall--meta', { timeout: 60_000 });
  } catch (error) {
    throw new Error(
      `soft paywall did not render; page errors=${JSON.stringify(runtimeErrors)} console errors=${JSON.stringify(consoleErrors)}`,
      { cause: error },
    );
  }
  assert.equal(await page.$$eval('.standard-meta-card', cards => cards.length), 3);
  assert.equal(await page.$$eval('.arena-paywall__overlay', nodes => nodes.length), 0);
  assert.equal(
    await page.$eval('.arena-inline-paywall__primary span', node => node.textContent),
    'Открыть всю мету',
  );
  assert.ok(await page.$('.standard-meta__controls'));
  assert.ok(await page.$('.standard-meta-chart'));
  await page.click('.standard-meta__segmented button:nth-child(2)');
  await page.waitForFunction(() => (
    document.querySelector('.standard-meta__segmented button:nth-child(2)')
      ?.getAttribute('aria-pressed') === 'true'
  ));
  await page.screenshot({ path: `${screenshotPrefix}-meta-desktop.png`, fullPage: true });

  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.arena-inline-paywall--meta');
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      primaryHeight: document.querySelector('.arena-inline-paywall__primary')?.getBoundingClientRect().height ?? 0,
      cardCount: document.querySelectorAll('.standard-meta-card').length,
    }));
    assert.ok(layout.overflow <= 1, `meta teaser overflowed by ${layout.overflow}px at ${width}px`);
    assert.ok(layout.primaryHeight >= 48);
    assert.equal(layout.cardCount, 3);
  }
  await page.screenshot({ path: `${screenshotPrefix}-meta-mobile.png`, fullPage: true });

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/soft-paywall.html?page=fun-decks`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.arena-inline-paywall--meta');
  await page.waitForSelector('[data-tour-id="fun-decks-deck-list"] .deck-list-view');
  assert.equal(await page.$$eval('.fun-deck-card', cards => cards.length), 3);
  assert.equal(
    await page.$eval('.fun-decks-grid', grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length),
    3,
    'desktop fun-decks must show three decks per row',
  );
  assert.equal(await page.$$eval('.fun-deck-card .deck-list-view__expand', buttons => buttons.length), 0);
  assert.equal(await page.$$eval('.fun-deck-card:first-child .deck-list-view__body > .deck-list-view__hsreplay > .deck-list-view__list > li', rows => rows.length), 17);
  assert.equal(await page.$$eval('.fun-deck-card:first-child .deck-list-view__sideboard li', rows => rows.length), 3);
  assert.equal(await page.$eval('.fun-deck-card__identity h2', node => node.textContent), 'Фановая колода 6');
  assert.equal(await page.$eval('.fun-decks-tools__sort select', node => node.value), 'newest');
  assert.equal(await page.$eval('.fun-deck-card__identity span strong', node => node.textContent), 'Новая');
  assert.equal(
    await page.$eval('.fun-decks-freshness time', node => node.getAttribute('datetime')),
    '2026-07-26T10:15:12.000Z',
  );
  assert.equal(await page.$$eval('.arena-paywall__overlay', nodes => nodes.length), 0);
  assert.deepEqual(
    await page.$$eval('.arena-inline-paywall__provider', nodes => nodes.map(node => ({
      text: node.textContent?.replace(/\s+/g, ' ').trim(),
      href: node.getAttribute('href'),
    }))),
    [
      {
        text: 'BBoostyОткрыть через Boosty',
        href: 'https://boosty.to/kolodahearthstone',
      },
      {
        text: 'TelegramОткрыть через Telegram',
        href: 'https://web.tribute.tg/s/xz9',
      },
    ],
  );
  for (const anchor of [
    'fun-decks-method',
    'fun-decks-filters',
    'fun-decks-card-metrics',
    'fun-decks-deck-list',
  ]) {
    assert.ok(await page.$(`[data-tour-id="${anchor}"]`), `missing tour anchor ${anchor}`);
  }
  await page.click('.fun-decks-tools__formats button:nth-child(3)');
  await page.waitForFunction(() => (
    document.querySelector('.fun-deck-card__identity span')?.textContent?.startsWith('Вольный формат')
  ));
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(await page.$$eval('.fun-deck-card', cards => cards.length), 3);
  await page.select('.fun-decks-tools__sort select', 'fun');
  await page.waitForFunction(() => document.querySelector('.fun-deck-card__identity h2')?.textContent === 'Фановая колода 4');
  await page.addScriptTag({ path: axePath });
  const funDeckViolations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('#root'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(funDeckViolations, []);
  await page.screenshot({ path: `${screenshotPrefix}-fun-decks-desktop.png`, fullPage: true });

  await page.setViewport({ width: 1920, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/soft-paywall.html?page=fun-decks&access=full`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.fun-decks-grid .fun-deck-card:nth-child(6)');
  const wideFunDecks = await page.evaluate(() => ({
    cardCount: document.querySelectorAll('.fun-deck-card').length,
    columns: getComputedStyle(document.querySelector('.fun-decks-grid')).gridTemplateColumns.split(' ').length,
    minCardWidth: Math.min(...[...document.querySelectorAll('.fun-deck-card')]
      .map(node => node.getBoundingClientRect().width)),
    expandButtons: document.querySelectorAll('.fun-deck-card .deck-list-view__expand').length,
    mainRows: document.querySelectorAll('.fun-deck-card:first-child .deck-list-view__body > .deck-list-view__hsreplay > .deck-list-view__list > li').length,
    sideboardRows: document.querySelectorAll('.fun-deck-card:first-child .deck-list-view__sideboard li').length,
    tileHeight: document.querySelector('.fun-deck-card .hsrdv-card-tile')?.getBoundingClientRect().height ?? 0,
    artCoverage: (() => {
      const art = document.querySelector('.fun-deck-card .hsrdv-card-art');
      const frame = document.querySelector('.fun-deck-card .hsrdv-card-frame');
      if (!art || !frame) return 0;
      return art.getBoundingClientRect().width / frame.getBoundingClientRect().width;
    })(),
    cardHeight: document.querySelector('.fun-deck-card')?.getBoundingClientRect().height ?? 0,
  }));
  assert.equal(wideFunDecks.cardCount, 6);
  assert.equal(wideFunDecks.columns, 3);
  assert.ok(wideFunDecks.minCardWidth >= 420, `wide fun deck card was only ${wideFunDecks.minCardWidth}px`);
  assert.equal(wideFunDecks.expandButtons, 0);
  assert.equal(wideFunDecks.mainRows, 17);
  assert.equal(wideFunDecks.sideboardRows, 3);
  assert.ok(wideFunDecks.tileHeight <= 26, `compact fun deck row was ${wideFunDecks.tileHeight}px tall`);
  assert.ok(wideFunDecks.artCoverage >= 0.889, `compact art covered only ${wideFunDecks.artCoverage * 100}% of its frame`);
  assert.ok(wideFunDecks.cardHeight <= 820, `compact full fun deck was ${wideFunDecks.cardHeight}px tall`);
  await page.screenshot({ path: `${screenshotPrefix}-fun-decks-wide.png`, fullPage: true });

  await page.goto(`${origin}/tests/fixtures/soft-paywall.html?page=fun-decks&access=full&render=ready`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.fun-deck-card .deck-render-preview[data-render-state="ready"]');
  assert.equal(
    await page.$$eval('.fun-deck-card__copy', buttons => buttons.filter(button => {
      const style = getComputedStyle(button);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).length),
    6,
    'every rendered fun deck must keep a visible copy-code action',
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async value => { window.__copiedFunDeckCode = value; },
      },
    });
  });
  await page.click('.fun-deck-card__copy');
  await page.waitForFunction(() => document.querySelector('.fun-deck-card__copy')?.textContent?.includes('Код скопирован'));
  assert.ok(
    await page.evaluate(() => typeof window.__copiedFunDeckCode === 'string' && window.__copiedFunDeckCode.length > 20),
    'the fun-deck copy action must write the full deck code',
  );
  await page.screenshot({ path: `${screenshotPrefix}-fun-decks-rendered.png`, fullPage: true });

  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.fun-deck-card .deck-render-preview[data-render-state="ready"]');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
    });
    document.execCommand = command => {
      if (command !== 'copy') return false;
      window.__fallbackCopiedFunDeckCode = document.activeElement?.value;
      return true;
    };
  });
  await page.click('.fun-deck-card__copy');
  await page.waitForFunction(() => document.querySelector('.fun-deck-card__copy')?.textContent?.includes('Код скопирован'));
  assert.ok(
    await page.evaluate(() => typeof window.__fallbackCopiedFunDeckCode === 'string' && window.__fallbackCopiedFunDeckCode.length > 20),
    'the fun-deck copy action must fall back when Clipboard API writes are denied',
  );

  await page.setViewport({ width: 1024, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/soft-paywall.html?page=fun-decks&access=full`, { waitUntil: 'networkidle0' });
  assert.equal(
    await page.$eval('.fun-decks-grid', grid => getComputedStyle(grid).gridTemplateColumns.split(' ').length),
    2,
    'tablet fun-decks must use two columns',
  );
  await page.screenshot({ path: `${screenshotPrefix}-fun-decks-tablet.png`, fullPage: true });

  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await page.goto(`${origin}/tests/fixtures/soft-paywall.html?page=fun-decks`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.arena-inline-paywall--meta');
    await page.waitForSelector('[data-tour-id="fun-decks-deck-list"] .deck-list-view');
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      providerHeights: [...document.querySelectorAll('.arena-inline-paywall__provider')]
        .map(node => node.getBoundingClientRect().height),
      cardCount: document.querySelectorAll('.fun-deck-card').length,
    }));
    assert.ok(layout.overflow <= 1, `fun deck teaser overflowed by ${layout.overflow}px at ${width}px`);
    assert.equal(layout.providerHeights.length, 2);
    assert.ok(layout.providerHeights.every(height => height >= 48));
    assert.equal(layout.cardCount, 3);
  }
  await page.screenshot({ path: `${screenshotPrefix}-fun-decks-mobile.png`, fullPage: true });

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/soft-paywall.html?page=archetype`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.arena-inline-paywall--archetype');
  assert.equal(await page.$eval('h1', node => node.textContent), 'Охотник на демонов Бездны');
  assert.equal(await page.$$eval('.archetype-deck-card', nodes => nodes.length), 0);
  assert.equal(await page.$$eval('.constructed-card-stats', nodes => nodes.length), 0);
  assert.equal(await page.$$eval('.archetype-history', nodes => nodes.length), 0);
  assert.equal(await page.$$eval('.archetype-build-preview', nodes => nodes.length), 1);
  assert.equal(
    await page.$eval('.arena-inline-paywall__primary span', node => node.textContent),
    'Открыть статистику архетипа',
  );
  assert.equal(
    await page.$eval('.arena-inline-paywall__account-link', node => node.getAttribute('href')),
    '/?login',
  );
  await page.screenshot({ path: `${screenshotPrefix}-archetype-desktop.png`, fullPage: true });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.arena-inline-paywall--archetype');
  const detailLayout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    primaryHeight: document.querySelector('.arena-inline-paywall__primary')?.getBoundingClientRect().height ?? 0,
    metricCount: document.querySelectorAll('.archetype-dossier__metrics > div').length,
  }));
  assert.ok(detailLayout.overflow <= 1, `archetype teaser overflowed by ${detailLayout.overflow}px`);
  assert.ok(detailLayout.primaryHeight >= 48);
  assert.equal(detailLayout.metricCount, 6);
  await page.screenshot({ path: `${screenshotPrefix}-archetype-mobile.png`, fullPage: true });

  await page.goto(`${origin}/tests/fixtures/soft-paywall.html?page=catalog`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-row');
  assert.equal(await page.$$eval('.archetype-row', nodes => nodes.length), 4);
  assert.equal(await page.$$eval('.arena-inline-paywall', nodes => nodes.length), 0);

  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('#root'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(violations, []);
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(consoleErrors, []);
  console.log(`Soft paywall browser QA passed; screenshots: ${screenshotPrefix}-*.png`);
} finally {
  await browser?.close();
  await stopVite();
}
