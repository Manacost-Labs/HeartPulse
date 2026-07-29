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
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for Vicious Gold browser tests');

const vitePort = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    server.close(error => error ? reject(error) : resolve(port));
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
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

  const startedAt = Date.now();
  await page.goto(`${origin}/tests/fixtures/vicious-gold-progressive.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.traditional-mode-banner');
  const summaryReadyMs = Date.now() - startedAt;
  assert.match(
    await page.evaluate(() => window.__viciousGoldBuildsStateAtSummary ?? ''),
    /^(?:idle|pending)$/,
    `summary must render before the delayed builds response (observed after ${summaryReadyMs}ms)`,
  );
  assert.match(await page.$eval('.traditional-mode-banner__summary', node => node.textContent ?? ''), /догружаем сборки/i);
  assert.equal(await page.$$eval('.vsgold__deck-row', rows => rows.length), 2);

  await page.waitForFunction(() => document.querySelector('.traditional-mode-banner__summary')?.textContent?.includes('1/2'));
  assert.ok(await page.$('.vsgold__build-copy-button'));
  assert.deepEqual(runtimeErrors, []);

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.traditional-mode-banner');
  const mobile = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    navTargets: [...document.querySelectorAll('.vsgold__mobile-nav a')]
      .map(element => element.getBoundingClientRect().height),
  }));
  assert.ok(mobile.overflow <= 1, `Vicious Gold overflowed by ${mobile.overflow}px on mobile`);
  assert.ok(mobile.navTargets.every(height => height >= 44), 'mobile section links must keep 44px touch targets');

  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document.querySelector('.vsgold'));
    return result.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
  });
  assert.deepEqual(violations, []);
  console.log(`Vicious Gold progressive browser tests passed (summary ${summaryReadyMs}ms)`);
} finally {
  await browser?.close();
  await stopVite();
}
