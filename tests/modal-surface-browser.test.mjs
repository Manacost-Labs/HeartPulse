import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import puppeteer from 'puppeteer';
import { reserveLocalPort } from './fixtures/reserve-local-port.mjs';

const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for ModalSurface browser tests');

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
  await page.setViewport({ width: 390, height: 700, deviceScaleFactor: 1 });
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.goto(`${origin}/tests/fixtures/modal-surface.html`, { waitUntil: 'networkidle0' });

  await page.click('#lightbox-trigger');
  await page.waitForSelector('.constructed-card-lightbox');
  const opened = await page.evaluate(() => {
    const surface = document.querySelector('.constructed-card-lightbox');
    const root = document.getElementById('root');
    const style = surface instanceof HTMLElement ? getComputedStyle(surface) : null;
    return {
      portalParent: surface?.parentElement?.tagName,
      rootInert: root?.inert,
      rootAriaHidden: root?.getAttribute('aria-hidden'),
      activeId: document.activeElement?.className,
      activeElement: document.activeElement?.outerHTML,
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      viewportHeight: Number.parseFloat(style?.getPropertyValue('--modal-surface-height') || '0'),
      surfaceHeight: surface?.getBoundingClientRect().height || 0,
    };
  });
  assert.equal(opened.portalParent, 'BODY', 'the modal must use a body portal');
  assert.equal(opened.rootInert, true);
  assert.equal(opened.rootAriaHidden, 'true');
  assert.match(String(opened.activeId), /constructed-card-lightbox__close/, JSON.stringify(opened));
  assert.equal(opened.bodyOverflow, 'hidden');
  assert.equal(opened.bodyPosition, 'fixed');
  assert.ok(opened.viewportHeight > 0 && Math.abs(opened.surfaceHeight - opened.viewportHeight) < 2);
  await page.setViewport({ width: 390, height: 520, deviceScaleFactor: 1 });
  await page.waitForFunction(() => {
    const surface = document.querySelector('.constructed-card-lightbox');
    if (!(surface instanceof HTMLElement)) return false;
    const variable = Number.parseFloat(getComputedStyle(surface).getPropertyValue('--modal-surface-height'));
    return Math.abs(variable - window.visualViewport.height) < 2
      && Math.abs(surface.getBoundingClientRect().height - window.visualViewport.height) < 2;
  });
  await page.setViewport({ width: 390, height: 700, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  assert.deepEqual(await page.evaluate(() => ({
    backdropAnimation: getComputedStyle(document.querySelector('.modal-surface__backdrop')).animationName,
    panelAnimation: getComputedStyle(document.querySelector('.modal-surface__panel')).animationName,
  })), { backdropAnimation: 'none', panelAnimation: 'none' });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  await page.click('[aria-label="Следующее изображение"]');
  await page.waitForFunction(() => document.querySelector('#constructed-card-lightbox-title')?.textContent === 'Вторая карта');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.constructed-card-lightbox', { hidden: true });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'lightbox-trigger', 'changing slides must not replace the original focus target');
  assert.deepEqual(await page.evaluate(() => ({
    inert: document.getElementById('root')?.inert,
    ariaHidden: document.getElementById('root')?.getAttribute('aria-hidden'),
    overflow: document.body.style.overflow,
    position: document.body.style.position,
  })), { inert: false, ariaHidden: null, overflow: '', position: '' });

  await page.click('#lightbox-trigger');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Следующее изображение');
  await page.keyboard.press('Tab');
  assert.match(String(await page.evaluate(() => document.activeElement?.className)), /constructed-card-lightbox__close/);
  await page.click('.constructed-card-lightbox__backdrop');
  await page.waitForSelector('.constructed-card-lightbox', { hidden: true });

  await page.click('#first-trigger');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'first-close');
  await page.click('#nested-trigger');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'second-close');
  assert.deepEqual(await page.evaluate(() => ({
    firstInert: document.querySelector('.harness-modal--first')?.inert,
    firstHidden: document.querySelector('.harness-modal--first')?.getAttribute('aria-hidden'),
    secondInert: document.querySelector('.harness-modal--second')?.inert,
  })), { firstInert: true, firstHidden: 'true', secondInert: false });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.harness-modal--second', { hidden: true });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'nested-trigger');
  assert.ok(await page.$('.harness-modal--first'), 'Escape must close only the top-most surface');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.harness-modal--first', { hidden: true });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'first-trigger');

  await page.click('#first-trigger');
  await page.evaluate(() => {
    const rogue = document.createElement('button');
    rogue.id = 'rogue-focus';
    document.body.appendChild(rogue);
    rogue.focus();
  });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'first-close', 'focus must be redirected into the top-most dialog');
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.getElementById('rogue-focus')?.remove());

  assert.deepEqual(runtimeErrors, []);
  console.log('ModalSurface browser tests passed');
} finally {
  await browser?.close();
  await stopVite();
}
