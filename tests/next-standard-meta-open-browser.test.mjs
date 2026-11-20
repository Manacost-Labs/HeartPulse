import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';

// /standard/meta/ in a real browser against an Express stub: a guest without JavaScript sees every archetype of
// the general slice (Standard here, Wild after the switch), a guest with JavaScript gets locks and an offer for the
// paid filters, a subscriber gets the paid columns in place without moving the rows. The stub's protected route
// carries the sentinels, so they reach a page only for a subscriber.

const READER = { id: 'sm-reader', email: 'reader@example.test', name: 'Подписчик', role: 'user' };
const SUBSCRIBED = { hasAccess: true, entitlements: { arena: true, standard: true }, source: 'boosty', checkedAt: null,
  stale: false, message: '', boosty: { checked: true, hasAccess: true }, patreon: {}, telegram: {} };
const PROTECTED_DELAY_MS = 800;
const SENTINELS = ['77.7701', '66.6066', 'SENTINEL_TREND'];
const DESKTOP = { width: 1440, height: 900 };

const rows = (format, paid) => Array.from({ length: 8 }, (_, index) => ({
  id: `${format}-${index + 1}`, slug: `${format}-arch-${index + 1}`, archetype: `Archetype ${format} ${index + 1}`,
  archetypeLabel: `${format === 'wild' ? 'Вольный' : 'Стандартный'} архетип ${index + 1}`, translated: true,
  classKey: index % 2 ? 'mage' : 'priest', winrate: 55 - index, popularity: 12 - index / 2, games: 5000 - index * 300,
  turns: paid ? 77.7701 : null, durationMinutes: paid ? 66.6066 : null, climbingSpeed: paid ? 7.77 : null,
}));
const slice = (format, paid) => ({
  format, formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт', rank: 'diamond_legend', rankLabel: 'Алмаз — Легенда',
  period: 'patch_36.6.3', availablePeriods: paid ? ['past_day', 'patch_36.6.3'] : ['patch_36.6.3'], currentPeriod: 'patch_36.6.3',
  currentPatchPeriod: 'patch_36.6.3', coin: 'any_player', minGames: 100, source: 'hsguru', sourceUrl: 'https://www.hsguru.com/meta',
  translationSource: '', updatedAt: new Date(Date.now() - 3_600_000).toISOString(), totalGames: 99_000, items: rows(format, paid),
});

async function startStack() {
  const state = { next: null, publicReads: [], protectedReads: 0, down: false };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://stack');
    const reader = /(?:^|;\s*)sm_session=reader/.test(request.headers.cookie ?? '');
    const json = (status, payload) => response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
      .end(JSON.stringify(payload));
    if (url.pathname === '/api/auth/me') return json(200, { user: reader ? READER : null });
    if (url.pathname === '/api/subscription/status') return reader ? json(200, SUBSCRIBED) : json(401, { error: 'guest' });
    if (url.pathname === '/api/standard-meta/public') {
      state.publicReads.push(`${url.pathname}${url.search}`);
      if (state.down) return json(503, { error: 'source down' });
      return json(200, slice(url.searchParams.get('format') === 'wild' ? 'wild' : 'standard', false));
    }
    if (url.pathname === '/api/standard-meta') {
      if (!reader) return json(401, { error: 'subscription required' });
      state.protectedReads += 1;
      return void setTimeout(() => json(200, slice(url.searchParams.get('format') === 'wild' ? 'wild' : 'standard', true)), PROTECTED_DELAY_MS);
    }
    if (url.pathname.startsWith('/api/')) return json(401, { error: 'guest' });
    const upstream = http.request(new URL(state.next), { method: request.method, path: request.url, headers: request.headers },
      answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
    request.pipe(upstream);
  });
  const origin = await listenLocal(server);
  return Object.assign(state, { server, origin });
}

