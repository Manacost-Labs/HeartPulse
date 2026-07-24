import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { stripVTControlCharacters } from 'node:util';
import puppeteer from 'puppeteer';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const screenshotPrefix = `/tmp/manacost-admin-archetype-${process.pid}`;
const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for archetype detail browser tests');

const vitePort = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close();
      reject(new Error('Could not reserve a browser-test port'));
      return;
    }
    probe.close(error => error ? reject(error) : resolve(address.port));
  });
});

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
  page.on('pageerror', error => runtimeErrors.push(error.message));

  await page.setViewport({ width: 1440, height: 1050, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/archetypes-detail.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-mulligan-table');

  assert.equal(await page.$eval('h1', heading => heading.textContent), 'Берн Маг');
  assert.equal(await page.$$eval('.archetype-mulligan-table tbody tr', rows => rows.length), 8);
  assert.equal(await page.$$eval('.archetype-matchup-row', rows => rows.length), 6);
  assert.equal(await page.$$eval('.archetype-matchup-matrix', rows => rows.length), 0);
  assert.equal(await page.$$eval('.archetype-deck-card', rows => rows.length), 3);
  assert.equal(await page.$$eval('.archetype-deck-folio__action-copy', rows => rows.length), 0);
  assert.equal(
    await page.$$eval('.archetype-matchup-row > img', images => images.every(image => image.complete && image.naturalWidth > 0)),
    true,
    'class icons should resolve to real lowercase asset paths',
  );
  const matchupRows = await page.$$eval('.archetype-matchup-row', rows => rows.map(row => {
    const box = row.getBoundingClientRect();
    return { top: Math.round(box.top), left: Math.round(box.left), width: Math.round(box.width) };
  }));
  assert.equal(new Set(matchupRows.map(row => row.top)).size, 6, 'each matchup should occupy its own row');
  assert.equal(new Set(matchupRows.map(row => row.left)).size, 1, 'matchup rows should share one left edge');
  assert.ok(matchupRows.every(row => row.width === matchupRows[0].width), 'matchup rows should share one full width');

  const desktopDeckRows = await page.$$eval('.archetype-deck-card', cards => (
    new Set(cards.map(card => Math.round(card.getBoundingClientRect().top))).size
  ));
  assert.equal(desktopDeckRows, 1, 'the first three builds should share one desktop row');

  const averageTurnSort = '[data-mulligan-sort="avg_turn_played_on"]';
  await page.click(averageTurnSort);
  assert.equal(
    await page.$eval('.archetype-mulligan-table tbody tr:first-child .archetype-mulligan-card strong', node => node.textContent),
    'Чародейский интеллект',
  );
  assert.equal(await page.$eval(averageTurnSort, button => button.closest('th')?.getAttribute('aria-sort')), 'ascending');
  await page.click(averageTurnSort);
  assert.equal(
    await page.$eval('.archetype-mulligan-table tbody tr:first-child .archetype-mulligan-card strong', node => node.textContent),
    'Ледяная стрела',
  );
  assert.equal(await page.$eval(averageTurnSort, button => button.closest('th')?.getAttribute('aria-sort')), 'descending');

  await page.hover('.archetype-mulligan-card');
  await page.waitForSelector('.card-preview-tooltip');
  assert.equal(await page.$eval('.card-preview-tooltip', node => node.getAttribute('data-card-preview-id')), 'CORE_CS2_024');
  await page.mouse.move(0, 0);
  await page.waitForSelector('.card-preview-tooltip', { hidden: true });

  await page.hover('.archetype-deck-card .deck-tile');
  await page.waitForSelector('.card-preview-tooltip');
  assert.ok(await page.$eval('.card-preview-tooltip', node => Boolean(node.getAttribute('data-card-preview-id'))));
  await page.mouse.move(0, 0);
  await page.waitForSelector('.card-preview-tooltip', { hidden: true });

  const builderHref = await page.$eval('.archetype-builder-link', link => link.getAttribute('href'));
  assert.match(builderHref || '', /^\/deck-builder\?code=/);
  assert.ok(new URL(builderHref, origin).searchParams.get('code')?.length > 20);

  await page.click('.archetype-analysis-panel__more');
  assert.equal(await page.$$eval('.archetype-deck-card', rows => rows.length), 5);
  await page.screenshot({ path: `${screenshotPrefix}-detail-desktop.png`, fullPage: true });

  await page.addScriptTag({ path: axePath });
  const desktopViolations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('.archetypes-page'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(desktopViolations, []);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-mulligan-table');
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    minMulliganTarget: Math.min(...[...document.querySelectorAll('.archetype-mulligan-card')].map(element => element.getBoundingClientRect().height)),
    minSortTarget: Math.min(...[...document.querySelectorAll('[data-mulligan-sort]')].map(element => element.getBoundingClientRect().height)),
    builderTarget: document.querySelector('.archetype-builder-link')?.getBoundingClientRect().height || 0,
    matchupRows: document.querySelectorAll('.archetype-matchup-row').length,
  }));
  assert.ok(mobile.overflow <= 1, `mobile detail overflowed by ${mobile.overflow}px`);
  assert.ok(mobile.minMulliganTarget >= 44);
  assert.ok(mobile.minSortTarget >= 44);
  assert.ok(mobile.builderTarget >= 44);
  assert.equal(mobile.matchupRows, 6);
  await page.screenshot({ path: `${screenshotPrefix}-detail-mobile.png`, fullPage: true });

  await page.setViewport({ width: 1440, height: 1050, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/archetypes-detail.html?catalog=1`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetypes-class');
  const headerCopy = await page.$$eval('.archetypes-hero__description p', paragraphs => (
    paragraphs.map(paragraph => paragraph.textContent?.replace(/\s+/g, ' ').trim())
  ));
  assert.deepEqual(headerCopy, [
    'В этом разделе вы найдете все архетипы, представленные на HSReplay, а также все сборки этих архетипов, динамику их популярности и процента побед.',
    'Кроме того, здесь доступна подробная аналитика по муллигану, включая платные данные, которые есть только у пользователей с подпиской HSReplay.',
  ]);
  assert.equal(await page.$$eval('.archetypes-row__stats', rows => rows.some(row => row.textContent?.includes('—'))), false);
  await page.screenshot({ path: `${screenshotPrefix}-catalog-desktop.png`, fullPage: true });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.reload({ waitUntil: 'networkidle0' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1));
  await page.screenshot({ path: `${screenshotPrefix}-catalog-mobile.png`, fullPage: true });

  const code = new URL(builderHref, origin).searchParams.get('code');
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/deck-builder-autoload.html?code=${encodeURIComponent(code)}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.deck-builder--workspace');
  assert.equal(await page.$eval('#deck-builder-workspace-title', heading => heading.textContent), 'Маг на элементалях');
  assert.equal(await page.$$eval('.deck-builder__deck .deck-tile', cards => cards.length), 3);

  assert.deepEqual(runtimeErrors, []);
  console.log('Archetype detail browser tests passed');
} finally {
  await browser?.close();
  await stopVite();
}
