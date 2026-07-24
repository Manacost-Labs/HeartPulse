import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
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
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for archetype detail browser tests');

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

  await page.setViewport({ width: 1440, height: 1050, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/archetypes-detail.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-mulligan-row');

  assert.equal(await page.$eval('h1', heading => heading.textContent), 'Маг на элементалях');
  assert.equal(await page.$$eval('.archetype-mulligan-row', rows => rows.length), 8);
  assert.equal(await page.$$eval('.archetype-matchup-row', rows => rows.length), 6);
  assert.equal(await page.$$eval('.archetype-deck-folio', rows => rows.length), 4);
  assert.deepEqual(
    await page.$$eval('.archetype-matchup-row__tone', nodes => [...new Set(nodes.map(node => node.textContent))].sort()),
    ['Выгодный', 'Ровный', 'Сложный'],
  );

  await page.hover('.archetype-mulligan-card');
  await page.waitForSelector('.card-preview-tooltip');
  assert.equal(await page.$eval('.card-preview-tooltip', node => node.getAttribute('data-card-preview-id')), 'CORE_CS2_023');
  await page.mouse.move(0, 0);
  await page.waitForSelector('.card-preview-tooltip', { hidden: true });

  const builderHref = await page.$eval('.archetype-builder-link', link => link.getAttribute('href'));
  assert.match(builderHref || '', /^\/deck-builder\?code=/);
  assert.ok(new URL(builderHref, origin).searchParams.get('code')?.length > 20);

  await page.click('.archetype-analysis-panel__more');
  assert.equal(await page.$$eval('.archetype-deck-folio', rows => rows.length), 5);
  await page.screenshot({ path: '/tmp/manacost-admin-archetype-detail-desktop.png', fullPage: true });

  await page.addScriptTag({ path: axePath });
  const desktopViolations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('.archetypes-page'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(desktopViolations, []);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.archetype-mulligan-row');
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    minMulliganTarget: Math.min(...[...document.querySelectorAll('.archetype-mulligan-card')].map(element => element.getBoundingClientRect().height)),
    minDeckSummary: Math.min(...[...document.querySelectorAll('.archetype-deck-folio > summary')].map(element => element.getBoundingClientRect().height)),
    builderTarget: document.querySelector('.archetype-builder-link')?.getBoundingClientRect().height || 0,
  }));
  assert.ok(mobile.overflow <= 1, `mobile detail overflowed by ${mobile.overflow}px`);
  assert.ok(mobile.minMulliganTarget >= 44);
  assert.ok(mobile.minDeckSummary >= 44);
  assert.ok(mobile.builderTarget >= 44);
  await page.screenshot({ path: '/tmp/manacost-admin-archetype-detail-mobile.png', fullPage: true });

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
