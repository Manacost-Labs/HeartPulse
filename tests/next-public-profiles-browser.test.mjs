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
const legacyId = 'p_AbCdEfGhIjKlMnOpQrStUv';
const profile = { publicProfileId: '7', name: 'Игрок профиля', avatarInitials: 'ИП',
  createdAt: '2026-01-01T00:00:00.000Z', contactEmail: 'private@example.test', adminAllowed: true };

test('Next public profile routes use the allowlisted Express projection and real missing statuses', async () => {
  const requests = [];
  const backend = http.createServer((request, response) => {
    requests.push(request.url);
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/profiles/7' || request.url === `/api/profiles/${legacyId}`) {
      response.end(JSON.stringify({ profile }));
    } else if (request.url === '/api/profiles/502') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Wrong upstream</title>');
    } else if (request.url === '/api/profiles/503') {
      response.statusCode = 503; response.end(JSON.stringify({ error: 'temporarily unavailable' }));
    } else {
      response.statusCode = 404; response.end(JSON.stringify({ error: 'Профиль не найден' }));
    }
  });
  const backendOrigin = await listenLocal(backend);
  const reservation = http.createServer();
  const origin = process.env.NEXT_PROFILE_ORIGIN || await listenLocal(reservation);
  if (!process.env.NEXT_PROFILE_ORIGIN) await closeLocal(reservation);
  const child = process.env.NEXT_PROFILE_ORIGIN ? null : spawn(process.execPath,
    ['node_modules/next/dist/bin/next', 'start', 'apps/public-web', '--hostname', '127.0.0.1',
      '--port', new URL(origin).port], {
      env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
        LEGACY_WEB_ORIGIN: backendOrigin },
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
    const numeric = await fetch(`${origin}/id/7/`);
    const html = await numeric.text();
    assert.equal(numeric.status, 200);
    assert.match(html, /Игрок профиля/);
    assert.match(html, /<h1[^>]*>Игрок профиля<\/h1>/);
    assert.match(html, /name="robots" content="noindex, follow"/);
    assert.match(html, /href="https:\/\/hearthpulse\.net\/id\/7\/"/);
    assert.doesNotMatch(html, /private@example\.test|adminAllowed|blockedAt/);
    const legacy = await fetch(`${origin}/profiles/${legacyId}/`);
    assert.equal(legacy.status, 200);
    assert.match(await legacy.text(), /href="https:\/\/hearthpulse\.net\/id\/7\/"/);
    for (const path of ['/id/not-a-number/', '/id/999/', '/profiles/p_short/']) {
      assert.equal((await fetch(`${origin}${path}`)).status, 404, path);
    }
    assert.notEqual((await fetch(`${origin}/id/503/`)).status, 200,
      'unavailable projections must not become success HTML');
    assert.notEqual((await fetch(`${origin}/id/502/`)).status, 200,
      'HTML from a misconfigured upstream must not become success HTML');

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setCacheEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname === '/api/auth/me') {
        void request.respond({ status: 200, contentType: 'application/json', body: '{"user":null}' });
      } else if (/^\/(?:wallpaper\/|fonts\/|ad\/|hearthpulse-logo\.webp$|favicon-32\.png$)/.test(url.pathname)) {
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
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'clipboard', { value: {
        writeText: async value => { window.__copiedProfileUrl = value; },
      } });
    });
    for (const width of [1440, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      const response = await page.goto(`${origin}/id/7/`, { waitUntil: 'networkidle2' });
      assert.equal(response.status(), 200);
      await page.evaluate(axe);
      const state = await page.evaluate(async () => ({
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        mainCount: document.querySelectorAll('main').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        violations: (await axe.run(document, { runOnly: { type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => ({ id: item.id,
            targets: item.nodes.map(node => node.target) })),
      }));
      assert.deepEqual(state.h1, [profile.name]);
      assert.equal(state.mainCount, 1);
      assert.equal(state.overflow, false);
      assert.deepEqual(state.violations, []);
    }
    await page.evaluate(() => [...document.querySelectorAll('button')]
      .find(button => button.textContent?.includes('Скопировать ссылку'))?.click());
    await page.waitForFunction(() => Boolean(window.__copiedProfileUrl));
    assert.equal(await page.evaluate(() => window.__copiedProfileUrl), `${origin}/id/7`);
    assert.ok(requests.includes('/api/profiles/7'));
    assert.ok(requests.includes(`/api/profiles/${legacyId}`));
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit').catch(() => undefined); }
    await closeLocal(backend);
  }
});
