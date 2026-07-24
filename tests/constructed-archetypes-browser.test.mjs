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
  assert.equal(await page.$eval('h1', heading => heading.textContent), 'Архетипы Hearthstone');
  assert.ok(await page.$('[data-tour-id="meta-controls"]'));
  assert.ok(await page.$('[data-tour-id="meta-search"]'));
  assert.ok(await page.$('[data-tour-id="meta-results"]'));
  await page.screenshot({ path: `${screenshotPrefix}-desktop.png`, fullPage: true });

  await page.click('.archetype-row__open');
  await page.waitForSelector('.archetype-detail-page .archetype-trend');
  await page.waitForSelector('.archetype-deck-card .deck-tile');
  await page.waitForSelector('.constructed-matchup-ledger li');
  await page.waitForSelector('.constructed-card-stats tbody tr');
  assert.equal(await page.$eval('h1', heading => heading.textContent), 'Воровской Жрец');
  assert.equal(await page.$$eval('.archetype-trend', charts => charts.length), 3);
  assert.equal(await page.$$eval('.archetype-deck-card', cards => cards.length), 7);
  assert.equal(await page.$$eval('.archetype-deck-card .deck-tile', cards => cards.length), 56);
  assert.equal(await page.$$eval('.constructed-matchup-ledger li', rows => rows.length), 11);
  assert.equal(await page.$$eval('.constructed-card-stats tbody tr', rows => rows.length), 15);
  assert.ok(await page.$('.archetype-deck-card__builder[href*="/deck-builder?"]'));
  assert.ok(await page.$('.archetype-main-build .deck-list-view'));
  await page.click('.constructed-card-stats__more');
  await page.waitForFunction(() => document.querySelectorAll('.constructed-card-stats tbody tr').length === 18);
  await page.click('.archetype-builds__more');
  await page.waitForFunction(() => document.querySelectorAll('.archetype-deck-card').length === 13);
  await page.screenshot({ path: `${screenshotPrefix}-detail-desktop.png`, fullPage: true });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-row');
  const catalogMobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    minFormatButtonHeight: Math.min(...[...document.querySelectorAll('.archetypes-format-switch button')].map(element => element.getBoundingClientRect().height)),
    minOpenHeight: Math.min(...[...document.querySelectorAll('.archetype-row__open')].map(element => element.getBoundingClientRect().height)),
  }));
  assert.ok(catalogMobile.overflow <= 1, `catalog overflowed by ${catalogMobile.overflow}px`);
  assert.ok(catalogMobile.minFormatButtonHeight >= 44);
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
    deckColumnCount: document.querySelectorAll('.archetype-deck-card').length,
    matchupCount: document.querySelectorAll('.constructed-matchup-ledger li').length,
  }));
  assert.ok(detailMobile.overflow <= 1, `detail overflowed by ${detailMobile.overflow}px`);
  assert.equal(detailMobile.chartCount, 3);
  assert.ok(detailMobile.copyHeight >= 42);
  assert.ok(detailMobile.builderHeight >= 44);
  assert.equal(detailMobile.deckColumnCount, 7);
  assert.equal(detailMobile.matchupCount, 11);
  await page.screenshot({ path: `${screenshotPrefix}-detail-mobile.png`, fullPage: true });

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
