import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createBattlegroundLibrarySeoRouter } from '../server/battlegroundLibrarySeoRoutes.ts';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { catalogCard, catalogs, fetchImpl, slug } from './helpers/battlegroundLibraryOpenFixture.ts';

// The listing view of the library is one component for a guest and a subscriber (`BgLibraryListPage`). This file
// drives it: search (by name and by mechanic), the tavern filter, Duo, «Показать ещё», the step into a card page and
// the archive lock with its offer; and, for a subscriber whose access check and library chunk arrive late, the swap
// from the open cards to the protected catalog keeps what the viewer already set (search, filter, Duo, pages) in the
// same view, without a layout shift.

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const SUBSCRIBER = { id: 'list-reader', email: 'reader@example.test', name: 'Игрок', role: 'user' };
const SUBSCRIBED = { hasAccess: true, entitlements: { battlegrounds: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: {}, patreon: {}, telegram: {} };
const ACCESS_DELAY_MS = 4000;
// The protected catalog's reader is a chunk of its own; this string is only in it (the version of its reads).
const PAID_MARKER = 'bg-library-20260923-pool-3661';
const VENOM = { slug: 'VENOMOUS', name_ru: 'Яд' };
const TRIBES = [['all', 'Общие'], ['aberration', 'Аберрация'], ['undead', 'Нежить'], ['dragon', 'Дракон'], ['mech', 'Механизм'],
  ['murloc', 'Мурлок'], ['demon', 'Демон'], ['quilboar', 'Свинобраз'], ['naga', 'Нага'], ['pirate', 'Пират'], ['beast', 'Зверь'],
  ['elemental', 'Элементаль']].map(([slug, name_ru]) => ({ slug, name_ru }));

// Sixty beasts of tier 2 (two of them Duo-only) and five venomous dragons of tier 4, beside the fixture's four cards.
const beasts = Array.from({ length: 60 }, (_value, index) => catalogCard(5000 + index, `Зверь ${String(index).padStart(2, '0')}`,
  index < 2 ? { duos_only: true } : {}));
const dragons = Array.from({ length: 5 }, (_value, index) => catalogCard(6000 + index, `Дракон ${index}`,
  { tavern_tier: 4, creature_type: { slug: 'dragon', name_ru: 'Дракон' }, mechanics: [VENOM] }));
catalogs['minion:1'] = [...catalogs['minion:1'], ...beasts, ...dragons];
const POOL = catalogs['minion:1'];

const state = page => page.evaluate(() => ({
  tiles: document.querySelectorAll('[data-library-card-tile]').length,
  query: document.querySelector('input[aria-label="Поиск карт"]')?.value,
  tier2: document.querySelector('button[aria-label="Таверна 2"]')?.getAttribute('aria-pressed'),
  duo: document.querySelector('.bg-library-control-duos input')?.checked,
  status: document.querySelector('.bg-library-controls [role="status"]')?.textContent,
  paid: Boolean(document.querySelector('.arena-paid-view')),
  locked: document.querySelectorAll('.bg-library-control-locked').length,
  groups: [...document.querySelectorAll('.bg-library-results h2')].map(node => node.textContent),
  // Heights above the cards, for the message of a layout shift.
  boxes: ['.bg-library-page', '.bg-library-controls', '.bg-library-control-advanced', '.bg-library-active-filters', '.bg-library-quick-mechanics',
    '.bg-library-controls-heading', '.bg-library-results', '#main-content'].map(selector => `${selector}:${Math.round(document.querySelector(selector)?.getBoundingClientRect().height ?? -1)}`).join(' '),
  scroll: Math.round(scrollY),
}));

/** Waits until the view answers a click (hydrated), then leaves the tavern filter as it was. */
async function hydrated(page) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await page.click('button[aria-label="Таверна 5"]');
    if (await page.$eval('button[aria-label="Таверна 5"]', node => node.getAttribute('aria-pressed') === 'true')) {
      await page.click('button[aria-label="Таверна 5"]');
      return;
    }
    await delay(100);
  }
  assert.fail('the listing never hydrated');
}

