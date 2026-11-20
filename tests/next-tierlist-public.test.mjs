import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { existsSync } from 'node:fs';
import { DATA_PAGES, hasMarker } from '../scripts/lib/post-deploy-data-pages.mjs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createBattlegroundHeroRankingRouter } from '../server/battlegroundHeroRankingRoutes.ts';
import { createTierlistRouter } from '../server/tierlistRoutes.ts';
import { buildHeroCatalog } from './helpers/battlegroundHeroesFixture.ts';
import { createBattlegroundBuildsRouter } from '../server/battlegroundBuildsPublicRoutes.ts';
import { buildSourcePayload, sourceOf } from './helpers/battlegroundBuildsFixture.ts';
import { openAnswer } from './helpers/legendariesOpenLayerFixture.ts';
import { openAnswer as matchupsOpenAnswer } from './helpers/standardMatchupsOpenFixture.ts';
import { buildFixtureCards, buildTierlistFixture, closedValues, guestPercent, CLASS_IDS, PAID_KEYS } from './helpers/tierlistPublicFixture.ts';

// The built /tierlist/ page against an Express that serves the real open
// projection: a guest and a robot get the same HTML, the subscriber's view on
// the open pool (class filter, tiers, the first page of cards, locked sources
// and filters), the open figures of the whole pool (tier, winrate to 0,1, pick
// rate) in the page data, and no paid value (mulligan winrate, ArenaSmith rank,
// exact games, unrounded winrate) in the HTML, the RSC payload
// (`self.__next_f`) or the JSON-LD. Without data the page is still a 200.

