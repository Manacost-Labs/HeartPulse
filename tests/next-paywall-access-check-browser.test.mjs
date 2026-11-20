import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import { createBattlegroundLibrarySeoRouter } from '../server/battlegroundLibrarySeoRoutes.ts';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { fetchImpl as libraryFixtureFetch, slug as librarySlug } from './helpers/battlegroundLibraryOpenFixture.ts';

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
// A 3:4 picture like a hero's portrait (the page reserves 180x240 for it).
const PLACEHOLDER_IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="240" viewBox="0 0 180 240"><rect width="180" height="240" fill="#b68a4f"/></svg>';

// The open answer of `GET /api/bg/heroes/public/:dbfId`: identity and the hero's row in the base range.
const openHero = {
  hero: { dbfId: 57944, cardId: 'TB_BaconShop_HERO_16', name: 'А. Ф. Ка', image: 'https://hearthpulse.net/assets/og-preview.png',
    heroPower: { name: 'Прокрастинация', text: 'Пропустите первые два хода.', image: 'https://hearthpulse.net/assets/og-preview.png' } },
  stats: { mmr: 'TOP_50_PERCENT', updatedAt: '2026-11-18T17:01:18.000Z', source: 'HSReplay', modes: {
    solo: { tier: 'S', avgPlacement: 3.57, top4Rate: 61.4, pickRate: 12.3, bestComposition: 'Нежить', keyMinions: ['Падальщик'], rank: 2, of: 110 },
    duos: { tier: 'A', avgPlacement: 3.9, top4Rate: null, pickRate: 9.8, bestComposition: null, keyMinions: [], rank: 14, of: 108 } } },
};
const guardedCatalog = { ok: true, fetched_at: '2026-11-18T17:01:18.663Z', view: { heroes: [] } };

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
// The open projection `GET /api/bg/tier-lists/public` as Express answers it (six builds), served as it is.
const openBuilds = list => ({
  list, updatedAt: '2026-11-19T06:00:17.742Z', source: list === 'compositions' ? 'HSReplay' : 'Firestone',
  builds: Array.from({ length: 6 }, (_, index) => ({
    key: `fixture-${index}`, tier: 'SSAABB'[index], title: `Сборка ${index}`, description: `Условия ${index}`, difficulty: 'Средняя', archetype: `Архетип ${index}`,
    avgPlacement: list === 'strategies' ? 3.2 + index / 10 : null, popularity: null,
    coreCards: [{ dbfId: 2000 + index, cardId: `BG_FIXTURE_${index}`, name: `Существо ${index}`, image: null }], additionalCards: [],
  })),
});

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
      // /standard/vicious-gold/ is open now (#656): the tier builder is the page that still gates.
      for (const path of ['/battlegrounds/tier-builder/']) {
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
    // The tier list's open view has the same root: the paid one is the view inside `.arena-paid-view`.
    for (const [path, root] of [['/battlegrounds/tier-list/', '.arena-paid-view .bg-tier-list-page'], ['/library/', '.bg-library-page']]) {
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
      if (html.includes('battleground-hero-card')) break;
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
        // Cards of the open ranking: the subscriber's paid view has the same cards inside `.arena-paid-view`.
        const openCards = '.battleground-hero-card:not(.arena-paid-view .battleground-hero-card)';
        const rows = () => page.evaluate(selector => document.querySelectorAll(selector).length, openCards);
        assert.equal(await rows(), 6, 'the open ranking is in the first paint');
        assert.equal(await page.$('.arena-paywall-pending'), null, 'no placeholder while access is checked');
        assert.equal(await page.$('.arena-paywall'), null, 'no gate for a visitor of an open page');
        if (subscriber) {
          await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/api/subscription/status')), { timeout: 10_000 });
          await delay(1200);
          // Access is confirmed, the chunk is still on its way: the ranking has not been replaced by a placeholder.
          const state = await page.evaluate(selector => ({ rows: document.querySelectorAll(selector).length, paid: !!document.querySelector('.arena-paid-view'),
            pending: !!document.querySelector('.arena-paywall-pending'), text: document.querySelector('main')?.innerText.slice(0, 200) }), openCards);
          assert.equal(state.rows, 6, `the ranking stays until the paid view has loaded: ${JSON.stringify(state)}`);
          assert.equal(await page.$('.arena-paywall-pending'), null, 'no placeholder while the paid view loads');
          assert.ok(held > 0, 'the chunk of the paid view was held back (the scenario is real)');
          await page.waitForSelector('.arena-paid-view', { timeout: 15_000 });
          assert.equal(await rows(), 0, 'the ranking is replaced, not doubled');
        } else {
          await page.waitForSelector('.paywalled-heroes button.bg-heroes-locked', { timeout: 10_000 });
        }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const total = (await page.evaluate(() => window.__layoutShifts)).reduce((sum, value) => sum + value, 0);
        assert.ok(total < 0.01, `${subscriber ? 'subscriber' : 'guest'} at ${viewport.width}px shifted by ${total.toFixed(3)}`);
        await page.close();
      }
    }
    // The address survives the open view: a guest keeps a locked range and the table in it (the range stays
    // «Топ 50%» on screen, the table's closed cells are locks), and a subscriber's view that replaces the open
    // one opens on the range the address asked for.
    const guest = await browser.newPage();
    // The browser keeps the cookies of the pages above: the guest must not carry the subscriber's.
    await guest.deleteCookie({ name: 'pending_reader', url: frontOrigin });
    await guest.goto(`${frontOrigin}/heroes/?mmr=TOP_5_PERCENT&view=table`, { waitUntil: 'networkidle2' });
    await guest.waitForSelector('.bg-hero-ledger__locked', { timeout: 10_000 });
    const guestState = await guest.evaluate(() => ({ search: location.search,
      pressed: [...document.querySelectorAll('.bg-heroes-control-group--mmr button[aria-pressed="true"]')].map(button => button.textContent) }));
    assert.match(guestState.search, /mmr=TOP_5_PERCENT/, `the locked range stays in the address: ${guestState.search}`);
    assert.match(guestState.search, /view=table/);
    assert.deepEqual(guestState.pressed, ['Топ 50%'], 'a guest sees the open range');
    await guest.close();
    const reader = await browser.newPage();
    await reader.setCookie({ name: 'pending_reader', value: '1', url: frontOrigin });
    await reader.goto(`${frontOrigin}/heroes/?mmr=TOP_5_PERCENT`, { waitUntil: 'domcontentloaded' });
    await reader.waitForSelector('.arena-paid-view', { timeout: 15_000 });
    await reader.waitForFunction(() => [...document.querySelectorAll('.arena-paid-view .bg-heroes-control-group--mmr button[aria-pressed="true"]')]
      .map(button => button.textContent).join() === 'Топ 5%', { timeout: 10_000 });
    assert.match(await reader.evaluate(() => location.search), /mmr=TOP_5_PERCENT/);
    await reader.close();
    await closeLocal(front);
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});

