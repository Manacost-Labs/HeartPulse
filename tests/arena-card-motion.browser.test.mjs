import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import puppeteer from 'puppeteer';
import { reserveLocalPort } from './fixtures/reserve-local-port.mjs';

const chromiumPath = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find(candidate => candidate && existsSync(candidate));
assert.ok(chromiumPath, 'Chromium/Chrome executable is required for Arena card-motion browser tests');
const vitePort = await reserveLocalPort();
const vite = spawn('./node_modules/.bin/vite', ['--config', 'tests/fixtures/vite.arena-motion.config.ts', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: process.cwd(), detached: true, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
let origin = '';
for (const stream of [vite.stdout, vite.stderr]) stream.on('data', chunk => {
  output += chunk.toString();
  const match = stripVTControlCharacters(output).match(/Local:\s+(http:\/\/127\.0\.0\.1:\d+)\/?/);
  if (match) origin = match[1];
});

async function stopVite() {
  if (vite.exitCode !== null) return;
  try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* already stopped */ }
  await new Promise(resolve => setTimeout(resolve, 200));
  if (vite.exitCode === null) try { process.kill(-vite.pid, 'SIGKILL'); } catch { /* already stopped */ }
}

async function assertStableGeometryAndChart(page, width) {
  await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
  await page.goto(`${origin}/tests/fixtures/arena-card-motion.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.arena-class-meter-label');
  const immediate = await page.evaluate(() => {
    const label = document.querySelector('.arena-class-meter-label');
    const fill = document.querySelector('.arena-class-meter-fill');
    const utilityProbe = document.querySelector('.arena-motion-tailwind-probe');
    return { labelText: label?.textContent, labelOpacity: label ? getComputedStyle(label).opacity : '', labelBackground: label ? getComputedStyle(label).backgroundColor : '', fillTransition: fill ? getComputedStyle(fill).transitionProperty : '', fillDuration: fill ? getComputedStyle(fill).transitionDuration : '', utilityPadding: utilityProbe ? getComputedStyle(utilityProbe).paddingTop : '' };
  });
  assert.equal(immediate.labelText, '54.2%', `${width}px label is readable from the first frame`);
  assert.equal(immediate.labelOpacity, '1', `${width}px label is never hidden during fill entrance`);
  assert.notEqual(immediate.labelBackground, 'rgba(0, 0, 0, 0)', `${width}px label has a stable contrast backing`);
  assert.ok(!immediate.fillTransition.includes('width'), `${width}px fill does not transition width`);
  assert.ok(parseFloat(immediate.fillDuration) <= 0.4, `${width}px fill entrance completes within 400ms`);
  assert.equal(immediate.utilityPadding, '12px', `${width}px Tailwind p-3 survives DeferredRoutes CSS loading`);
  const cards = await page.$$eval('.hs-tier-card', nodes => nodes.map(card => {
    const outer = card.getBoundingClientRect();
    const inner = card.querySelector('.hs-tier-card-inner')?.getBoundingClientRect();
    return { width: outer.width, height: outer.height, innerWidth: inner?.width, innerHeight: inner?.height };
  }));
  assert.equal(cards.length, 3, `${width}px fixture covers portrait, wide, and fallback cards`);
  for (const card of cards) {
    assert.ok(Math.abs(card.width - cards[0].width) < 1, `${width}px card containers share width`);
    assert.ok(Math.abs(card.height - cards[0].height) < 1, `${width}px card containers share height`);
    assert.ok(Math.abs(card.innerWidth - card.width) < 1, `${width}px card frame fills container width`);
    assert.ok(Math.abs(card.innerHeight - card.height) < 1, `${width}px card frame fills container height`);
  }
  for (const row of await page.$$('.arena-class-row')) {
    await row.hover();
    assert.equal(await row.evaluate(node => getComputedStyle(node).transform), 'none', `${width}px row hover must not move the ranking`);
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
  browser = await puppeteer.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await assertStableGeometryAndChart(page, 900);
  await assertStableGeometryAndChart(page, 390);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${origin}/tests/fixtures/arena-card-motion.html`, { waitUntil: 'networkidle0' });
  await page.hover('.hs-tier-card');
  const reducedMotion = await page.evaluate(() => ({ cardTransform: getComputedStyle(document.querySelector('.hs-tier-card-inner')).transform, cardDuration: getComputedStyle(document.querySelector('.hs-tier-card-inner')).transitionDuration, fillDuration: getComputedStyle(document.querySelector('.arena-class-meter-fill')).transitionDuration }));
  assert.equal(reducedMotion.cardTransform, 'none', 'reduced-motion cards stay static on hover');
  assert.ok(parseFloat(reducedMotion.cardDuration) <= 0.001, 'reduced-motion cards do not animate perceptibly');
  assert.ok(parseFloat(reducedMotion.fillDuration) <= 0.001, 'reduced-motion chart fills do not animate perceptibly');
  assert.deepEqual(runtimeErrors, []);
  console.log('Arena card-motion browser tests passed');
} finally {
  await browser?.close();
  await stopVite();
}
