import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const code = 'ABCD-2345';

test('Next device connection keeps the code private and uses the existing authenticated decision API', async () => {
  const reservation = http.createServer();
  const origin = process.env.NEXT_CONNECT_ORIGIN || await listenLocal(reservation);
  if (!process.env.NEXT_CONNECT_ORIGIN) await closeLocal(reservation);
  const child = process.env.NEXT_CONNECT_ORIGIN ? null : spawn(process.execPath,
    ['node_modules/next/dist/bin/next', 'start', 'apps/public-web', '--hostname', '127.0.0.1',
      '--port', new URL(origin).port], {
      env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  let output = ''; let browser;
  child?.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child?.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (child && child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${origin}/health/next/`).then(response => response.ok, () => false);
      if (ready) break;
      await delay(50);
    }
    assert.equal(ready, true, `Next did not start: ${output}`);
    const route = `${origin}/connect/?user_code=${code}`;
    const document = await fetch(route);
    const html = await document.text();
    assert.equal(document.status, 200);
    assert.match(html, /<title>Подключение приложения/);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(html, /rel="canonical"|ABCD-2345|connect@example\.test/);

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    const inspectRequests = []; const decisions = [];
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      const signedIn = request.headers().cookie?.includes('connect_member=1');
      const respond = (status, payload) => request.respond({ status, contentType: 'application/json',
        body: JSON.stringify(payload) });
      if (url.pathname === '/api/auth/me') {
        void respond(200, { user: signedIn
          ? { id: 'connect-reader', email: 'connect@example.test', name: 'Игрок', role: 'user' } : null });
      } else if (url.pathname === '/api/subscription/status') {
        void respond(200, { entitlements: {} });
      } else if (url.pathname === '/api/v1/oauth/device/authorization') {
        inspectRequests.push(url.searchParams.get('user_code'));
        void respond(200, { authorization: { clientId: 'manacost-tracker', clientName: 'Manacost Tracker',
          scopes: ['profile:read'], expiresAt: Date.now() + 120_000 } });
      } else if (url.pathname === '/api/v1/oauth/device/approve') {
        decisions.push({ method: request.method(), csrf: request.headers()['x-csrf-request'],
          body: JSON.parse(request.postData() || '{}') });
        void respond(200, { ok: true });
      } else if (/^\/(?:wallpaper\/|fonts\/|ad\/|hearthpulse-logo\.webp$|arena-logo-icon-256\.webp$|favicon-32\.png$)/.test(url.pathname)) {
        const file = new URL(`../public${url.pathname}`, import.meta.url);
        if (existsSync(file)) {
          const mime = url.pathname.endsWith('.woff2') ? 'font/woff2'
            : url.pathname.endsWith('.otf') ? 'font/otf'
              : url.pathname.endsWith('.webp') ? 'image/webp'
                : url.pathname.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
          void request.respond({ status: 200, contentType: mime, body: readFileSync(file) });
        } else void request.continue();
      } else void request.continue();
    });

    for (const width of [1440, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      const response = await page.goto(route, { waitUntil: 'networkidle2' });
      assert.equal(response.status(), 200);
      await page.waitForSelector('#application-connect-code');
      await page.evaluate(axe);
      const state = await page.evaluate(async () => ({
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        mainCount: document.querySelectorAll('main').length,
        code: document.querySelector('#application-connect-code')?.value,
        overflow: document.documentElement.scrollWidth > innerWidth,
        violations: (await axe.run(document, { runOnly: { type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id,
            targets: item.nodes.map(node => node.target) })),
      }));
      assert.deepEqual(state.h1, ['Подключить Manacost Tracker']);
      assert.equal(state.mainCount, 1);
      assert.equal(state.code, code);
      assert.equal(state.overflow, false);
      assert.deepEqual(state.violations, []);
    }
    assert.deepEqual(inspectRequests, [], 'guest must not inspect an authorization');
    assert.deepEqual(decisions, [], 'guest must not decide an authorization');
    await page.click('.application-connect__code button[type="submit"]');
    await page.waitForFunction(() => location.search.includes('login'));
    await page.waitForSelector('.application-connect__login');
    assert.equal(new URL(page.url()).searchParams.get('user_code'), code);

    await page.setCookie({ name: 'connect_member', value: '1', url: origin });
    await page.goto(route, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.application-connect__review');
    assert.deepEqual(inspectRequests, [code]);
    await page.click('.application-connect__actions .is-primary');
    await page.waitForSelector('.application-connect__result.is-approved');
    assert.deepEqual(decisions, [{ method: 'POST', csrf: '1',
      body: { user_code: code, decision: 'approve' } }]);
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit').catch(() => undefined); }
  }
});