// /heroes/<id>/ has open statistics: nobody waits behind a placeholder or a gate. A guest and a subscriber whose
// access is still being checked get the server-rendered figures and the lock at once; a confirmed subscriber keeps
// the figures on screen until the paid view's chunk has loaded (here it arrives late), and the view then replaces
// them in one render, without a layout shift.
test('/heroes/<id>/ shows the open statistics without a placeholder and keeps them until the paid view has loaded', async () => {
  const legacy = express();
  legacy.get('/api/bg/heroes/public/57944', (_request, response) => response.json(openHero));
  legacy.use((_request, response) => response.status(401).end());
  const legacyServer = legacy.listen(0, '127.0.0.1');
  let next; let gateway; let browser;
  try {
    await new Promise(done => legacyServer.once('listening', done));
    next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
      env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
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
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) window.__layoutShifts.push({ value: entry.value, sources: entry.sources.map(source => source.node?.className?.toString?.() ?? source.node?.nodeName ?? '') });
            }
          }).observe({ type: 'layout-shift', buffered: true });
        });
        // The paid view's chunk arrives late: the script that holds the Battlegrounds view (found by a string only it has) waits.
        let held = 0;
        await page.setRequestInterception(true);
        page.on('request', request => {
          // The hero's picture lives on the public origin: a placeholder stands in, so a failing download cannot move the page.
          if (request.url().startsWith('https://hearthpulse.net/assets/')) return void request.respond({ status: 200, contentType: 'image/svg+xml', body: PLACEHOLDER_IMAGE }).catch(() => {});
          if (!subscriber || request.resourceType() !== 'script') return void request.continue().catch(() => {});
          void fetch(request.url()).then(async answer => {
            const body = await answer.text();
            if (body.includes('API героев временно недоступен')) { held += 1; await delay(4000); }
            await request.respond({ status: 200, contentType: 'application/javascript', body });
          }).catch(() => request.continue().catch(() => {}));
        });
        await page.goto(`${frontOrigin}/heroes/57944/`, { waitUntil: 'domcontentloaded' });
        const rows = () => page.evaluate(() => document.querySelectorAll('#hero-solo dl > div').length);
        assert.ok(await rows() >= 6, 'the open statistics are in the first paint');
        assert.equal(await page.$('.arena-paywall-pending'), null, 'no placeholder while access is checked');
        assert.equal(await page.$('.arena-paywall'), null, 'no gate for a visitor of an open page');
        if (subscriber) {
          await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/api/subscription/status')), { timeout: 10_000 });
          await delay(1200);
          // Access is confirmed, the chunk is still on its way: the ranking has not been replaced by a placeholder.
          const state = await page.evaluate(() => ({ rows: document.querySelectorAll('#hero-solo dl > div').length, paid: !!document.querySelector('.arena-paid-view'),
            pending: !!document.querySelector('.arena-paywall-pending'), text: document.querySelector('main')?.innerText.slice(0, 200) }));
          assert.ok(state.rows >= 6, `the statistics stay until the paid view has loaded: ${JSON.stringify(state)}`);
          assert.equal(await page.$('.arena-paywall-pending'), null, 'no placeholder while the paid view loads');
          assert.ok(held > 0, 'the chunk of the paid view was held back (the scenario is real)');
          await page.waitForSelector('.arena-paid-view', { timeout: 15_000 });
          assert.equal(await rows(), 0, 'the statistics are replaced, not doubled');
        } else {
          await page.waitForSelector('.paywalled-hero button', { timeout: 10_000 });
        }
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const shifts = await page.evaluate(() => window.__layoutShifts);
        const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
        assert.ok(total < 0.01, `${subscriber ? 'subscriber' : 'guest'} at ${viewport.width}px shifted by ${total.toFixed(3)}: ${JSON.stringify(shifts)}`);
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

