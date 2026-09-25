import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');

test('Next BG tier list keeps its public teaser separate from subscriber data and restores URL state', async () => {
  const tierRequests = [];
  let tierStatus = 200;
  let malformedAuthResponsesRemaining = 0;
  const reservation = http.createServer();
  const nextOrigin = await listenLocal(reservation); await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let browser;
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    let ready = false;
    for (let i = 0; i < 200; i += 1) {
      if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${nextOrigin}/health/next/`).then(response => response.ok, () => false);
      if (ready) break;
      await delay(50);
    }
    assert.equal(ready, true, `Next did not start: ${output}`);
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      const signedIn = request.headers().cookie?.includes('tier_reader=1');
      const respond = (status, payload) => request.respond({ status, contentType: 'application/json',
        body: JSON.stringify(payload) });
      if (url.pathname === '/api/auth/me') {
        if (signedIn && malformedAuthResponsesRemaining > 0) {
          malformedAuthResponsesRemaining -= 1;
          void respond(200, { malformed: true });
        } else {
          void respond(200, { user: signedIn
            ? { id: 'tier-reader', email: 'tier@example.test', name: 'Игрок', role: 'user' } : null });
        }
      } else if (url.pathname === '/api/subscription/status') {
        void respond(200, { hasAccess: true, entitlements: { battlegrounds: true } });
      } else if (url.pathname === '/api/bg/tier-lists') {
        tierRequests.push(url.search);
        void respond(signedIn ? tierStatus : 401, !signedIn ? { error: 'guest' }
          : tierStatus !== 200 ? { error: 'Данные временно недоступны' }
            : { list: url.searchParams.get('list'), count: 0,
              tiers: { S: [], A: [], B: [], C: [], D: [] } });
      } else if (/^\/(?:wallpaper\/|fonts\/|ad\/|hearthpulse-logo\.webp$|favicon-32\.png$)/.test(url.pathname)) {
        const mime = url.pathname.endsWith('.woff2') ? 'font/woff2'
          : url.pathname.endsWith('.otf') ? 'font/otf'
            : url.pathname.endsWith('.webp') ? 'image/webp'
              : url.pathname.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
        void request.respond({ status: 200, contentType: mime,
          body: readFileSync(new URL(`../public${url.pathname}`, import.meta.url)) });
      } else void request.continue();
    });
    const errors = []; const failed = []; const failedResponses = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => failed.push(request.url()));
    page.on('response', response => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });
    for (const width of [1440, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      const guest = await page.goto(`${nextOrigin}/battlegrounds/tier-list/`, { waitUntil: 'networkidle2' });
      assert.equal(guest.status(), 200);
      await page.waitForFunction(() => !document.body.textContent.includes('Проверяем доступ к тир-листу...'));
      await page.evaluate(axe);
      const state = await page.evaluate(async () => ({
        headings: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        teaser: document.body.textContent.includes('доступен подписчикам'),
        overflow: document.documentElement.scrollWidth > innerWidth,
        violations: (await axe.run(document,
          { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => item.id),
      }));
      assert.deepEqual(state.headings, ['Тир-лист БГ Hearthstone']);
      assert.equal(state.canonical, 'https://hearthpulse.net/battlegrounds/tier-list/');
      assert.equal(state.teaser, true);
      assert.equal(state.overflow, false);
      assert.deepEqual(state.violations, []);
    }
    assert.deepEqual(tierRequests, [], 'anonymous visitors do not request subscriber statistics');
    await page.evaluate(() => localStorage.setItem('hs_arena_auth_cookie_hint', '1'));
    await page.setCookie({ name: 'tier_reader', value: '1', url: nextOrigin });
    malformedAuthResponsesRemaining = 3;
    const member = await page.goto(`${nextOrigin}/battlegrounds/tier-list/?list=strategies&source=hsreplay`,
      { waitUntil: 'networkidle2' });
    assert.equal(member.status(), 200);
    for (let attempt = 0; malformedAuthResponsesRemaining > 0 && attempt < 30; attempt += 1) await delay(100);
    assert.equal(malformedAuthResponsesRemaining, 0, 'all three bounded auth attempts must fail');
    await delay(100);
    assert.match(await page.$eval('main', node => node.textContent), /Проверяем доступ к тир-листу/,
      'a remembered session must stay pending after a transient auth failure');
    assert.equal(await page.$eval('meta[name="robots"]', node => node.content), 'noindex, follow');
    assert.equal(await page.$eval('link[rel="canonical"]', node => node.href),
      'https://hearthpulse.net/battlegrounds/tier-list/');
    const strategy = await page.waitForSelector('[data-tour-id="bg-tier-list-strategy"][aria-pressed="true"]',
      { timeout: 12000 }).catch(() => null);
    assert.ok(strategy, JSON.stringify({ tierRequests,
      main: await page.$eval('main', node => node.textContent.slice(0, 450)) }));
    assert.ok(tierRequests.some(query => query.includes('list=strategies') && query.includes('source=hsreplay')));
    assert.deepEqual(errors, [], JSON.stringify(failedResponses.slice(0, 40)));
    assert.deepEqual(failed, []);
    assert.deepEqual(failedResponses, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.reload({ waitUntil: 'networkidle2' });
    assert.ok(await page.$('[data-tour-id="bg-tier-list-strategy"][aria-pressed="true"]'));
    assert.match(await page.$eval('main', node => node.textContent), /Всего: 0/);
    tierStatus = 503;
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Данные временно недоступны'));
    assert.ok(await page.$('[data-tour-id="bg-tier-list-strategy"][aria-pressed="true"]'));
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  }
});