const CARDS = buildFixtureCards();
const CLOSED = closedValues();
// A paid value leaks only as a whole token: short tier labels such as `Z3` also occur inside chunk hashes and ids.
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CLOSED_TOKENS = CLOSED.map(value => [value, new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(value)}(?![\\p{L}\\p{N}_])`, 'u')]);
const closedIn = text => CLOSED_TOKENS.filter(([value, token]) => text.includes(value) && token.test(text)).map(([value]) => value);
const CLASSES = [...CLASS_IDS, 'any'];
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ROBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function startLegacy(state) {
  const app = express();
  app.use((request, _response, next) => {
    state.reads.push({ path: request.originalUrl, cookie: request.headers.cookie ?? '' });
    next();
  });
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  // A new router (and so an empty projection cache) whenever `state.generation` changes: Express restarted without a copy.
  let router = null; let builtFor = -1;
  const build = () => createTierlistRouter({
    // Nobody is a subscriber here: only the open layer may be answered.
    accessGuard: (_request, response) => { response.status(403).json({ error: 'subscription required' }); },
    cache: new Map(),
    resolveSource: () => 'hsreplay',
    getData: async () => {
      if (state.down) throw new Error('origin down');
      return { data: buildTierlistFixture(), etag: '"fixture"', cacheSource: 'origin' };
    },
    present: data => ({ ...data, classPositions: {} }),
    loadFallback: () => null,
    onError: () => undefined,
  });
  // The open projections of the other two ISR data pages the warm-up regenerates (they answer while `state.down` is false).
  app.get('/api/legendaries/public', (_request, response) => (state.down
    ? response.status(503).set('Retry-After', '60').json({ error: 'no snapshot' }) : response.json(openAnswer())));
  app.get('/api/standard/matchups/public', (request, response) => (state.down
    ? response.status(503).set('Retry-After', '60').json({ error: 'no snapshot' })
    : response.json(matchupsOpenAnswer({ noise: true, format: request.query.format === 'wild' ? 'wild' : 'standard' }))));
  // The sources the revalidate route probes before it marks the other pages stale: they answer while `state.down` is false.
  app.get(['/api/articles', '/api/winrates/public-teaser', '/api/standard-meta/public', '/api/bg/library/public/listing', '/api/bg/library/public/listing/:kind'], (_request, response) => (state.down
    ? response.status(503).json({ error: 'no snapshot' }) : response.json([{ id: 'probe' }])));
  const heroes = createBattlegroundHeroRankingRouter({
    loadCatalog: async mode => {
      if (state.down) throw new Error('service down');
      return buildHeroCatalog('TOP_50_PERCENT', mode);
    },
    onError: () => undefined,
  });
  const builds = createBattlegroundBuildsRouter({
    loadSource: async list => {
      if (state.down) throw new Error('service down');
      return buildSourcePayload(sourceOf(list));
    },
    fallbackDir: null,
    onError: () => undefined,
  });
  app.use('/api', (request, response, next) => {
    if (builtFor !== (state.generation ?? 0)) { router = build(); builtFor = state.generation ?? 0; }
    return router(request, response, (error) => (error ? next(error) : heroes(request, response, error2 => (error2 ? next(error2) : builds(request, response, next)))));
  });
  return app;
}

const guestHtml = async (origin, headers = {}) => {
  const response = await fetch(`${origin}/tierlist/`, { headers });
  assert.equal(response.status, 200);
  return response.text();
};

test('the guest HTML of /tierlist/ is the subscriber view on the open pool and carries nothing paid', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  // The build copy of the page is made without Express: it has no slice.
  const state = { reads: [], down: true };
  const legacy = startLegacy(state);
  const legacyServer = legacy.listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  // /tierlist/ is a five-minute ISR page. Move the server's clock past that window and request until the
  // regenerated copy (stale-while-revalidate: the first answer is the old one) satisfies `ready`.
  const regenerated = async (ready, phase, headers = { 'User-Agent': BROWSER_UA, Cookie: 'session=guest-fixture' }) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      // Every attempt moves the clock again: a regeneration still running from an earlier request stamps its copy
      // with the shifted time, and that copy must not count as fresh.
      process.kill(next.pid, 'SIGUSR2');
      const html = await guestHtml(next.origin, headers);
      if (ready(html)) return html;
      await delay(250);
    }
    return assert.fail(`the page was not regenerated: ${phase}; reads ${JSON.stringify(state.reads.map(read => read.path))}; ${next.output().slice(-300)}`);
  };
  const hasSlice = html => html.includes('hs-tier-card');
  try {
    const buildCopy = await guestHtml(next.origin);
    assert.equal(hasSlice(buildCopy), false, 'the copy made without Express has no cards but is a 200 page');
    state.down = false;
    const html = await regenerated(hasSlice, 'cards appear');

    // The subscriber's view on the open data: «Все карты», best tier first, the first page of cards.
    const start = html.indexOf('class="arena-tierlist-page"');
    assert.ok(start >= 0 && html.indexOf('<h1') < html.indexOf('class="tierlist-card-grid"'), 'the cards are the page content after the H1');
    const shown = [...html.matchAll(/aria-label="Открыть карту ([^"]+)"/g)].map(match => match[1]);
    assert.equal(shown.length, Math.min(48, CARDS.length), 'the first page of the pool is in the server HTML');
    assert.deepEqual(shown.filter(name => !CARDS.some(card => card.row.name === name)), [], 'only cards of the pool');
    assert.equal(shown[0].startsWith('Карта mage-s') || shown[0] === 'Карта any-s0', true, 'tier S comes first');
    for (const classId of CLASSES) assert.match(html, new RegExp(`aria-label="Класс ${classId}"`), `the class filter offers ${classId}`);
    // The closed parts are in place, locked, with the class the JSON-LD names.
    assert.equal((html.match(/data-locked="true"/g) ?? []).length, 2, 'HearthArena and Firestone are locked sources');
    assert.equal((html.match(/arena-tier-select--locked paywalled-tierlist/g) ?? []).length, 2, 'rarity and mana are locked filters');
    assert.ok(!html.includes('arena-paywall'), 'no gate over the open list');
    // Every open figure of the pool travels to the browser (search, class filter, card details), rounded to 0.1.
    const rsc = [...html.matchAll(/<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map(match => match[1]).join('\n');
    for (const { row } of CARDS) assert.ok(rsc.includes(String(row.name)), `${row.name} is in the page data`);
    assert.match(rsc, /,55\.6,61\.2\]/, 'the sentinel is rounded to 0.1');
    assert.match(html, /Данные на <time dateTime="2026-11-15T17:00:03\.639Z">15 ноября 2026, 20:00 МСК<\/time>(?:<!-- -->)? · по данным более 980\s000 игр · источник HSReplay/,
      'the date, the sample and the source are on the page');
    // The HTML budget is 300 KB. Every card of the pool is a compact row of the RSC payload; the rendered first page
    // does not grow with the pool. A pool of 1500 cards must still fit (the production pool has about 1300).
    const rows = rsc.match(/\[\\"FX_[^\]]*\]/g) ?? [];
    assert.equal(rows.length, CARDS.length, 'one compact row per card of the pool');
    const perCard = Math.ceil(rows.reduce((sum, row) => sum + Buffer.byteLength(row) + 1, 0) / rows.length);
    const projected = Buffer.byteLength(html) + (1500 - CARDS.length) * perCard;
    assert.ok(projected <= 300_000, `a 1500-card pool would make ${projected} bytes of HTML (${Buffer.byteLength(html)} for ${CARDS.length} cards)`);

    // Nothing closed in the HTML, in the RSC payload and in the JSON-LD: each is checked on its own.
    assert.match(html, /self\.__next_f/, 'the page carries an RSC payload');
    const payload = [...html.matchAll(/<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map(match => match[1]).join('\n');
    const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => match[1]);
    assert.ok(payload.length > 0 && jsonLd.length > 0, 'both are present, so the checks below are not vacuous');
    for (const [name, text] of [['HTML', html], ['RSC payload', payload], ['JSON-LD', jsonLd.join('\n')]]) {
      assert.deepEqual(closedIn(text), [], `${name} has no paid value`);
      assert.deepEqual(PAID_KEYS.filter(key => text.includes(key)), [], `${name} has no paid key`);
    }
    const graph = JSON.parse(jsonLd.find(text => text.includes('Dataset')))['@graph'];
    const dataset = graph.find(node => node['@type'] === 'Dataset');
    assert.equal(dataset.isAccessibleForFree, false);
    assert.deepEqual(dataset.hasPart, { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.paywalled-tierlist' });
    assert.equal('license' in dataset, false, 'no license on the dataset');
    assert.equal('creator' in dataset, false, 'the site is no creator of the data');
    assert.equal(dataset.dateModified, '2026-11-15T17:00:03.639Z', 'dated by the data the page prints');

    // The server reads the projection anonymously.
    const reads = state.reads.filter(read => read.path.startsWith('/api/tierlist'));
    assert.ok(reads.length > 0 && reads.every(read => read.path === '/api/tierlist/public?source=hsreplay'), 'only the open projection is read');
    assert.deepEqual([...new Set(state.reads.map(read => read.cookie))], [''], 'cookies are never forwarded');

    // A robot and a guest get the same document.
    assert.equal(await guestHtml(next.origin, { 'User-Agent': ROBOT_UA }), await guestHtml(next.origin, { 'User-Agent': BROWSER_UA }),
      'the HTML does not depend on the user agent');

    // No data: a 200 page, with its text and markup but without the slice.
    state.down = true;
    state.generation = 1;
    const empty = await regenerated(page => !hasSlice(page), 'cards disappear without data');
    assert.doesNotMatch(empty, /aria-label="Открыть карту /, 'no cards without data');
    assert.doesNotMatch(empty, /О странице/, 'no explanation block is printed');
  } finally {
    await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});

// The deploy warm-up against the real built page and the real revalidate route.
async function warmStand({ articlesReadyAfterMs = 0, expressRecoversAfterFirstRevalidation = false }) {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { reads: [], down: true };
  const legacyServer = startLegacy(state).listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const legacyOrigin = `http://127.0.0.1:${legacyServer.address().port}`;
  const next = await startNextServer({ legacyOrigin });
  const revalidations = [];
  const opened = Date.now();
  // The tier-list projection answers from the start, unless the test brings it up after the first regeneration.
  state.down = expressRecoversAfterFirstRevalidation;
  // One public address for the warm-up: Express under /api, Next for everything else.
  const gateway = createServer(async (incoming, response) => {
    if (incoming.url === '/api/articles') {
      response.writeHead(Date.now() - opened >= articlesReadyAfterMs ? 200 : 503, { 'Content-Type': 'application/json' }).end('[]');
      return;
    }
    const target = incoming.url.startsWith('/api/') ? legacyOrigin : next.origin;
    const answer = await fetch(`${target}${incoming.url}`, { method: incoming.method, redirect: 'manual' });
    const body = await answer.text();
    if (incoming.method === 'POST' && incoming.url === '/health/next/revalidate/') {
      revalidations.push(JSON.parse(body).revalidated);
      // Express recovers only after the first regeneration has already run on nothing.
      if (expressRecoversAfterFirstRevalidation && revalidations.length === 1) setTimeout(() => { state.down = false; }, 600);
    }
    response.writeHead(answer.status, { 'Content-Type': answer.headers.get('content-type') ?? 'text/html',
      'X-Nextjs-Cache': answer.headers.get('x-nextjs-cache') ?? 'none' }).end(body);
  });
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const address = `http://127.0.0.1:${gateway.address().port}`;
  const warm = async env => {
    const child = spawn(process.execPath, ['scripts/warm-prerendered-pages.mjs'], { env: { PATH: process.env.PATH,
      PRODUCTION_BASE_URL: address, NEXT_LOCAL_ORIGIN: address, WARM_ONLY: '/tierlist/', WARM_DELAY_MS: '300', ...env } });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const [code] = await once(child, 'exit');
    return { code, output };
  };
  const close = async () => {
    gateway.closeAllConnections();
    await new Promise(done => gateway.close(done));
    await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  };
  return { next, revalidations, warm, close };
}

