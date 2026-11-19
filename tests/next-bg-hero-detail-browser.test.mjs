import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { isAbortedRoutePrefetch } from './helpers/abortedRoutePrefetch.mjs';
import { isMenuBackgroundRead, MENU_PATCH_ARCHIVE } from './helpers/menuBackgroundReads.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const placeholder = readFileSync(new URL('../public/arena-logo-icon.webp', import.meta.url));
const hero = { hero: {
  dbfId: 57944, cardId: 'TB_BaconShop_HERO_16', name: 'А. Ф. Ка',
  image: 'https://hearthpulse.net/assets/og-preview.png',
  heroPower: { name: 'Прокрастинация', text: 'Пропустите первые два хода.',
    image: 'https://hearthpulse.net/assets/og-preview.png' },
  privateMetric: 'PRIVATE_HERO_STATISTICS',
},
// The open statistics (base range). The closed marks ride in as an upstream mistake would: extra fields at every level.
stats: {
  mmr: 'TOP_50_PERCENT', updatedAt: '2026-11-18T17:01:18.000Z', source: 'HSReplay',
  topRange: 'SENTINEL_TOP_1_PERCENT_4.4321',
  modes: {
    solo: { tier: 'S', avgPlacement: 3.57, top4Rate: 61.4, pickRate: 12.3, bestComposition: 'Нежить', keyMinions: ['Падальщик', 'Скелет'],
      rank: 2, of: 110, placementDistribution: ['SENTINEL_PLACE_12.3456'], adjustedAvgPlacement: 'SENTINEL_ADJUSTED_3.9876' },
    duos: { tier: 'A', avgPlacement: 3.9, top4Rate: null, pickRate: 9.8, bestComposition: null, keyMinions: [],
      rank: 14, of: 108, compositions: [{ name: 'SENTINEL_COMPOSITION_METRICS' }], history: ['SENTINEL_PATCH_HISTORY'] },
  },
} };
const CLOSED_MARKS = ['PRIVATE_HERO_STATISTICS', 'SENTINEL_TOP_1_PERCENT', 'SENTINEL_PLACE', 'SENTINEL_ADJUSTED', 'SENTINEL_COMPOSITION_METRICS', 'SENTINEL_PATCH_HISTORY'];

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
    if (isMenuBackgroundRead(pathname)) { response.end(JSON.stringify(MENU_PATCH_ARCHIVE)); return; }
    if (pathname.startsWith('/api/')) { response.writeHead(401).end('{"error":"guest"}'); return; }
    response.writeHead(204).end();
  });
  const legacyOrigin = await listenLocal(legacy);
  const reservation = http.createServer(); const nextOrigin = await listenLocal(reservation); await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', RUNTIME_CLIENT_CONFIG_FILE: '', LEGACY_WEB_ORIGIN: legacyOrigin },
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
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
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
    page.on('requestfailed', request => { if (!isAbortedRoutePrefetch(request)) failed.push(request.url()); });
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
        sections: [...document.querySelectorAll('.bg-hero-public h2')].map(node => node.textContent?.trim()),
        lock: Boolean(document.querySelector('.paywalled-hero button')),
        overflow: document.documentElement.scrollWidth > innerWidth,
        violations: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
          .violations.map(violation => violation.id),
      }));
      assert.deepEqual(state.h1, ['А. Ф. Ка']);
      assert.equal(state.main, 1);
      assert.equal(state.overflow, false);
      assert.deepEqual(state.violations, []);
      assert.equal(state.canonical, 'https://hearthpulse.net/heroes/57944/');
      for (const mark of CLOSED_MARKS) assert.equal(state.html.includes(mark), false, `${mark} reached the guest's DOM (HTML or RSC payload)`);
      // The open statistics are the page's content, there without waiting for a script, and nothing shifts.
      assert.deepEqual(state.sections, ['Сила героя', 'Статистика героя — Соло', 'Статистика героя — Дуо']);
      assert.equal(state.lock, true, 'the paid part is a lock button, not data');
    }
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(protectedCalls, []);
    // The raw server HTML (what a robot reads): data, one JSON-LD with the closed part named, no closed value anywhere.
    const raw = await (await fetch(`${origin}/heroes/57944/`)).text();
    for (const text of ['Тир', 'Среднее место', '3,57', '61,4%', 'Нежить', 'Падальщик, Скелет', '2 из 110', 'HSReplay', 'Прокрастинация']) {
      assert.ok(raw.includes(text), `the server HTML has «${text}»`);
    }
    assert.match(raw, /content="index, follow/);
    for (const mark of CLOSED_MARKS) assert.equal(raw.includes(mark), false, `${mark} is not in the server HTML`);
    const rawGraph = JSON.parse([...raw.matchAll(/<script\b(?=[^>]*type="application\/ld\+json")(?=[^>]*data-server-entity-jsonld)[^>]*>([\s\S]*?)<\/script>/g)][0][1])['@graph'];
    const dataset = rawGraph.find(node => node['@type'] === 'Dataset');
    assert.equal(dataset.isAccessibleForFree, false);
    assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-hero' });
    assert.ok(raw.includes('class="paywalled-hero"'), 'the selector names a real element');
    assert.equal(JSON.stringify(rawGraph).includes('SENTINEL'), false);
    const callsBeforeSpoof = publicCalls;
    const spoofed = await fetch(`${origin}/heroes/57944/`, { headers: {
      'x-hearthpulse-bg-public-projection': `v1:${Buffer.from('{"hero":{}}').toString('base64url')}`,
    } });
    assert.equal(spoofed.status, 200);
    const spoofedHtml = await spoofed.text();
    assert.match(spoofedHtml, /А\. Ф\. Ка/);
    const heroJsonLd = [...spoofedHtml.matchAll(/<script\b(?=[^>]*type="application\/ld\+json")(?=[^>]*data-server-entity-jsonld)[^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(heroJsonLd.length, 1, 'hero HTML contains one server entity JSON-LD script');
    assert.ok(JSON.parse(heroJsonLd[0][1])['@graph'].some(node => node.identifier === 57944
      && node.url === 'https://hearthpulse.net/heroes/57944/'));
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
