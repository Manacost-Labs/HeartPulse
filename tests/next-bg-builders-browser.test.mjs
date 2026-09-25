import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const pages = [
  { path: '/battlegrounds/strategies/', heading: 'Конструктор стратегий БГ Hearthstone',
    script: 'strategy-builder.gridfix2.js', initialized: '#builder-comp-select', placeholder: 'Загружаю сборки...' },
  { path: '/battlegrounds/tier-builder/', heading: 'Конструктор тир-листов Полей сражений',
    script: 'hero-tier-builder.js', initialized: '#tier-builder-summary', placeholder: 'Загружаю библиотеку...' },
];

test('Next Battleground builders keep public teasers separate from legacy subscriber tools', async () => {
  const downloads = mkdtempSync(join(tmpdir(), 'bg-builder-downloads-'));
  const reservation = http.createServer();
  const origin = await listenLocal(reservation); await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(origin).port], {
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let browser;
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${origin}/health/next/`).then(response => response.ok, () => false);
      if (ready) break;
      await delay(50);
    }
    assert.equal(ready, true, `Next did not start: ${output}`);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const apiRequests = []; const legacyScripts = []; const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      const signedIn = request.headers().cookie?.includes('builder_reader=1');
      const json = (status, payload) => request.respond({ status, contentType: 'application/json',
        body: JSON.stringify(payload) });
      if (url.pathname === '/api/auth/me') {
        void json(200, { user: signedIn
          ? { id: 'builder-reader', email: 'builder@example.test', name: 'Игрок', role: 'user' } : null });
      } else if (url.pathname === '/api/subscription/status') {
        void json(200, { hasAccess: true, entitlements: { battlegrounds: true } });
      } else if (url.pathname.startsWith('/api/')) {
        apiRequests.push(url.pathname);
        if (url.pathname === '/api/card-art' || url.pathname.startsWith('/api/public-resource/')) {
          void request.respond({ status: 200, contentType: 'image/webp',
            body: readFileSync(new URL('../public/arena-logo-icon.webp', import.meta.url)) });
        } else void json(signedIn ? 200 : 401, {});
      } else if (/^\/(?:bg-legacy\/|wallpaper\/|fonts\/|ad\/|hearthpulse-logo\.webp$|favicon-32\.png$)/.test(url.pathname)) {
        if (url.pathname.endsWith('.js')) legacyScripts.push(url.pathname);
        const mime = url.pathname.endsWith('.js') ? 'application/javascript'
          : url.pathname.endsWith('.css') ? 'text/css'
            : url.pathname.endsWith('.json') ? 'application/json'
              : url.pathname.endsWith('.woff2') ? 'font/woff2'
                : url.pathname.endsWith('.otf') ? 'font/otf'
                  : url.pathname.endsWith('.webp') ? 'image/webp'
                    : url.pathname.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
        void request.respond({ status: 200, contentType: mime,
          body: readFileSync(new URL(`../public${url.pathname}`, import.meta.url)) });
      } else void request.continue();
    });

    for (const width of [1440, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      for (const { path, heading } of pages) {
        const response = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
        assert.equal(response.status(), 200, path);
        await page.waitForFunction(() => !document.body.textContent.includes('Проверяем доступ'));
        await page.evaluate(axe);
        const state = await page.evaluate(async () => ({
          h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
          mainCount: document.querySelectorAll('main').length,
          canonical: document.querySelector('link[rel="canonical"]')?.href,
          paywall: document.body.textContent.includes('доступен подписчикам'),
          overflow: document.documentElement.scrollWidth > innerWidth,
          violations: (await axe.run(document, { runOnly: { type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id,
              targets: item.nodes.map(node => node.target) })),
        }));
        assert.deepEqual(state.h1, [heading], path);
        assert.equal(state.mainCount, 1, path);
        assert.equal(state.canonical, `https://hearthpulse.net${path}`);
        assert.equal(state.paywall, true, path);
        assert.equal(state.overflow, false, path);
        assert.deepEqual(state.violations, [], path);
      }
    }
    assert.deepEqual(apiRequests, [], 'guests never request builder data');
    assert.deepEqual(legacyScripts, [], 'guests never download protected builder scripts');

    await page.setCookie({ name: 'builder_reader', value: '1', url: origin });
    for (const { path, heading, script, initialized, placeholder } of pages) {
      const response = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
      assert.equal(response.status(), 200, path);
      assert.doesNotMatch(await response.text(), /builder-comp-select|tier-builder-pool|strategy-builder\.gridfix2\.js/,
        `${path} does not serialize subscriber controls into shared HTML`);
      await page.waitForFunction(name => [...document.querySelectorAll('script[data-bg-legacy-owner]')]
        .some(node => node.src.includes(name)), {}, script);
      await page.waitForFunction(({ selector, pending }) => {
        const control = document.querySelector(selector);
        return control && !control.textContent.includes(pending);
      }, {}, { selector: initialized, pending: placeholder });
      const state = await page.evaluate(() => ({
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        mainCount: document.querySelectorAll('main').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      assert.deepEqual(state.h1, [heading], path);
      assert.equal(state.mainCount, 1, path);
      assert.equal(state.overflow, false, path);
      assert.ok(legacyScripts.some(url => url.endsWith(script)), `${path} loads ${script}`);
      if (path.includes('strategies')) {
        const preset = await page.$eval('#builder-comp-select', select =>
          [...select.options].find(option => option.value)?.value);
        assert.ok(preset, 'strategy presets are available');
        await page.select('#builder-comp-select', preset);
        await page.click('#builder-comp-apply');
        await page.waitForFunction(() => !document.querySelector('#builder-counter')?.textContent.startsWith('0 карт'));
        await page.click('#builder-export-png');
        let exported = false;
        for (let attempt = 0; attempt < 50; attempt += 1) {
          exported = readdirSync(downloads).some(name => name.endsWith('.png'));
          if (exported) break;
          await delay(100);
        }
        assert.equal(exported, true, 'imported strategy exports a PNG');
      }
      if (path.includes('tier-builder')) {
        await page.$eval('#tier-builder-library-columns', input => {
          input.value = '4'; input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.reload({ waitUntil: 'networkidle2' });
        await page.waitForSelector('#tier-builder-library-columns');
        assert.equal(await page.$eval('#tier-builder-library-columns', input => input.value), '4');
        await page.waitForSelector('#tier-builder-pool .tier-builder-card [data-action="pool"]');
        await page.$eval('#tier-builder-pool .tier-builder-card [data-action="pool"]', button => button.click());
        assert.ok(await page.$('#tier-builder-rows .tier-builder-card'), 'card moves from pool to a tier');
        const beforeExport = readdirSync(downloads).length;
        await page.$eval('#tier-builder-download-all-png', button => button.click());
        let exported = false;
        for (let attempt = 0; attempt < 50; attempt += 1) {
          exported = readdirSync(downloads).length > beforeExport;
          if (exported) break;
          await delay(100);
        }
        assert.equal(exported, true, 'tier board exports a PNG');
      }
    }
    assert.deepEqual(pageErrors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    rmSync(downloads, { recursive: true, force: true });
  }
});