test('the post-deploy warm-up revalidates again until /tierlist/ carries its slice', async () => {
  const stand = await warmStand({ expressRecoversAfterFirstRevalidation: true });
  try {
    const before = await guestHtml(stand.next.origin);
    assert.equal(before.includes('hs-tier-card'), false, 'the build copy has no cards');
    const { code, output } = await stand.warm({ WARM_TOTAL_MS: '30000' });
    assert.equal(code, 0, output);
    assert.ok(stand.revalidations.length >= 2, `a page left without data is revalidated again: ${output}`);
    // The first call finds every source down: nothing is marked stale. Once Express is back, the route regenerates exactly the
    // pages that render data (the literal list is the contract between DATA_PAGES and the route).
    assert.deepEqual(stand.revalidations[0], [], 'a page whose source is down is not marked stale');
    assert.deepEqual([...stand.revalidations.at(-1)].sort(), ['/articles', '/battlegrounds/tier-list', '/classes', '/heroes', '/legendaries', '/library', ...['anomalies', 'dark-gifts', 'darkmoon-prizes', 'minions', 'quests',
      'rewards', 'spells', 'timewarped', 'trinkets'].map(kind => `/library/${kind}`), '/standard/matchups', '/standard/meta', '/tierlist',
      // The stand serves no Wild catalog, so the probe of the Wild hub keeps its copy.
      '/arena', '/battlegrounds', '/standard'].sort(),
      'the real route regenerates exactly the pages that render data');
    assert.match(output, /\[warm\] \/tierlist\/: with data/, output);
    // What a visitor gets right after the warm-up, with no clock shifted and no second request needed.
    const after = await guestHtml(stand.next.origin);
    assert.match(after, /hs-tier-card/, 'the cards are in the served HTML');
    assert.match(after, /aria-label="Открыть карту Карта mage-s0"/, 'with its cards');
    assert.match(after, /data-tier="S"/, 'under the tier marks');
  } finally {
    await stand.close();
  }
});

