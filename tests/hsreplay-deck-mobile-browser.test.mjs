import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { stripVTControlCharacters } from 'node:util';
import puppeteer from 'puppeteer';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for DeckView mobile tests');

const vitePort = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close();
      reject(new Error('Could not reserve a DeckView browser-test port'));
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

async function waitForDeck(page, expectedCards) {
  await page.waitForSelector('[data-deck-render-state="ready"] .hsrdv-card-tile');
  await page.waitForFunction(expected => (
    document.querySelectorAll('.hsrdv-card-tile').length === expected
    && document.querySelectorAll('[data-card-preview-trigger]').length === expected
  ), {}, expectedCards);
}

async function assertMobileDeck(page, originUrl, width, size) {
  await page.setViewport({ width, height: 720, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.goto(`${originUrl}/tests/fixtures/hsreplay-deck-mobile.html?size=${size}`, { waitUntil: 'networkidle0' });
  await waitForDeck(page, size);

  const geometry = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.hsrdv-card-tile')];
    const last = tiles.at(-1);
    last?.scrollIntoView({ block: 'center' });
    return {
      count: tiles.length,
      minHeight: Math.min(...tiles.map(tile => tile.getBoundingClientRect().height)),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      lastVisible: last instanceof HTMLElement
        && last.getBoundingClientRect().top >= 0
        && last.getBoundingClientRect().bottom <= window.innerHeight,
      lastId: last instanceof HTMLElement ? last.dataset.cardId : null,
    };
  });
  assert.equal(geometry.count, size);
  assert.ok(geometry.minHeight >= 44, `${width}px rows must be at least 44px: ${geometry.minHeight}`);
  assert.ok(geometry.pageOverflow <= 1, `${width}px page overflowed by ${geometry.pageOverflow}px`);
  assert.equal(geometry.lastVisible, true, `${width}px last card must be scrollable into view`);
  assert.match(geometry.lastId || '', /^MOBILE_TEST_\d{2}$/);

  await page.evaluate(() => document.querySelector('.hsrdv-card-tile')?.scrollIntoView({ block: 'center' }));
  const firstTile = await page.$eval('.hsrdv-card-tile', tile => {
    const rect = tile.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      id: tile.getAttribute('data-card-id'),
      name: tile.querySelector('.hsrdv-card-art')?.getAttribute('alt'),
    };
  });
  await page.touchscreen.tap(firstTile.x, firstTile.y);
  await page.waitForSelector('.card-preview-sheet');
  const opened = await page.evaluate(() => {
    const sheet = document.querySelector('.card-preview-sheet');
    const panel = document.querySelector('.card-preview-sheet__panel');
    const close = document.querySelector('.card-preview-sheet__close');
    const image = document.querySelector('.card-preview-sheet img');
    const viewport = window.visualViewport;
    const panelRect = panel?.getBoundingClientRect();
    return {
      role: sheet?.getAttribute('role'),
      modal: sheet?.getAttribute('aria-modal'),
      imageAlt: image?.getAttribute('alt'),
      activeLabel: document.activeElement?.getAttribute('aria-label'),
      closeHeight: close?.getBoundingClientRect().height || 0,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelInsideViewport: Boolean(panelRect && viewport
        && panelRect.left >= viewport.offsetLeft - 1
        && panelRect.right <= viewport.offsetLeft + viewport.width + 1
        && panelRect.top >= viewport.offsetTop - 1
        && panelRect.bottom <= viewport.offsetTop + viewport.height + 1),
    };
  });
  assert.deepEqual({ role: opened.role, modal: opened.modal }, { role: 'dialog', modal: 'true' });
  assert.equal(opened.imageAlt, firstTile.name);
  assert.equal(opened.activeLabel, 'Закрыть полную карту');
  assert.ok(opened.closeHeight >= 44);
  assert.ok(opened.pageOverflow <= 1);
  assert.equal(opened.panelInsideViewport, true);

  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('.card-preview-sheet'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(violations, []);

  await page.keyboard.press('Escape');
  await page.waitForSelector('.card-preview-sheet', { hidden: true });
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('data-card-id')),
    firstTile.id,
    'Escape must restore focus to the tapped row',
  );

  await page.keyboard.press('Tab');
  const secondName = await page.evaluate(() => document.activeElement?.querySelector('.hsrdv-card-art')?.getAttribute('alt'));
  await page.keyboard.press('Enter');
  await page.waitForSelector('.card-preview-sheet');
  assert.equal(await page.$eval('.card-preview-sheet img', image => image.getAttribute('alt')), secondName);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.card-preview-sheet', { hidden: true });
  await page.keyboard.press('Space');
  await page.waitForSelector('.card-preview-sheet');
  await page.click('.card-preview-sheet__close');
  await page.waitForSelector('.card-preview-sheet', { hidden: true });
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

  for (const width of [320, 390, 430, 768]) {
    await assertMobileDeck(page, origin, width, width === 430 ? 40 : 30);
  }

  await page.setViewport({ width: 390, height: 720, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.goto(`${origin}/tests/fixtures/hsreplay-deck-mobile.html?size=30&controllerChunk=retry`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-deck-render-state="ready"] .hsrdv-card-tile');
  await page.waitForSelector('[data-deck-preview-controller-state="error"]');
  assert.equal(await page.$$eval('.hsrdv-card-tile', tiles => tiles.length), 30);
  assert.equal(await page.$eval('.traditional-deck-list', element => element.dataset.deckRenderState), 'ready');
  await page.click('[data-deck-preview-controller-state="error"] .recoverable-surface__action');
  await page.waitForFunction(() => document.querySelectorAll('[data-card-preview-trigger]').length === 30);
  assert.equal(await page.$('[data-deck-preview-controller-state="error"]'), null);

  await page.goto(`${origin}/tests/fixtures/hsreplay-deck-mobile.html?size=30&previewChunk=retry`, { waitUntil: 'networkidle0' });
  await waitForDeck(page, 30);
  await page.click('[data-card-id="MOBILE_TEST_01"]');
  await page.waitForSelector('[data-card-preview-load-state="error"]');
  await page.click('[data-card-id="MOBILE_TEST_02"]');
  await page.waitForSelector('.card-preview-sheet');
  assert.equal(await page.$eval('.card-preview-sheet img', image => image.getAttribute('alt')), 'Русская карта 2');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.card-preview-sheet', { hidden: true });
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('data-card-id')),
    'MOBILE_TEST_02',
    'opening another row during a failed preview must replace the focus-return target',
  );

  await page.goto(`${origin}/tests/fixtures/hsreplay-deck-mobile.html?size=30&previewChunk=retry`, { waitUntil: 'networkidle0' });
  await waitForDeck(page, 30);
  const retryTriggerId = await page.$eval('.hsrdv-card-tile', tile => tile.getAttribute('data-card-id'));
  await page.click('.hsrdv-card-tile');
  await page.waitForSelector('[data-card-preview-load-state="error"]');
  assert.equal(await page.$eval('.traditional-deck-list', element => element.dataset.deckRenderState), 'ready');
  assert.equal(await page.$$eval('.hsrdv-card-tile', tiles => tiles.length), 30, 'preview failure must preserve rendered deck rows');
  assert.match(
    await page.$eval('[data-card-preview-load-state="error"]', element => element.textContent || ''),
    /Не удалось открыть полную карту/,
  );
  await page.click('[data-card-preview-load-state="error"] .recoverable-surface__action');
  await page.waitForSelector('.card-preview-sheet');
  assert.equal(await page.$eval('.traditional-deck-list', element => element.dataset.deckRenderState), 'ready');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.card-preview-sheet', { hidden: true });
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('data-card-id')),
    retryTriggerId,
    'successful preview retry must preserve the original DeckView row as the sheet trigger',
  );

  let retryCardRequests = 0;
  const interceptRetryImage = request => {
    if (new URL(request.url()).pathname === '/retry-card.png') {
      retryCardRequests += 1;
      if (retryCardRequests === 1) void request.respond({ status: 503, body: '' });
      else void request.respond({
        status: 200,
        contentType: 'image/gif',
        body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
      });
      return;
    }
    if (new URL(request.url()).pathname.startsWith('/api/public-resource/hsjson/')) {
      void request.respond({ status: 404, body: '' });
      return;
    }
    void request.continue();
  };
  await page.setRequestInterception(true);
  page.on('request', interceptRetryImage);
  await page.goto(`${origin}/tests/fixtures/hsreplay-deck-mobile.html?size=30&imageFailure=retry`, { waitUntil: 'networkidle0' });
  await waitForDeck(page, 30);
  await page.$eval('[data-card-id="MOBILE_TEST_01"]', tile => {
    tile.scrollIntoView({ block: 'center' });
    (tile).click();
  });
  await page.waitForSelector('[data-card-preview-image-state="error"]');
  assert.equal(await page.$eval('.traditional-deck-list', element => element.dataset.deckRenderState), 'ready');
  assert.match(
    await page.$eval('[data-card-preview-image-state="error"]', element => element.textContent || ''),
    /Изображение карты временно недоступно/,
  );
  await page.click('[data-card-preview-image-retry]');
  await page.waitForSelector('.card-preview-sheet img');
  assert.ok(retryCardRequests >= 2, 'image retry must request the preferred Russian card image again');
  await page.keyboard.press('Escape');
  page.off('request', interceptRetryImage);
  await page.setRequestInterception(false);

  await page.goto(`${origin}/tests/fixtures/standard-meta-nested-modal.html`, { waitUntil: 'networkidle0' });
  await page.click('#open-standard-meta');
  await page.waitForSelector('.standard-meta-modal[data-modal-surface-state="top"]');
  await page.waitForFunction(() => document.querySelectorAll('.standard-meta-modal .deck-list-view .deck-tile').length === 30);
  assert.deepEqual(await page.evaluate(() => {
    const parent = document.querySelector('.standard-meta-modal');
    return {
      inert: parent?.inert,
      ariaHidden: parent?.getAttribute('aria-hidden'),
      state: parent?.getAttribute('data-modal-surface-state'),
      cards: parent?.querySelectorAll('.deck-list-view .deck-tile').length,
    };
  }), { inert: false, ariaHidden: null, state: 'top', cards: 30 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.standard-meta-modal', { hidden: true });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'open-standard-meta');
  assert.deepEqual(await page.evaluate(() => ({
    inert: document.getElementById('root')?.inert,
    ariaHidden: document.getElementById('root')?.getAttribute('aria-hidden'),
  })), { inert: false, ariaHidden: null });

  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const standardMetaZoomClient = await page.createCDPSession();
  await page.goto(`${origin}/tests/fixtures/standard-meta-nested-modal.html`, { waitUntil: 'networkidle0' });
  await standardMetaZoomClient.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.click('#open-standard-meta');
  await page.waitForSelector('.standard-meta-modal[data-modal-surface-state="top"]');
  const standardMetaZoomGeometry = await page.evaluate(() => {
    const panel = document.querySelector('.standard-meta-modal__panel')?.getBoundingClientRect();
    const viewport = window.visualViewport;
    return {
      viewportHeight: viewport?.height || 0,
      panelHeight: panel?.height || 0,
      panelInside: Boolean(panel && viewport
        && panel.left >= viewport.offsetLeft - 1
        && panel.right <= viewport.offsetLeft + viewport.width + 1
        && panel.top >= viewport.offsetTop - 1
        && panel.bottom <= viewport.offsetTop + viewport.height + 1),
    };
  });
  assert.ok(standardMetaZoomGeometry.viewportHeight <= 401);
  assert.ok(standardMetaZoomGeometry.panelHeight <= standardMetaZoomGeometry.viewportHeight);
  assert.equal(standardMetaZoomGeometry.panelInside, true, 'Standard Meta modal must fit the 200% visual viewport');
  await page.keyboard.press('Escape');
  await standardMetaZoomClient.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

  await page.goto(`${origin}/tests/fixtures/hsreplay-deck-mobile.html?size=30`, { waitUntil: 'networkidle0' });
  await waitForDeck(page, 30);
  await page.hover('.hsrdv-card-tile');
  await page.waitForSelector('.card-preview-tooltip');
  assert.equal(await page.$('.card-preview-sheet'), null, 'desktop hover must remain a tooltip');

  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.focus('.hsrdv-card-tile');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.card-preview-sheet');
  assert.deepEqual(await page.evaluate(() => ({
    panelAnimation: getComputedStyle(document.querySelector('.card-preview-sheet__panel')).animationName,
    backdropAnimation: getComputedStyle(document.querySelector('.card-preview-sheet__backdrop')).animationName,
  })), { panelAnimation: 'none', backdropAnimation: 'none' });
  await page.keyboard.press('Escape');

  const client = await page.createCDPSession();
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.focus('.hsrdv-card-tile');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.card-preview-sheet');
  const zoomGeometry = await page.evaluate(() => {
    const panel = document.querySelector('.card-preview-sheet__panel')?.getBoundingClientRect();
    const viewport = window.visualViewport;
    return {
      viewportWidth: viewport?.width || 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panelInside: Boolean(panel && viewport
        && panel.left >= viewport.offsetLeft - 1
        && panel.right <= viewport.offsetLeft + viewport.width + 1
        && panel.top >= viewport.offsetTop - 1
        && panel.bottom <= viewport.offsetTop + viewport.height + 1),
    };
  });
  assert.ok(zoomGeometry.viewportWidth <= 641, `200% visual viewport should be ~640px: ${zoomGeometry.viewportWidth}`);
  assert.ok(zoomGeometry.overflow <= 1);
  assert.equal(zoomGeometry.panelInside, true);
  await page.keyboard.press('Escape');

  assert.deepEqual(runtimeErrors, []);
  console.log('DeckView mobile preview browser tests passed');
} finally {
  await browser?.close();
  await stopVite();
}