async function search(page, text) {
  await page.$eval('input[aria-label="Поиск карт"]', node => { node.focus(); node.select(); });
  await page.keyboard.press('Backspace');
  if (text) await page.type('input[aria-label="Поиск карт"]', text);
  await page.waitForFunction(value => document.querySelector('.bg-library-results')?.getAttribute('aria-busy') === 'false'
    && document.querySelector('input[aria-label="Поиск карт"]').value === value, {}, text);
}

async function openAdvanced(page) {
  await page.evaluate(() => document.querySelector('.bg-library-control-advanced')?.setAttribute('open', ''));
}

function startFront(legacyOrigin, nextOrigin, reads) {
  return http.createServer((request, response) => {
    const subscriber = /(?:^|;\s*)list_reader=1/.test(request.headers.cookie ?? '');
    const json = payload => response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(payload));
    if (request.url === '/api/auth/me') return json({ user: subscriber ? SUBSCRIBER : null });
    if (subscriber && request.url === '/api/subscription/status') return void setTimeout(() => json(SUBSCRIBED), ACCESS_DELAY_MS);
    if (subscriber && request.url.startsWith('/api/bg/library/cards')) { reads.push(request.url); return json({ data: POOL }); }
    // The catalog's meta lists every tribe, as production does (the open view lists the same ones, in the same order).
    if (subscriber && request.url.startsWith('/api/bg/library/meta')) return json({ mechanics: [VENOM], creature_types: TRIBES });
    const upstream = request.url.startsWith('/api/bg/library/public/') || request.url.startsWith('/api/public-resource/') ? legacyOrigin
      : request.url.startsWith('/api/') ? null : nextOrigin;
    if (!upstream) return void response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"guest"}');
    const forward = http.request(new URL(upstream), { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    return void request.pipe(forward);
  });
}