test('the post-deploy warm-up waits for a cold Express and warns for every page when it never comes', async () => {
  const stand = await warmStand({ articlesReadyAfterMs: 1500 });
  try {
    const late = await stand.warm({ WARM_API_WAIT_MS: '20000', WARM_TOTAL_MS: '30000' });
    assert.equal(late.code, 0, late.output);
    assert.match(late.output, /\[warm\] \/tierlist\/: with data/, 'Express came up after the runner started: it waited');
    assert.doesNotMatch(late.output, /::warning::/);
  } finally {
    await stand.close();
  }
  const absent = await warmStand({ articlesReadyAfterMs: 1e9 });
  try {
    const { code, output } = await absent.warm({ WARM_ONLY: '/tierlist/,/classes/', WARM_API_WAIT_MS: '1200', WARM_TOTAL_MS: '5000' });
    assert.equal(code, 0, 'the deploy is never failed');
    assert.deepEqual(absent.revalidations, [], 'nothing is regenerated while Express is down');
    for (const path of ['/tierlist/', '/classes/']) assert.match(output, new RegExp(`\\[warm\\] ${path}: without data`), `${path} is named`);
    assert.match(output, /::warning::pages without data after the deploy warm-up: \/tierlist\/, \/classes\//, output);
  } finally {
    await absent.close();
  }
});

// The open view in a real browser: without a script the first page of cards is on the page; with one the
// class filter, the card details with the open figures and the locks work like the subscriber's view, and
// the page does not shift while it hydrates and while the paywall settles.
test('/tierlist/ in a browser: cards without JS, the subscriber view with locks with JS, no layout shift', async () => {
  const state = { reads: [], down: false };
  const legacyServer = startLegacy(state).listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const legacyPort = legacyServer.address().port;
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyPort}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  let front; let browser;
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      if ((await guestHtml(next.origin)).includes('hs-tier-card')) break;
      await delay(250);
    }
    front = createServer((request, response) => {
      const port = request.url.startsWith('/api/') ? legacyPort : Number(new URL(next.origin).port);
      const upstream = httpRequest({ host: '127.0.0.1', port, method: request.method, path: request.url, headers: request.headers },
        answer => { response.writeHead(answer.statusCode, answer.headers); answer.pipe(response); });
      request.pipe(upstream);
    });
    front.listen(0, '127.0.0.1');
    await once(front, 'listening');
    const origin = `http://127.0.0.1:${front.address().port}`;
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });

    const plain = await browser.newPage();
    await plain.setJavaScriptEnabled(false);
    await plain.goto(`${origin}/tierlist/`, { waitUntil: 'load' });
    const noScript = await plain.evaluate(() => document.querySelectorAll('.tierlist-card-grid .hs-tier-card').length);
    assert.equal(noScript, Math.min(48, CARDS.length), 'without JS the first page of cards is on the page');
    await plain.close();

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844, isMobile: true, hasTouch: true }]) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      await page.evaluateOnNewDocument(() => {
        window.__layoutShifts = [];
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__layoutShifts.push(entry.value);
        }).observe({ type: 'layout-shift', buffered: true });
      });
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(`${origin}/tierlist/`, { waitUntil: 'networkidle2' });
      const cards = () => page.evaluate(() => document.querySelectorAll('.tierlist-card-grid .hs-tier-card').length);
      const shift = await page.evaluate(() => window.__layoutShifts.reduce((sum, value) => sum + value, 0));
      assert.ok(shift < 0.02, `${viewport.width}px: the page shifted by ${shift.toFixed(4)} while it hydrated`);
      await page.click('button[aria-label="Класс mage"]');
      await page.waitForFunction(count => document.querySelectorAll('.tierlist-card-grid .hs-tier-card').length === count, {},
        CARDS.filter(card => card.classId === 'mage').length);
      await page.click('button[aria-label="Все карты"]');
      await page.waitForFunction(count => document.querySelectorAll('.tierlist-card-grid .hs-tier-card').length === count, {}, Math.min(48, CARDS.length));
      // The card details show the open figures and the paid ones as locks; a lock opens the offer in place.
      await page.click('.tierlist-card-grid .hs-tier-card');
      await page.waitForSelector('.card-modal-stats .tierlist-paid-lock');
      await page.click('.card-modal-stats button.tierlist-paid-lock');
      await page.waitForFunction(() => !document.querySelector('.card-modal-lightbox'));
      await page.waitForSelector('.tierlist-offer .arena-inline-paywall');
      assert.equal(await cards(), Math.min(48, CARDS.length), 'the list stays while the offer is open');
      assert.deepEqual(errors, [], `${viewport.width}px: no page errors`);
    await page.close();
    }
  } finally {
    if (browser) await browser.close();
    if (front) { front.closeAllConnections(); await new Promise(done => front.close(done)); }
    await next.close();
    legacyServer.closeAllConnections();
    await new Promise(done => legacyServer.close(done));
  }
});