test('a guest and a subscriber on /standard/meta/ in a real browser', { timeout: 240_000 }, async () => {
  const stack = await startStack();
  const next = await startNextServer({ legacyOrigin: stack.origin });
  stack.next = next.origin;
  let browser;
  try {
    assert.equal((await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' })).status, 200);
    stack.publicReads.length = 0; // the route's own probe of the source is not a page read
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });

    // A guest (and a crawler) without JavaScript: every archetype of the general slice, no paid value.
    const bare = await browser.newPage();
    await bare.setJavaScriptEnabled(false);
    await bare.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'load' });
    const bareHtml = await bare.content();
    assert.equal((bareHtml.match(/class="standard-meta-card"/g) ?? []).length, 8, 'all eight archetypes are in the HTML');
    assert.ok(bareHtml.includes('Стандартный архетип 8') && bareHtml.includes('50%'), 'names and winrates are printed');
    assert.deepEqual(SENTINELS.filter(value => bareHtml.includes(value)), [], 'no sentinel in the HTML a guest gets');
    const crawler = await (await fetch(`${stack.origin}/standard/meta/`, { headers: { 'User-Agent': 'Googlebot/2.1' } })).text();
    const guestHtml = await (await fetch(`${stack.origin}/standard/meta/`)).text();
    assert.equal(crawler, guestHtml, 'a crawler gets the guest HTML');
    const ld = [...guestHtml.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(match => match[1]).join('');
    assert.match(ld, /"isAccessibleForFree":false/);
    assert.match(ld, /\.paywalled-standard-meta/);
    assert.deepEqual(SENTINELS.filter(value => ld.includes(value)), [], 'no sentinel in the JSON-LD');
    await bare.close();

    // A guest with JavaScript: locked filters open the offer; Wild reads the same open route.
    const guest = await browser.newPage();
    await guest.setViewport(DESKTOP);
    const errors = [];
    guest.on('pageerror', error => errors.push(error.message));
    await guest.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'networkidle0' });
    assert.equal(await guest.$$eval('.standard-meta-card', cards => cards.length), 8);
    assert.equal(stack.publicReads.length, 1, 'only the server read the open slice');
    assert.equal(stack.protectedReads, 0, 'a guest never asks the protected route');
    assert.equal(await guest.$$eval('[data-locked-filter]', nodes => nodes.length), 3, 'period, coin and floor are locks');
    await guest.click('.standard-meta__rank-tabs button:not([aria-pressed="true"])');
    await guest.waitForSelector('.standard-meta__locked-note');
    assert.match(await guest.$eval('.standard-meta__rank-tabs button[aria-pressed="true"]', node => node.textContent), /Алмаз/, 'the rank stays');
    assert.equal(await guest.$$eval('.standard-meta-card', cards => cards.length), 8, 'a locked rank does not change the slice');
    await guest.click('[data-locked-filter]');
    assert.ok(await guest.$('#standard-meta-paywall'), 'the offer is on the page');
    assert.equal(stack.publicReads.length, 1, 'locked filters send no request');
    // The format switch is two links, each its own address: Wild opens at /standard/meta/wild/.
    assert.deepEqual(await guest.$$eval('.standard-meta__segmented a', links => links.map(link => link.getAttribute('href'))),
      ['/standard/meta/', '/standard/meta/wild/']);
    await guest.click('.standard-meta__segmented a[href="/standard/meta/wild/"]');
    await guest.waitForFunction(() => location.pathname === '/standard/meta/wild/' && document.body.textContent.includes('Вольный архетип 1'),
      { timeout: 15000 });
    assert.ok(stack.publicReads.includes('/api/standard-meta/public?format=wild'));
    assert.equal(await guest.$$eval('.standard-meta-card', cards => cards.length), 8);
    const guestText = await guest.evaluate(() => document.body.textContent);
    assert.deepEqual(SENTINELS.filter(value => guestText.includes(value)), []);
    assert.deepEqual(errors, []);
    await guest.close();

    // Wild at its own address: the same open slice in the HTML, one H1, a self canonical, the same HTML for a crawler.
    const wildBare = await browser.newPage();
    await wildBare.setJavaScriptEnabled(false);
    await wildBare.goto(`${stack.origin}/standard/meta/wild/`, { waitUntil: 'load' });
    const wildHtml = await wildBare.content();
    assert.equal((wildHtml.match(/class="standard-meta-card"/g) ?? []).length, 8, 'all eight Wild archetypes are in the HTML');
    assert.ok(wildHtml.includes('Вольный архетип 8') && !wildHtml.includes('Стандартный архетип'), 'only the Wild slice is printed');
    assert.equal((wildHtml.match(/<h1[\s>]/g) ?? []).length, 1, 'one H1');
    assert.ok(wildHtml.includes('Мета Вольного формата Hearthstone'));
    assert.match(wildHtml, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/standard\/meta\/wild\/"/);
    assert.deepEqual(SENTINELS.filter(value => wildHtml.includes(value)), [], 'no sentinel in the Wild HTML');
    const wildCrawler = await (await fetch(`${stack.origin}/standard/meta/wild/`, { headers: { 'User-Agent': 'Googlebot/2.1' } })).text();
    const wildGuest = await (await fetch(`${stack.origin}/standard/meta/wild/`)).text();
    assert.equal(wildCrawler, wildGuest, 'a crawler gets the guest HTML of Wild');
    const wildLd = [...wildGuest.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map(match => match[1]).join('');
    assert.match(wildLd, /meta\/wild\/#dataset/);
    assert.match(wildLd, /"isAccessibleForFree":false/);
    assert.deepEqual(SENTINELS.filter(value => wildLd.includes(value) || wildGuest.includes(value)), []);
    const wildRsc = await (await fetch(`${stack.origin}/standard/meta/wild/`, { headers: { RSC: '1' } })).text();
    assert.deepEqual(SENTINELS.filter(value => wildRsc.includes(value)), [], 'no sentinel in the RSC payload');
    await wildBare.close();

    // The source is down: the revalidation leaves both pages as they are and a guest still gets the data.
    stack.down = true;
    const answer = await (await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' })).json();
    assert.ok(answer.skipped.some(item => item.path === '/standard/meta/wild'), 'the Wild page is skipped while its source is down');
    for (const path of ['/standard/meta/', '/standard/meta/wild/']) {
      const response = await fetch(`${stack.origin}${path}`);
      assert.equal(response.status, 200, `${path} answers while the source is down`);
      assert.ok((await response.text()).includes('архетип 8'), `${path} keeps its data`);
    }
    stack.down = false;
    await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' });

    // A subscriber: the paid columns replace the locks in place, the rows do not move.
    const reader = await browser.newPage();
    await reader.setViewport(DESKTOP);
    await reader.evaluateOnNewDocument(() => {
      window.__shifts = [];
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shifts.push(entry.value); })
        .observe({ type: 'layout-shift', buffered: true });
    });
    await reader.setCookie({ name: 'sm_session', value: 'reader', url: stack.origin });
    await reader.goto(`${stack.origin}/standard/meta/`, { waitUntil: 'load' });
    await reader.waitForSelector('.standard-meta-card');
    const cardTop = () => reader.$eval('.standard-meta-card:nth-child(4)', card => card.getBoundingClientRect().top + scrollY);
    const before = await cardTop();
    await reader.waitForFunction(() => document.body.textContent.includes('77,77'), { timeout: 15000 });
    assert.equal(await cardTop(), before, 'the paid figures arrive without moving the rows');
    assert.equal(await reader.$('[data-locked-filter]'), null, 'no locks for a subscriber');
    assert.equal(await reader.$('#standard-meta-paywall'), null, 'no offer for a subscriber');
    assert.ok(stack.protectedReads >= 1);
    const shift = await reader.evaluate(() => window.__shifts.reduce((sum, value) => sum + value, 0));
    assert.ok(shift <= 0.1, `the subscriber page shifted by ${shift.toFixed(4)}`);
    await reader.close();
  } finally {
    if (browser) await browser.close();
    await next.close();
    await closeLocal(stack.server);
  }
});