test('the library listing behaves the same for a guest and a subscriber, and the swap to the catalog keeps the view', async () => {
  const legacy = express();
  legacy.use('/api/public-resource', (_request, response) => response.type('png').send(PIXEL));
  legacy.use(createBattlegroundLibrarySeoRouter({ fetchImpl, auxiliaryCatalogBaseUrl: 'https://api.example.test/api/v1', onError: () => undefined }));
  const legacyServer = http.createServer(legacy);
  let next; let front; let browser;
  try {
    const legacyOrigin = await listenLocal(legacyServer);
    next = await startNextServer({ legacyOrigin });
    const reads = [];
    front = startFront(legacyOrigin, next.origin, reads);
    const origin = await listenLocal(front);
    for (let attempt = 0; attempt < 40 && !(await (await fetch(`${origin}/library/minions/`)).text()).includes('Зверь 00'); attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      await delay(250);
    }
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });

    // A guest: the same controls work on the open cards.
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${origin}/library/minions/`, { waitUntil: 'networkidle2' });
      await hydrated(page);
      const total = POOL.length - 2;
      let now = await state(page);
      assert.equal(now.tiles, 36, 'the first page of the listing');
      assert.match(now.status, new RegExp(`^${total} найдено · ${POOL.length} загружено`), 'Duo-only cards are hidden by default');
      await search(page, 'Зверь 07');
      assert.equal((await state(page)).tiles, 1, 'the search finds a card by name');
      await search(page, 'яд');
      assert.equal((await state(page)).tiles, 5, 'the search finds the cards of a mechanic (an open fact of the card)');
      await search(page, '');
      await page.click('button[aria-label="Таверна 4"]');
      now = await state(page);
      assert.deepEqual(now.groups.map(text => text.trim()), ['Таверна 4'], 'the tavern filter keeps tier 4 only');
      await page.click('button[aria-label="Таверна 4"]');
      await openAdvanced(page);
      await page.click('.bg-library-control-duos input');
      assert.match((await state(page)).status, new RegExp(`^${POOL.length} найдено`), 'Duo shows the Duo-only cards');
      await page.select('.bg-library-control-advanced select', 'Яд');
      assert.equal((await state(page)).tiles, 5, 'the mechanic filter works on the open cards');
      await page.select('.bg-library-control-advanced select', 'ALL');
      await page.click('button::-p-text(Показать ещё)');
      assert.equal((await state(page)).tiles, POOL.length, '«Показать ещё» adds a page (here the rest of the pool)');
      await page.click('.bg-library-control-locked');
      await page.waitForSelector('.arena-inline-paywall', { visible: true });
      await page.waitForFunction(() => {
        const box = document.querySelector('.arena-inline-paywall').getBoundingClientRect();
        return box.top < innerHeight && box.bottom > 0;
      }, { timeout: 3000 });
      const tile = await page.$eval('[data-library-card-tile]', node => ({ href: node.getAttribute('href'), name: node.querySelector('img').alt }));
      await page.click('[data-library-card-tile]');
      await page.waitForFunction(href => decodeURI(location.pathname) === decodeURI(href), { timeout: 10_000 }, tile.href);
      await page.waitForFunction(name => document.querySelector('h1')?.textContent?.trim() === name, { timeout: 10_000 }, tile.name);
      assert.deepEqual(errors, [], `no page error at ${viewport.width}px`);
      await page.close();
    }

    // A subscriber whose access check and library chunk arrive late sets search, filter, Duo and pages on the open
    // cards; the catalog then replaces the cards in the same view, which keeps all of it and does not move.
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setCookie({ name: 'list_reader', value: '1', url: origin });
    let held = 0;
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.resourceType() !== 'script') return void request.continue().catch(() => {});
      void fetch(request.url()).then(async answer => {
        const body = await answer.text();
        if (body.includes(PAID_MARKER)) { held += 1; await delay(4000); }
        await request.respond({ status: 200, contentType: 'application/javascript', body });
      }).catch(() => request.continue().catch(() => {}));
    });
    await page.evaluateOnNewDocument(() => {
      window.__shifts = [];
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) continue;
          window.__shifts.push(entry.value);
          // What moved, for the failure message.
          window.__shiftSources = [...(window.__shiftSources ?? []), ...entry.sources.map(source =>
            `${source.node?.nodeName ?? '?'}.${String(source.node?.className ?? '').slice(0, 60)} ${JSON.stringify(source.previousRect)}→${JSON.stringify(source.currentRect)}`)];
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(`${origin}/library/minions/`, { waitUntil: 'domcontentloaded' });
    await hydrated(page);
    await page.click('button[aria-label="Таверна 2"]');
    await openAdvanced(page);
    await page.click('.bg-library-control-duos input');
    await search(page, 'зверь');
    await page.click('button::-p-text(Показать ещё)');
    const before = await state(page);
    assert.equal(before.paid, false, 'the access check is still running: the open cards are on screen');
    assert.equal(before.tiles, 62, 'every beast of tier 2 (the tribe is searched too), Duo included, after «Показать ещё»');
    await page.evaluate(() => { window.__shifts = []; window.__shiftSources = []; });
    await page.waitForSelector('.arena-paid-view', { timeout: 15_000 });
    await page.waitForFunction(() => document.querySelector('.bg-library-control-locked') === null, { timeout: 5000 });
    for (let attempt = 0; attempt < 50 && reads.length === 0; attempt += 1) await delay(100);
    await delay(500);
    const after = await state(page);
    assert.ok(held > 0, 'the library chunk was held back (the scenario is real)');
    assert.ok(reads.length > 0, 'the protected catalog was read');
    assert.deepEqual({ query: after.query, tier2: after.tier2, duo: after.duo, tiles: after.tiles },
      { query: 'зверь', tier2: 'true', duo: true, tiles: 62 }, 'the search, the filter, Duo and the pages survive the swap');
    assert.equal(after.locked, 0, 'a subscriber has no lock');
    const shift = (await page.evaluate(() => window.__shifts)).reduce((sum, value) => sum + value, 0);
    assert.ok(shift < 0.01, `the swap shifted the layout by ${shift.toFixed(3)}: before ${before.boxes} @${before.scroll}; after ${after.boxes} @${after.scroll}; ${(await page.evaluate(() => window.__shiftSources)).slice(0, 2).join(' | ')}`);
    await page.select('.bg-library-control-advanced select', 'Яд');
    await search(page, '');
    await page.click('button[aria-label="Таверна 2"]');
    await page.click('button[aria-label="Таверна 4"]');
    assert.equal((await state(page)).tiles, 5, 'the controls keep working on the catalog');
    assert.equal(slug('Зверь 00'), 'зверь-00');
    await page.close();
  } finally {
    if (browser) await browser.close();
    if (front) await closeLocal(front);
    if (next) await next.close();
    await closeLocal(legacyServer);
  }
});
