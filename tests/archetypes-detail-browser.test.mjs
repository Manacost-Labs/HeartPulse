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
  assert.equal(
    await page.$$eval(
      '.archetype-matchup-row__identity span',
      captions => captions.some(caption => caption.textContent?.replace(/\s+/g, ' ').trim() === '0 игр'),
    ),
    false,
    'an unavailable HSGuru matchup sample must not be presented as zero games',
  );
  assert.equal(
    await page.$eval('.archetype-matchup-row:first-child .archetype-matchup-row__identity', identity => identity.querySelector('span')),
    null,
    'the games caption must be omitted when HSGuru does not publish a matchup sample',
  );
  const matchupRows = await page.$$eval('.archetype-matchup-row', rows => rows.map(row => {
    const box = row.getBoundingClientRect();
    return { top: Math.round(box.top), left: Math.round(box.left), width: Math.round(box.width) };
  }));
  assert.equal(new Set(matchupRows.map(row => row.top)).size, 2, 'six matchups should occupy two compact desktop rows');
  assert.equal(new Set(matchupRows.map(row => row.left)).size, 3, 'desktop matchups should form three tile columns');
  assert.ok(matchupRows.every(row => Math.abs(row.width - matchupRows[0].width) <= 1), 'matchup tiles should share one width');

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

  await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-matchup-row');
  const tabletMatchups = await page.$$eval('.archetype-matchup-row', rows => rows.map(row => {
    const box = row.getBoundingClientRect();
    return { top: Math.round(box.top), left: Math.round(box.left) };
  }));
  assert.equal(new Set(tabletMatchups.map(row => row.top)).size, 3, 'tablet matchups should occupy three compact rows');
  assert.equal(new Set(tabletMatchups.map(row => row.left)).size, 2, 'tablet matchups should form two tile columns');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-mulligan-table');
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    minMulliganTarget: Math.min(...[...document.querySelectorAll('.archetype-mulligan-card')].map(element => element.getBoundingClientRect().height)),
    minSortTarget: Math.min(...[...document.querySelectorAll('[data-mulligan-sort]')].map(element => element.getBoundingClientRect().height)),
    builderTarget: document.querySelector('.archetype-builder-link')?.getBoundingClientRect().height || 0,
    matchupRows: document.querySelectorAll('.archetype-matchup-row').length,
    matchupTopPositions: [...document.querySelectorAll('.archetype-matchup-row')]
      .map(element => Math.round(element.getBoundingClientRect().top)),
  }));
  assert.ok(mobile.overflow <= 1, `mobile detail overflowed by ${mobile.overflow}px`);
  assert.ok(mobile.minMulliganTarget >= 44);
  assert.ok(mobile.minSortTarget >= 44);
  assert.ok(mobile.builderTarget >= 44);
  assert.equal(mobile.matchupRows, 6);
  assert.equal(new Set(mobile.matchupTopPositions).size, 6, 'mobile matchups should stack as one tile per row');
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

  await page.setViewport({ width: 320, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.deck-builder--workspace');
  await page.click('.deck-builder__advanced-toggle');
  const builderMobile = await page.evaluate(() => {
    const visibleControls = [...document.querySelectorAll('.deck-builder button, .deck-builder input, .deck-builder select')]
      .filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      offscreenControls: visibleControls.filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.left < -1 || rect.right > innerWidth + 1;
      }).length,
      minTarget: Math.min(...visibleControls.map(element => element.getBoundingClientRect().height)),
      deckVisible: getComputedStyle(document.querySelector('.deck-builder__deck')).display !== 'none',
      catalogVisible: getComputedStyle(document.querySelector('.deck-builder__catalog')).display !== 'none',
    };
  });
  assert.ok(builderMobile.overflow <= 1, `mobile deck builder overflowed by ${builderMobile.overflow}px`);
  assert.equal(builderMobile.offscreenControls, 0, 'mobile deck-builder controls must stay inside the viewport');
  assert.ok(builderMobile.minTarget >= 44, `mobile deck-builder target is only ${builderMobile.minTarget}px high`);
  assert.equal(builderMobile.deckVisible, false);
  assert.equal(builderMobile.catalogVisible, true);

  await page.click('.deck-builder__mobile-tabs button:nth-child(2)');
  assert.equal(
    await page.$eval('.deck-builder__deck', element => getComputedStyle(element).display !== 'none'),
    true,
  );
  assert.ok(await page.$$eval(
    '.deck-tile__controls button',
    buttons => buttons.every(button => button.getBoundingClientRect().height >= 44),
  ));

  await page.click('.deck-builder__workspace-header > .deck-builder__ghost-btn');
  await page.waitForSelector('.deck-builder__class-grid');
  assert.equal(await page.$$eval('.deck-builder__class-card', cards => cards.length), 11);
  assert.equal(await page.$$eval('.deck-builder__format-picker button', buttons => buttons.length), 2);
  assert.ok(
    await page.evaluate(() => document.body.scrollHeight < 2_200),
    'mobile builder landing must not be a four-thousand-pixel list of repeated format buttons',
  );

  await page.click('.deck-builder__class-card[aria-label^="Маг:"]');
  await page.waitForSelector('.deck-builder__gallery .deck-builder__card');
  await page.click('.deck-builder__gallery .deck-builder__card');
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(await page.$eval('.deck-builder__deck-counter strong', node => node.textContent), '1');
  await page.goto(`${origin}/tests/fixtures/deck-builder-autoload.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.deck-builder--workspace');
  assert.equal(
    await page.$eval('.deck-builder__deck-counter strong', node => node.textContent),
    '1',
    'the saved draft must survive a reload',
  );

  await page.addScriptTag({ path: axePath });
  const builderViolations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('.deck-builder'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(builderViolations, []);

  assert.deepEqual(runtimeErrors, []);
  console.log('Archetype detail browser tests passed');
} finally {
  await browser?.close();
  await stopVite();
}