// /legendaries/, /heroes/ and /battlegrounds/tier-list/ are ISR pages whose build copy has no data. The real revalidate route must regenerate
// them, so that right after a deploy a visitor gets the open layer and not «temporarily unavailable».
test('the post-deploy warm-up regenerates /legendaries/, /heroes/, /standard/matchups/ and /battlegrounds/tier-list/ through the revalidate route', async () => {
  const stand = await warmStand({});
  try {
    const pages = [
      { path: '/legendaries/', data: 'legendary-group-card', copy: 'Данные временно недоступны' },
      { path: '/heroes/', data: 'battleground-hero-card', copy: 'Рейтинг героев временно недоступен' },
      { path: '/standard/matchups/', data: 'standard-matchups-open__matrix', copy: 'Загружаем матчапы' },
      { path: '/battlegrounds/tier-list/', data: 'bg-tierlist-strategy__cards', copy: 'Сборки временно недоступны' },
    ];
    for (const { path, data, copy } of pages) {
      const response = await fetch(`${stand.next.origin}${path}`);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.ok(['HIT', 'STALE', 'MISS'].includes(response.headers.get('x-nextjs-cache')), `${path} is an ISR page: ${response.headers.get('x-nextjs-cache')}`);
      assert.equal(html.includes(data), false, `the build copy of ${path} has no data`);
      assert.ok(html.includes(copy), `the build copy of ${path} says it is unavailable`);
    }
    const { code, output } = await stand.warm({ WARM_ONLY: '/legendaries/,/heroes/,/standard/matchups/,/battlegrounds/tier-list/', WARM_TOTAL_MS: '30000' });
    assert.equal(code, 0, output);
    assert.ok(stand.revalidations.length >= 1, `the warm-up asked the route to regenerate: ${output}`);
    for (const path of ['/legendaries', '/heroes', '/standard/matchups', '/battlegrounds/tier-list']) assert.ok(stand.revalidations[0].includes(path), `the route regenerates ${path}`);
    for (const path of ['/legendaries/', '/heroes/', '/standard/matchups/', '/battlegrounds/tier-list/']) assert.match(output, new RegExp(`\\[warm\\] ${path}: with data`), output);
    // What a visitor gets right after the warm-up, with no clock shifted: the data and not the message.
    for (const { path, data, copy } of pages) {
      const html = (await (await fetch(`${stand.next.origin}${path}`)).text()).replaceAll('<!-- -->', '');
      assert.ok(html.includes(data), `${path} carries its data after the warm-up`);
      assert.equal(html.includes(copy), false, `${path} no longer says it is unavailable`);
    }
    const legendaries = (await (await fetch(`${stand.next.origin}/legendaries/`)).text()).replaceAll('<!-- -->', '');
    assert.ok(legendaries.includes('Изера Неспящая, Аспект Сновидений'), 'with the real groups');
    const heroes = await (await fetch(`${stand.next.origin}/heroes/`)).text();
    assert.ok(heroes.includes('Герой 0'), 'with the real heroes');
  } finally {
    await stand.close();
  }
});

