import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { stripVTControlCharacters } from 'node:util';
import puppeteer from 'puppeteer';

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
  const consoleErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', entry => {
    if (entry.type() === 'error') consoleErrors.push(entry.text());
  });

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/soft-paywall.html?page=meta`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.arena-inline-paywall--meta');
  assert.equal(await page.$$eval('.standard-meta-card', cards => cards.length), 3);
  assert.equal(await page.$$eval('.arena-paywall__overlay', nodes => nodes.length), 0);
  assert.equal(
    await page.$eval('.arena-inline-paywall__primary span', node => node.textContent),
    'Открыть всю мету',
  );
  assert.ok(await page.$('.standard-meta__controls'));
  assert.ok(await page.$('.standard-meta-chart'));
  await page.click('.standard-meta__segmented button:nth-child(2)');
  await page.waitForFunction(() => [...document.querySelectorAll('.standard-meta__masthead-stats strong')]
    .some(node => node.textContent === 'Вольный'));
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
  assert.equal(await page.$$eval('.arena-paywall__overlay', nodes => nodes.length), 0);
  assert.equal(
    await page.$eval('.arena-inline-paywall__primary span', node => node.textContent),
    'Открыть все фан-колоды',
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
    document.querySelector('.fun-deck-card__identity span')?.textContent === 'Вольный формат'
  ));
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(await page.$$eval('.fun-deck-card', cards => cards.length), 3);
  await page.addScriptTag({ path: axePath });
  const funDeckViolations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('#root'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(funDeckViolations, []);
  await page.screenshot({ path: `${screenshotPrefix}-fun-decks-desktop.png`, fullPage: true });

  for (const width of [390, 320]) {
    await page.setViewport({ width, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.arena-inline-paywall--meta');
    await page.waitForSelector('[data-tour-id="fun-decks-deck-list"] .deck-list-view');
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      primaryHeight: document.querySelector('.arena-inline-paywall__primary')?.getBoundingClientRect().height ?? 0,
      cardCount: document.querySelectorAll('.fun-deck-card').length,
    }));
    assert.ok(layout.overflow <= 1, `fun deck teaser overflowed by ${layout.overflow}px at ${width}px`);
    assert.ok(layout.primaryHeight >= 48);
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