// The library has an open layer too (`/library/minions/` the list, `/library/minions/<slug>-<id>/` the card): nobody waits
// behind a placeholder or a gate; a confirmed subscriber keeps the open layer on screen until the paid view's chunk has
// loaded (here it arrives late), and the view then replaces it in one render, without a layout shift.
test('the library keeps its open layer until the paid view has loaded, without a layout shift', async () => {
  const legacy = express();
  legacy.use(createBattlegroundLibrarySeoRouter({ fetchImpl: libraryFixtureFetch, auxiliaryCatalogBaseUrl: 'https://api.example.test/api/v1', onError: () => undefined }));
  legacy.use((_request, response) => response.status(401).end());
  const legacyServer = legacy.listen(0, '127.0.0.1');
  let next; let gateway; let browser; let front;
  try {
    await new Promise(done => legacyServer.once('listening', done));
    next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
      env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
    gateway = await startGateway(next.origin);
    gateway.server.removeAllListeners('request');
    front = http.createServer((request, response) => {
      const subscriber = /(?:^|;\s*)pending_reader=1/.test(request.headers.cookie ?? '');
      const json = payload => response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(payload));
      if (request.url === '/api/auth/me') return void setTimeout(() => json({ user: subscriber ? SUBSCRIBER : null }), SESSION_DELAY_MS);
      if (subscriber && request.url === '/api/subscription/status') return json(SUBSCRIBED);
      if (subscriber && request.url.startsWith('/api/bg/library/') && !request.url.startsWith('/api/bg/library/public/')) return json({ data: [], meta: {} });
      if (request.url.startsWith('/api/bg/library/public/')) {
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
    const pages = [
      ['/library/minions/', '[data-library-card-tile]', 4, '.bg-library-control-locked'],
      [`/library/minions/${librarySlug('Первый зверь')}-1001/`, '#card-facts dt', 5, '.bg-library-locks button'],
    ];
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
      for (const [path, openSelector, openCount, lockSelector] of pages) {
        for (const subscriber of [false, true]) {
          const page = await browser.newPage();
          await page.setViewport(viewport);
          // The browser keeps the cookie between pages: a guest page must not inherit the previous subscriber's.
          if (subscriber) await page.setCookie({ name: 'pending_reader', value: '1', url: frontOrigin });
          else await page.deleteCookie({ name: 'pending_reader', url: frontOrigin });
          await page.evaluateOnNewDocument(() => {
            window.__layoutShifts = [];
            new PerformanceObserver(list => {
              for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__layoutShifts.push(entry.value);
            }).observe({ type: 'layout-shift', buffered: true });
          });
          // The paid part arrives late: the script that holds it (found by a string only it has: the version of the
          // protected catalog's reads for the listing, the class list of the card page for the card) waits.
          let held = 0;
          await page.setRequestInterception(true);
          page.on('request', request => {
            if (!subscriber || request.resourceType() !== 'script') return void request.continue().catch(() => {});
            void fetch(request.url()).then(async answer => {
              const body = await answer.text();
              if (['bg-library-20260923-pool-3661', 'bg-library-detail-page space-y-6'].some(marker => body.includes(marker))) { held += 1; await delay(4000); }
              await request.respond({ status: 200, contentType: 'application/javascript', body });
            }).catch(() => request.continue().catch(() => {}));
          });
          await page.goto(`${frontOrigin}${path}`, { waitUntil: 'domcontentloaded' });
          // The open layer outside the paid view (the listing's paid view shows the same tiles, seeded with the open cards).
          const count = () => page.evaluate(selector => [...document.querySelectorAll(selector)].filter(node => !node.closest('.arena-paid-view')).length, openSelector);
          assert.equal(await count(), openCount, `${path}: the open layer is in the first paint`);
          assert.equal(await page.$('.arena-paywall-pending'), null, 'no placeholder while access is checked');
          assert.equal(await page.$('.arena-paywall'), null, 'no gate for a visitor of an open page');
          if (subscriber) {
            await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/api/subscription/status')), { timeout: 10_000 });
            await delay(1200);
            // Access is confirmed, the chunk is still on its way: the open layer has not been replaced by a placeholder.
            assert.equal(await count(), openCount, `${path}: the open layer stays until the paid view has loaded`);
            assert.equal(await page.$('.arena-paywall-pending'), null, 'no placeholder while the paid view loads');
            assert.ok(held > 0, 'the chunk of the paid view was held back (the scenario is real)');
            await page.waitForSelector('.arena-paid-view', { timeout: 15_000 });
            assert.equal(await count(), 0, 'the open layer is replaced, not doubled');
          } else {
            await page.waitForSelector(lockSelector, { timeout: 10_000 });
          }
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const total = (await page.evaluate(() => window.__layoutShifts)).reduce((sum, value) => sum + value, 0);
          assert.ok(total < 0.01, `${path} ${subscriber ? 'subscriber' : 'guest'} at ${viewport.width}px shifted by ${total.toFixed(3)}`);
          await page.close();
        }
      }
    }
  } finally {
    // The proxy is closed even when an assertion fails, or the test file hangs until the CI timeout.
    if (front) await closeLocal(front);
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (next) await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});

// The tier list and the strategies page have open builds: nobody waits behind a placeholder or a gate. A guest and
// a subscriber whose access is still being checked get the server-rendered list and the closed-part note at once;
// a confirmed subscriber keeps the list on screen until the paid view's chunk has loaded (here it arrives late),
// and the view then replaces it in one render, without a layout shift.
test('the builds pages show the open list without a placeholder and keep it until the paid view has loaded', async () => {
  const legacy = express();
  legacy.get('/api/bg/tier-lists/public', (request, response) => response.json(openBuilds(request.query.list)));
  legacy.use((_request, response) => response.status(401).end());
  const legacyServer = legacy.listen(0, '127.0.0.1');
  let next; let gateway; let browser; let front;
  try {
    await new Promise(done => legacyServer.once('listening', done));
    next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
      env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
    // The tier list's build copy has no builds (the build has no Express): regenerate it with data.
    for (const path of ['/battlegrounds/tier-list/', '/battlegrounds/strategies/']) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        process.kill(next.pid, 'SIGUSR2');
        const html = await (await fetch(`${next.origin}${path}`)).text();
        if (html.includes('id="build-fixture-0"')) break;
        await delay(250);
      }
    }
    gateway = await startGateway(next.origin);
    gateway.server.removeAllListeners('request');
    front = http.createServer((request, response) => {
      const subscriber = /(?:^|;\s*)pending_reader=1/.test(request.headers.cookie ?? '');
      const json = payload => response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(payload));
      if (request.url === '/api/auth/me') return void setTimeout(() => json({ user: subscriber ? SUBSCRIBER : null }), SESSION_DELAY_MS);
      if (subscriber && request.url === '/api/subscription/status') return json(SUBSCRIBED);
      // nginx serves the painted tier marks in production; here they are a pixel, so the mark has its size and no broken-image box.
      if (request.url.startsWith('/tier-marks/')) return void response.writeHead(200, { 'Content-Type': 'image/png' }).end(PIXEL);
      if (request.url.startsWith('/api/bg/tier-lists/public')) {
        const upstream = http.request({ host: '127.0.0.1', port: legacyServer.address().port, path: request.url },
          answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
        return void upstream.end();
      }
      // The paid view's real request: the list it asked for, with one entry (an empty answer would keep the open list).
      if (subscriber && request.url.startsWith('/api/bg/tier-lists')) return json({ list: new URL(request.url, 'http://x').searchParams.get('list'), count: 1,
        tiers: { S: [{ key: 'fx', title: 'Фикстура', name: 'Фикстура', tier: 'S', dbfId: 1 }], A: [], B: [], C: [], D: [] } });
      if (request.url.startsWith('/api/')) return void response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"guest"}');
      const upstream = http.request(new URL(next.origin), { method: request.method, path: request.url, headers: request.headers },
        answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
      return void request.pipe(upstream);
    });
    const frontOrigin = await listenLocal(front);
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const path of ['/battlegrounds/tier-list/', '/battlegrounds/strategies/']) {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
        for (const subscriber of [false, true]) {
          const page = await browser.newPage();
          await page.setViewport(viewport);
          // The browser keeps the cookie between pages: a guest page must not inherit the previous subscriber's.
          if (subscriber) await page.setCookie({ name: 'pending_reader', value: '1', url: frontOrigin });
          else await page.deleteCookie({ name: 'pending_reader', url: frontOrigin });
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
          await page.goto(`${frontOrigin}${path}`, { waitUntil: 'domcontentloaded' });
          // The open builds: the strategy cards of the tier list's open view, the open list of the strategies page.
          const openBuild = path.includes('tier-list') ? '.bg-tierlist-strategy' : '.bg-builds-public article';
          const articles = () => page.evaluate(selector => [...document.querySelectorAll(selector)].filter(node => !node.closest('.arena-paid-view')).length, openBuild);
          assert.equal(await articles(), 6, `${path}: the open builds are in the first paint`);
          assert.equal(await page.$('.arena-paywall-pending'), null, 'no placeholder while access is checked');
          assert.equal(await page.$('.arena-paywall'), null, 'no gate for a visitor of an open page');
          if (subscriber) {
            await page.waitForFunction(() => performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/api/subscription/status')), { timeout: 10_000 });
            await delay(1200);
            // Access is confirmed, the chunk is still on its way: the list has not been replaced by a placeholder.
            const state = await page.evaluate(selector => ({ articles: [...document.querySelectorAll(selector)].filter(node => !node.closest('.arena-paid-view')).length,
              pending: !!document.querySelector('.arena-paywall-pending'), text: document.querySelector('main')?.innerText.slice(0, 200) }), openBuild);
            assert.equal(state.articles, 6, `${path}: the list stays until the paid view has loaded: ${JSON.stringify(state)}`);
            assert.equal(await page.$('.arena-paywall-pending'), null, 'no placeholder while the paid view loads');
            assert.ok(held > 0, 'the chunk of the paid view was held back (the scenario is real)');
            await page.waitForSelector('.arena-paid-view', { timeout: 15_000 });
            // The paid view is mounted hidden; it replaces the list once the data it asked for has come back.
            if (path.includes('tier-list')) await page.waitForFunction(() => ![...document.querySelectorAll('.bg-tierlist-strategy')].some(node => !node.closest('.arena-paid-view')), { timeout: 10_000 });
            assert.equal(await articles(), 0, 'the list is replaced, not doubled');
            assert.equal(await page.$$eval('h1', nodes => nodes.filter(node => node.getClientRects().length > 0).length), 1, `${path}: a subscriber sees exactly one H1`);
          } else {
            // The closed part: the tier list's locked tabs, the strategies page's note and button.
            await page.waitForSelector(path.includes('tier-list') ? '.paywalled-builds.bg-tierlist-tab--locked' : '.bg-builds-locks button', { timeout: 10_000 });
          }
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const total = (await page.evaluate(() => window.__layoutShifts)).reduce((sum, value) => sum + value, 0);
          assert.ok(total < 0.01, `${path} ${subscriber ? 'subscriber' : 'guest'} at ${viewport.width}px shifted by ${total.toFixed(3)}`);
          await page.close();
        }
      }
    }
    // A closed list in the address (`?list=spells`): a guest gets the offer once there is no access; a subscriber
    // still being checked never sees it, the list stays in the address for the paid view.
    for (const subscriber of [false, true]) {
      const page = await browser.newPage();
      // The browser keeps the cookies of the pages above: a guest must not carry the subscriber's.
      if (subscriber) await page.setCookie({ name: 'pending_reader', value: '1', url: frontOrigin });
      else await page.deleteCookie({ name: 'pending_reader', url: frontOrigin });
      const offers = [];
      await page.exposeFunction('__offerSeen', () => offers.push(Date.now()));
      await page.evaluateOnNewDocument(() => {
        new MutationObserver(() => { if (document.querySelector('.arena-inline-paywall')) window.__offerSeen?.(); })
          .observe(document, { childList: true, subtree: true });
      });
      await page.goto(`${frontOrigin}/battlegrounds/tier-list/?list=spells`, { waitUntil: 'domcontentloaded' });
      if (subscriber) {
        await page.waitForSelector('.arena-paid-view', { timeout: 15_000 });
        await delay(500);
        assert.deepEqual(offers, [], 'a subscriber never sees the offer of a closed list in the address');
        assert.match(await page.evaluate(() => location.search), /list=spells/);
      } else {
        await page.waitForSelector('.arena-inline-paywall', { timeout: 10_000 });
      }
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway.server);
    if (front) await closeLocal(front);
    if (next) await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});
