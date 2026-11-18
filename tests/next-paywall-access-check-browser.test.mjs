import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// The open projection `GET /api/bg/heroes/public` as Express answers it (six ranked heroes), served as it is.
const openRanking = mode => ({
  mode, mmr: 'TOP_50_PERCENT', updatedAt: '2026-11-18T17:01:18.663Z', source: 'HSReplay',
  heroes: Array.from({ length: 6 }, (_, index) => ({
    dbfId: 1000 + index, cardId: `BG_FIXTURE_HERO_${index}`, name: `Герой ${index}`, image: null, tier: 'ABCCDD'[index],
    avgPlacement: 3.2 + index * 0.4, top4Rate: mode === 'duos' ? null : 49.5, pickRate: 10 + index,
    heroPowerName: `Сила ${index}`, bestComposition: null, keyMinions: [],
  })),
});
// The subscriber's paid view reads the guarded catalog; its content does not matter here.
const guardedCatalog = { ok: true, fetched_at: '2026-11-18T17:01:18.663Z', view: { heroes: [] } };

// The session check answers late, as it does on a phone after the scripts
// download, so the access check is still pending when the page has painted.
const SESSION_DELAY_MS = 1200;

const SUBSCRIBER = { id: 'pending-reader', email: 'reader@example.test', name: 'Игрок', role: 'user' };
const SUBSCRIBED = { hasAccess: true, entitlements: { battlegrounds: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: {}, patreon: {}, telegram: {} };

async function startGateway(nextOrigin) {
  const next = new URL(nextOrigin);
  const server = http.createServer((request, response) => {
    const subscriber = /(?:^|;\s*)pending_reader=1/.test(request.headers.cookie ?? '');
    const json = payload => response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      .end(JSON.stringify(payload));
    if (request.url === '/api/auth/me') {
      setTimeout(() => json({ user: subscriber ? SUBSCRIBER : null }), SESSION_DELAY_MS);
      return;
    }
    if (subscriber && request.url === '/api/subscription/status') return json(SUBSCRIBED);
    if (subscriber && request.url.startsWith('/api/bg/tier-lists')) {
      return json({ list: 'heroes', count: 0, tiers: { S: [], A: [], B: [], C: [], D: [] } });
    }
    if (request.url.startsWith('/api/')) {
      response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"guest"}');
      return;
    }
    const upstream = http.request(next, { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  return { server, origin: await listenLocal(server) };
}

// While the access check runs, the gated pages hold the gate's height, so the
// gate (or a subscriber's page) replaces the placeholder without moving the
// footer. Before, the footer jumped by about 760 px: CLS 0.12-0.48.
test('gated pages keep the gate height while the access check runs', async () => {
  // Server loaders read only anonymous projections; every one answers "unavailable".
  const express = http.createServer((request, response) => response.writeHead(401).end());
  let next; let gateway; let browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(express) });
    gateway = await startGateway(next.origin);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const viewports = [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }];
    for (const viewport of viewports) {
      for (const path of ['/library/', '/battlegrounds/tier-list/', '/battlegrounds/strategies/', '/guides-archive/',
        '/standard/matchups/', '/standard/vicious-gold/']) {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        await page.evaluateOnNewDocument(() => {
          window.__layoutShifts = [];
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) window.__layoutShifts.push({ value: entry.value,
                sources: entry.sources.map(source => source.node?.className?.toString?.() ?? '') });
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });
        await page.goto(`${gateway.origin}${path}`, { waitUntil: 'domcontentloaded' });
        const pending = await page.waitForSelector('.arena-paywall-pending', { timeout: 10_000 }).catch(() => null);
        assert.ok(pending, `${path} must render the reserved placeholder while access is checked`);
        assert.equal(await page.$('.arena-paywall'), null, `${path} must not show the gate before the check ends`);
        // No locked preview either: a subscriber would see it, and so would the cached server HTML.
        assert.equal(await page.evaluate(() => document.body.textContent.includes('Раздел подписчиков')), false,
          `${path} must not show the subscribers' preview while access is checked`);
        await page.waitForSelector('.arena-paywall .arena-paywall__dialog', { timeout: 10_000 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const shifts = await page.evaluate(() => window.__layoutShifts);
        const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
        assert.ok(total < 0.01, `${path} at ${viewport.width}px shifted by ${total.toFixed(3)}: ${JSON.stringify(shifts)}`);
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(express);
  }
});

// A remembered session downloads the paid view during the access check, so a
// subscriber gets it in the render that confirms access: no loading state in
// between and no reveal delay (a Suspense boundary held it back ~300 ms).
test('a remembered subscriber gets the preloaded paid view as soon as access is confirmed', async () => {
  const express = http.createServer((request, response) => response.writeHead(401).end());
  let next; let gateway; let browser;
  try {
    next = await startNextServer({ legacyOrigin: await listenLocal(express) });
    gateway = await startGateway(next.origin);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const [path, root] of [['/battlegrounds/tier-list/', '.bg-tier-list-page'], ['/library/', '.bg-library-page']]) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.setCookie({ name: 'pending_reader', value: '1', url: gateway.origin });
      await page.evaluateOnNewDocument(selector => {
        localStorage.setItem('hs_arena_auth_cookie_hint', '1');
        window.__paid = { loadingShown: false, at: 0 };
        new MutationObserver(() => {
          if (document.body?.textContent.includes('Загружаем раздел')) window.__paid.loadingShown = true;
          if (!window.__paid.at && document.querySelector(selector)) window.__paid.at = performance.now();
        }).observe(document, { childList: true, subtree: true, characterData: true });
      }, root);
      await page.goto(`${gateway.origin}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(root, { timeout: 10_000 });
      const timing = await page.evaluate(() => {
        const status = performance.getEntriesByType('resource').find(entry => entry.name.endsWith('/api/subscription/status'));
        return { ...window.__paid, statusEnd: status?.responseEnd ?? null,
          paidCss: [...document.styleSheets].some(sheet => {
            try { return [...sheet.cssRules].some(rule => rule.cssText.includes('.bg-hero-ledger')); } catch { return false; }
          }) };
      });
      assert.equal(timing.loadingShown, false, `${path} must not show the loading state when the view is preloaded`);
      assert.ok(timing.statusEnd && timing.at - timing.statusEnd < 200,
        `${path} paid view ${Math.round(timing.at - timing.statusEnd)} ms after access was confirmed`);
      assert.equal(timing.paidCss, true, `${path} must load the paid view's stylesheet with it`);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    await closeLocal(express);
  }
});

// /heroes/ has an open ranking: nobody waits behind a placeholder or a gate. A guest and a subscriber whose
// access is still being checked get the server-rendered tables and the locked ranges at once; a confirmed
// subscriber keeps the tables on screen until the paid view's chunk has loaded (here it arrives late), and the
// view then replaces them in one render, without a layout shift.
test('/heroes/ shows the open ranking without a placeholder and keeps it until the paid view has loaded', async () => {
  const legacy = express();
  legacy.get('/api/bg/heroes/public', (request, response) => response.json(openRanking(request.query.mode === 'duos' ? 'duos' : 'solo')));
  legacy.use((_request, response) => response.status(401).end());
  const legacyServer = legacy.listen(0, '127.0.0.1');
  let next; let gateway; let browser;
  try {
    await new Promise(done => legacyServer.once('listening', done));
    next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
      env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
    // The build copy has no ranking (the build has no Express): regenerate it with data.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      const html = await (await fetch(`${next.origin}/heroes/`)).text();
      if (html.includes('id="heroes-solo"')) break;
      await delay(250);
    }
    gateway = await startGateway(next.origin);
    // Heroes catalog for the subscriber's paid view and the open projection for everyone.
    gateway.server.removeAllListeners('request');
    const front = http.createServer((request, response) => {
      const subscriber = /(?:^|;\s*)pending_reader=1/.test(request.headers.cookie ?? '');
      const json = payload => response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(payload));
      if (request.url === '/api/auth/me') return void setTimeout(() => json({ user: subscriber ? SUBSCRIBER : null }), SESSION_DELAY_MS);
      if (subscriber && request.url === '/api/subscription/status') return json(SUBSCRIBED);
      if (subscriber && request.url.startsWith('/api/bg/heroes?')) return json(guardedCatalog);
      if (request.url.startsWith('/api/bg/heroes/public')) {
        const upstream = http.request({ host: '127.0.0.1', port: legacyServer.address().port, path: request.url },
          answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
        return void upstream.end();
      }
      if (request.url.startsWith('/api/')) return void response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"guest"}');
      const upstream = http.request(new URL(next.origin), { method: request.method, path: request.url, headers: request.headers },
        answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
      return void request.pipe(upstream);
    });
    const frontOrigin = await listenLocal(front);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
      for (const subscriber of [false, true]) {
        const page = await browser.newPage();
        await page.setViewport(viewport);
        if (subscriber) await page.setCookie({ name: 'pending_reader', value: '1', url: frontOrigin });
        await page.evaluateOnNewDocument(() => {
          window.__layoutShifts = [];
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__layoutShifts.push(entry.value);
          }).observe({ type: 'layout-shift', buffered: true });
        });
        // The paid view's chunk arrives late: the script that holds the Battlegrounds view (found by a string only it has) waits.
        let held = 0;
        await page.setRequestInterception(true);
        page.on('request', request => {
          if (!subscriber || request.resourceType() !== 'script') return void request.continue().catch(() => {});
          void fetch(request.url()).then(async answer => {
            const body = await answer.text();
            if (body.includes('API героев временно недоступен')) { held += 1; await delay(4000); }
            await request.respond({ status: 200, contentType: 'application/javascript', body });
          }).catch(() => request.continue().catch(() => {}));
        });
        await page.goto(`${frontOrigin}/heroes/`, { waitUntil: 'domcontentloaded' });
        const rows = () => page.evaluate(() => document.querySelectorAll('#heroes-solo tbody tr').length);
        assert.equal(await rows(), 6, 'the open ranking is in the first paint');
        assert.equal(await page.$('.arena-paywall-pending'), null, 'no placeholder while access is checked');
        assert.equal(await page.$('.arena-paywall'), null, 'no gate for a visitor of an open page');
        if (subscriber) {
          await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/api/subscription/status')), { timeout: 10_000 });
          await delay(1200);
          // Access is confirmed, the chunk is still on its way: the ranking has not been replaced by a placeholder.
          const state = await page.evaluate(() => ({ rows: document.querySelectorAll('#heroes-solo tbody tr').length, paid: !!document.querySelector('.arena-paid-view'),
            pending: !!document.querySelector('.arena-paywall-pending'), text: document.querySelector('main')?.innerText.slice(0, 200) }));
          assert.equal(state.rows, 6, `the ranking stays until the paid view has loaded: ${JSON.stringify(state)}`);
          assert.equal(await page.$('.arena-paywall-pending'), null, 'no placeholder while the paid view loads');
          assert.ok(held > 0, 'the chunk of the paid view was held back (the scenario is real)');
          await page.waitForSelector('.arena-paid-view', { timeout: 15_000 });
          assert.equal(await rows(), 0, 'the ranking is replaced, not doubled');
        } else {
          await page.waitForSelector('.bg-heroes-locks button', { timeout: 10_000 });
        }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const total = (await page.evaluate(() => window.__layoutShifts)).reduce((sum, value) => sum + value, 0);
        assert.ok(total < 0.01, `${subscriber ? 'subscriber' : 'guest'} at ${viewport.width}px shifted by ${total.toFixed(3)}`);
        await page.close();
      }
    }
    await closeLocal(front);
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});