// The warm-up table lists exactly the ISR pages the real revalidate route regenerates (that literal is asserted against the
// real route by the warm-up test above).
test('DATA_PAGES marked isr are the 22 pages of the revalidate route', () => {
  const expected = ['/articles', '/battlegrounds/tier-list', '/classes', '/heroes', '/legendaries', '/library', ...['anomalies', 'dark-gifts', 'darkmoon-prizes', 'minions', 'quests',
    'rewards', 'spells', 'timewarped', 'trinkets'].map(kind => `/library/${kind}`), '/standard/matchups', '/standard/meta', '/tierlist',
    '/arena', '/battlegrounds', '/standard', '/wild'];
  assert.equal(expected.length, 22);
  assert.deepEqual(DATA_PAGES.filter(page => page.isr).map(page => page.path.replace(/\/$/, '')).sort(), [...expected].sort());
  assert.equal(DATA_PAGES.find(page => page.path === '/library/').marker, 'bg-library-public__size', 'the hub marker is not on the copy without sizes');
});

// The tool page «Сборка» reads two Express answers in its first-paint budget, so the deploy warm-up primes both formats of it
// (dynamic pages, requested on the local Next origin) and waits for the block only the HTML with the data has.
test('the post-deploy warm-up covers /standard/assemble/ in both formats and tells the page with the data from the one without', () => {
  const pages = DATA_PAGES.filter(page => page.path.startsWith('/standard/assemble/'));
  assert.deepEqual(pages.map(page => page.path), ['/standard/assemble/', '/standard/assemble/?format=wild']);
  for (const page of pages) assert.equal(page.isr, undefined, 'dynamic: it is not part of the revalidate route');
  const marker = pages[0].marker;
  const picker = '<div class="assemble-tool"><h2 class="assemble-tool__title">Выберите карту</h2><div class="card-choices"></div></div>';
  assert.equal(hasMarker(picker, marker), false, 'the picker alone is the page without the data');
  assert.equal(hasMarker(`${picker}<h3 class="assemble-title">Что выпало?</h3>`, marker), true);
});
