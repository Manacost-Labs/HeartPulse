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
const card = { card: {
  dbfId: 98582, kind: 'minion', nameRu: 'Баюбот', typeName: 'Существо',
  textRu: 'Магнетизм', images: { card: '/assets/og-preview.png' },
  winrate: 'PRIVATE_CARD_WINRATE',
}, canonicalPath: '/library/minions/баюбот-98582/' };

test('Next Battleground card detail keeps public identity and real missing-card status', async () => {
  const legacy = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://fixture').pathname;
    response.setHeader('Content-Type', 'application/json');
    if (pathname === '/api/bg/library/public/minion/98582') { response.end(JSON.stringify(card)); return; }
    if (pathname === '/api/bg/library/public/minion/100026') {
      response.end(JSON.stringify({ card: { ...card.card, dbfId: 100026,
        nameRu: 'Электрический синтезатор' },
      canonicalPath: '/library/minions/электрический-синтезатор-100026/' })); return;
    }
    if (pathname === '/api/bg/library/public/minion/98583') {
      response.end(JSON.stringify({ card: { ...card.card, dbfId: 98583, textRu: 'А'.repeat(7000) },
        canonicalPath: '/library/minions/long-98583/' })); return;
    }
    if (pathname === '/api/bg/library/public/minion/888888') {
      response.writeHead(503, { 'Retry-After': '120' }).end('{"error":"unavailable"}'); return;
    }
    if (pathname.startsWith('/api/bg/library/public/')) { response.writeHead(404).end('{"error":"missing"}'); return; }
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
      if (/^\/api\/bg\/library\/(?!public\/)/.test(new URL(request.url()).pathname)) protectedCalls.push(request.url());
      void request.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => failed.push(request.url()));
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 900 });
      const response = await page.goto(`${origin}/library/minions/баюбот-98582/`, { waitUntil: 'networkidle2' });
      assert.equal(response.status(), 200, output);
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
      assert.deepEqual(state.h1, ['Баюбот']);
      assert.equal(state.main, 1);
      assert.equal(state.overflow, false);
      assert.deepEqual(state.violations, []);
      assert.equal(state.canonical, encodeURI('https://hearthpulse.net/library/minions/баюбот-98582/'));
      assert.equal(state.html.includes('PRIVATE_CARD_WINRATE'), false);
    }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(protectedCalls, []);
    const missing = await page.goto(`${origin}/library/minions/missing-999999/`, { waitUntil: 'networkidle2' });
    assert.equal(missing.status(), 404);
    assert.equal(await page.$eval('meta[name="robots"]', node => node.content), 'noindex, nofollow');
    const redirect = await fetch(`${origin}/library/minions/wrong-98582/?utm_source=qa`, { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), encodeURI('/library/minions/баюбот-98582/') + '?utm_source=qa');
    const cyrillic = await fetch(`${origin}/library/minions/электрический-синтезатор-100026/`);
    assert.equal(cyrillic.status, 200, 'long Cyrillic canonical slugs stay reachable');
    assert.match(await cyrillic.text(), /Электрический синтезатор/);
    const outage = await fetch(`${origin}/library/minions/outage-888888/`, { redirect: 'manual' });
    assert.equal(outage.status, 503);
    assert.equal(outage.headers.get('retry-after'), '120');
    assert.equal(outage.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(outage.headers.get('cache-control') ?? '', /no-store/);
    assert.match(await outage.text(), /временно недоступн/i);
    const headOutage = await fetch(`${origin}/library/minions/outage-888888/`, { method: 'HEAD' });
    assert.equal(headOutage.status, 503);
    assert.equal(headOutage.headers.get('retry-after'), '120');
    assert.equal(await headOutage.text(), '');
    const oversized = await fetch(`${origin}/library/minions/long-98583/`);
    assert.equal(oversized.status, 503, 'an oversized projection cannot race a second API fetch');
    assert.equal(oversized.headers.get('retry-after'), '300');
    const outagePage = await page.goto(`${origin}/library/minions/outage-888888/`, { waitUntil: 'networkidle2' });
    assert.equal(outagePage.status(), 503);
    assert.equal(await page.$eval('h1', node => node.textContent), 'Данные временно недоступны');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await closeLocal(legacy);
  }
});
