import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const placeholder = readFileSync(new URL('../public/arena-logo-icon.webp', import.meta.url));
const hero = { hero: {
  dbfId: 57944, cardId: 'TB_BaconShop_HERO_16', name: 'А. Ф. Ка',
  image: 'https://hearthpulse.net/assets/og-preview.png',
  heroPower: { name: 'Прокрастинация', text: 'Пропустите первые два хода.',
    image: 'https://hearthpulse.net/assets/og-preview.png' },
  privateMetric: 'PRIVATE_HERO_STATISTICS',
} };

test('Next hero detail renders a safe teaser and real 404 without guest statistics requests', async () => {
  let publicCalls = 0;
  const legacy = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://fixture').pathname;
    response.setHeader('Content-Type', 'application/json');
    if (pathname === '/api/bg/heroes/public/57944') {
      publicCalls += 1; response.end(JSON.stringify(hero)); return;
    }
    if (pathname === '/api/bg/heroes/public/888888') {
      response.writeHead(503, { 'Retry-After': '45' }).end('{"error":"unavailable"}'); return;
    }
    if (pathname.startsWith('/api/bg/heroes/public/')) { response.writeHead(404).end('{"error":"missing"}'); return; }
    if (pathname === '/api/auth/me') { response.end('{"user":null,"adminAllowed":false,"contestAdminAllowed":false}'); return; }
    if (pathname.startsWith('/api/')) { response.writeHead(401).end('{"error":"guest"}'); return; }
    response.writeHead(204).end();
  });
  const legacyOrigin = await listenLocal(legacy);
  const reservation = http.createServer(); const nextOrigin = await listenLocal(reservation); await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', LEGACY_WEB_ORIGIN: legacyOrigin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let gateway; let browser;
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${nextOrigin}/health/next/`).then(response => response.ok, () => false);
      if (ready) break;
      await delay(50);
    }
    assert.ok(ready, `Next did not start: ${output}`);
    gateway = createPublicWebGateway({ legacyOrigin, nextOrigin, enabled: true, pagesEnabled: true });
    const origin = await listenLocal(gateway);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    const errors = []; const failed = []; const protectedCalls = [];
    page.on('request', request => {
      if (request.url().startsWith('https://hearthpulse.net/assets/')) {
        void request.respond({ status: 200, contentType: 'image/webp', body: placeholder }); return;
      }
      if (/^\/api\/bg\/heroes\/(?!public\/)/.test(new URL(request.url()).pathname)) protectedCalls.push(request.url());
      void request.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => failed.push(request.url()));
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 900 });
      const response = await page.goto(`${origin}/heroes/57944/`, { waitUntil: 'networkidle2' });
      assert.equal(response.status(), 200);
      await page.evaluate(axe);
      const state = await page.evaluate(async () => ({
        html: document.documentElement.outerHTML,
        canonical: document.querySelector('link[rel=canonical]')?.href,
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        main: document.querySelectorAll('main').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        violations: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
          .violations.map(violation => violation.id),
      }));
      assert.deepEqual(state.h1, ['А. Ф. Ка']);
      assert.equal(state.main, 1);
      assert.equal(state.overflow, false);
      assert.deepEqual(state.violations, []);
      assert.equal(state.canonical, 'https://hearthpulse.net/heroes/57944/');
      assert.equal(state.html.includes('PRIVATE_HERO_STATISTICS'), false);
    }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(protectedCalls, []);
    const callsBeforeSpoof = publicCalls;
    const spoofed = await fetch(`${origin}/heroes/57944/`, { headers: {
      'x-hearthpulse-bg-public-projection': `v1:${Buffer.from('{"hero":{}}').toString('base64url')}`,
    } });
    assert.equal(spoofed.status, 200);
    assert.match(await spoofed.text(), /А\. Ф\. Ка/);
    assert.equal(publicCalls - callsBeforeSpoof, 1, 'a valid page uses one anonymous projection request');
    const missing = await page.goto(`${origin}/heroes/999999/`, { waitUntil: 'networkidle2' });
    assert.equal(missing.status(), 404);
    assert.equal(await page.$eval('meta[name="robots"]', node => node.content), 'noindex, nofollow');
    assert.equal(await page.$('link[rel="canonical"]'), null);
    const outage = await fetch(`${origin}/heroes/888888/`, { redirect: 'manual' });
    assert.equal(outage.status, 503);
    assert.equal(outage.headers.get('retry-after'), '45');
    assert.equal(outage.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(outage.headers.get('cache-control') ?? '', /no-store/);
    assert.match(await outage.text(), /временно недоступн/i);
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await closeLocal(legacy);
  }
});
