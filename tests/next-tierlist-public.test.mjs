import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createBattlegroundHeroRankingRouter } from '../server/battlegroundHeroRankingRoutes.ts';
import { createTierlistRouter } from '../server/tierlistRoutes.ts';
import { buildHeroCatalog } from './helpers/battlegroundHeroesFixture.ts';
import { openAnswer } from './helpers/legendariesOpenLayerFixture.ts';
import { openAnswer as matchupsOpenAnswer } from './helpers/standardMatchupsOpenFixture.ts';
import { buildFixtureCards, buildTierlistFixture, closedValues, guestPercent, CLASS_IDS, PAID_KEYS } from './helpers/tierlistPublicFixture.ts';

// The built /tierlist/ page against an Express that serves the real open
// projection: a guest and a robot get the same HTML with the whole card pool
// by class (tier, winrate to 0,1, pick rate), the date and the source, and no
// paid value (mulligan winrate, ArenaSmith rank, exact games, unrounded winrate)
// is in the HTML, the RSC payload (`self.__next_f`) or the JSON-LD. Without
// data the page is still a 200.

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
  app.get(['/api/articles', '/api/winrates/public-teaser', '/api/standard-meta/public'], (_request, response) => (state.down
    ? response.status(503).json({ error: 'no snapshot' }) : response.json([{ id: 'probe' }])));
  const heroes = createBattlegroundHeroRankingRouter({
    loadCatalog: async mode => {
      if (state.down) throw new Error('service down');
      return buildHeroCatalog('TOP_50_PERCENT', mode);
    },
    onError: () => undefined,
  });
  app.use('/api', (request, response, next) => {
    if (builtFor !== (state.generation ?? 0)) { router = build(); builtFor = state.generation ?? 0; }
    return router(request, response, (error) => (error ? next(error) : heroes(request, response, next)));
  });
  return app;
}

const guestHtml = async (origin, headers = {}) => {
  const response = await fetch(`${origin}/tierlist/`, { headers });
  assert.equal(response.status, 200);
  return response.text();
};

test('the guest HTML of /tierlist/ carries the whole open pool and nothing paid', async () => {
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
  const hasSlice = html => html.includes('class="tierlist-public-pool"');
  try {
    const buildCopy = await guestHtml(next.origin);
    assert.equal(hasSlice(buildCopy), false, 'the copy made without Express has no slice but is a 200 page');
    assert.match(buildCopy, /class="paywalled-tierlist"/);
    state.down = false;
    const html = await regenerated(hasSlice, 'slice appears');

    const start = html.indexOf('class="tierlist-public-pool"');
    const slice = html.slice(start, html.indexOf('</table></div></section></div></section>', start) + 10);
    assert.ok(slice.length > 1000, 'the open list is in the server HTML');
    // The cards of a class are grouped by tier: the painted mark of the tier (`data-tier`) heads its rows.
    const rows = [...slice.matchAll(/data-tier="([SA-FU])"[^>]*\/><\/th><\/tr><\/tbody><tbody>(.*?)<\/tbody>/g)].flatMap(group =>
      [...group[2].matchAll(/<tr><th>Карта ([\w-]+)<td>([\d,]+)<td>([\d,]+)<td>(?=<tr>|$)/g)]
        .map(row => [row[0], row[1], group[1], row[2], row[3]]));
    assert.equal(rows.length, CARDS.length, 'every card of the pool: a card with a tier, winrate and pick rate per row');
    for (const classId of CLASSES) {
      assert.match(slice, new RegExp(`<section id="tierlist-${classId}" data-tierlist-class="${classId}"`), `a section and anchor for ${classId}`);
      assert.match(slice, new RegExp(`<a href="#tierlist-${classId}">Класс ${classId}</a>`), `the filter links to ${classId} without a script`);
    }
    const first = rows.find(row => row[1] === 'death-knight-0');
    assert.deepEqual([first[2], first[3], first[4]], ['A', '55,6', '61,2'], 'the sentinels are shown rounded to 0,1');
    assert.equal(guestPercent(55.5555), '55,6');
    assert.equal(rows.find(row => row[1] === 'druid-u')[2], 'U', 'a card without a tier is still listed, under the «Без тира» mark');
    // The HTML budget is 300 KB. Every row is in the HTML and in the RSC payload and costs ~90 bytes in the two (measured on
    // a 1100-card fixture: 214 KB in all): the page with this fixture and a pool of 1500 cards must still fit.
    const projected = Buffer.byteLength(html) + (1500 - CARDS.length) * 100;
    assert.ok(projected <= 300_000, `a 1500-card pool would make ${projected} bytes of HTML (${Buffer.byteLength(html)} for ${CARDS.length} cards)`);
    assert.match(slice, /Данные на <time dateTime="2026-11-15T17:00:03\.639Z">15 ноября 2026, 20:00 МСК<\/time> · по данным более 980\s000 игр · источник HSReplay/);
    assert.match(slice, /<col class="tierlist-public-pool__col-lock paywalled-tierlist"\/>/, 'the closed column has the class the JSON-LD names');
    assert.match(slice, /<button type="button" class="tierlist-public-pool__lock paywalled-tierlist"/, 'the lock carries it too');
    assert.ok(!html.includes('arena-paywall'), 'no gate over the open list');
    assert.ok(html.indexOf('<h1') < start, 'the list is the page content right after the H1');

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
    const empty = await regenerated(page => !hasSlice(page), 'slice disappears without data');
    assert.doesNotMatch(empty, /tierlist-public-pool/, 'no slice without data');
    assert.match(empty, /class="paywalled-tierlist"/);
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
    assert.equal(before.includes('class="tierlist-public-pool"'), false, 'the build copy has no slice');
    const { code, output } = await stand.warm({ WARM_TOTAL_MS: '30000' });
    assert.equal(code, 0, output);
    assert.ok(stand.revalidations.length >= 2, `a page left without data is revalidated again: ${output}`);
    // The first call finds every source down: nothing is marked stale. Once Express is back, the route regenerates exactly the
    // pages that render data (the literal list is the contract between DATA_PAGES and the route).
    assert.deepEqual(stand.revalidations[0], [], 'a page whose source is down is not marked stale');
    assert.deepEqual([...stand.revalidations.at(-1)].sort(), ['/articles', '/classes', '/heroes', '/legendaries', '/standard/matchups', '/standard/meta', '/tierlist'],
      'the real route regenerates exactly the pages that render data');
    assert.match(output, /\[warm\] \/tierlist\/: with data/, output);
    // What a visitor gets right after the warm-up, with no clock shifted and no second request needed.
    const after = await guestHtml(stand.next.origin);
    assert.match(after, /class="tierlist-public-pool"/, 'the slice is in the served HTML');
    assert.match(after, /<tr><th>Карта mage-s0<td>[\d,]+<td>[\d,]+<td>/, 'with its cards');
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

// The open list in a real browser: without a script every card of the pool is on the page and the class links
// are plain anchors; with one the class filter shows a single class and the page does not shift while it
// hydrates and while the paywall settles.
test('/tierlist/ in a browser: the whole pool without JS, the class filter with JS, no layout shift', async () => {
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
      if ((await guestHtml(next.origin)).includes('class="tierlist-public-pool"')) break;
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
    await plain.goto(`${origin}/tierlist/#tierlist-mage`, { waitUntil: 'load' });
    await delay(300);
    const noScript = await plain.evaluate(() => ({
      rows: document.querySelectorAll('.tierlist-public-pool tbody:not(.tierlist-public-pool__tier) tr').length,
      hidden: document.querySelectorAll('.tierlist-public-pool [hidden]').length,
      mageTop: Math.round(document.getElementById('tierlist-mage').getBoundingClientRect().top),
    }));
    assert.equal(noScript.rows, CARDS.length, 'without JS every card of the pool is on the page');
    assert.equal(noScript.hidden, 0, 'nothing is hidden without a script');
    assert.ok(noScript.mageTop < 400, `the class anchor works without a script (section top ${noScript.mageTop}px)`);
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
      await page.goto(`${origin}/tierlist/`, { waitUntil: 'networkidle2' });
      const visibleSections = () => page.evaluate(() => [...document.querySelectorAll('[data-tierlist-class]')].filter(node => !node.hidden).length);
      const visibleRows = () => page.evaluate(() => [...document.querySelectorAll('.tierlist-public-pool tbody:not(.tierlist-public-pool__tier) tr')].filter(row => !row.closest('[hidden]')).length);
      assert.equal(await visibleSections(), CLASSES.length, `${viewport.width}px: every class is shown by default`);
      await page.click('.tierlist-public-pool__classes a[href="#tierlist-mage"]');
      await page.waitForFunction(() => document.querySelectorAll('[data-tierlist-class]:not([hidden])').length === 1);
      assert.equal(await visibleRows(), CARDS.filter(card => card.classId === 'mage').length, 'the filter keeps only the chosen class');
      await page.click('.tierlist-public-pool__classes a[href="#tierlist-pool"]');
      await page.waitForFunction(count => document.querySelectorAll('[data-tierlist-class]:not([hidden])').length === count, {}, CLASSES.length);
      assert.equal(await visibleRows(), CARDS.length, 'all classes are back');
      const shift = await page.evaluate(() => window.__layoutShifts.reduce((sum, value) => sum + value, 0));
      assert.ok(shift < 0.02, `${viewport.width}px: the page shifted by ${shift.toFixed(4)}`);
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

// /legendaries/ and /heroes/ are ISR pages whose build copy has no data. The real revalidate route must regenerate
// them, so that right after a deploy a visitor gets the open layer and not «temporarily unavailable».
test('the post-deploy warm-up regenerates /legendaries/, /heroes/ and /standard/matchups/ through the revalidate route', async () => {
  const stand = await warmStand({});
  try {
    const pages = [
      { path: '/legendaries/', data: 'legendary-group-card', copy: 'Данные временно недоступны' },
      { path: '/heroes/', data: 'id="heroes-solo"', copy: 'Рейтинг героев временно недоступен' },
      { path: '/standard/matchups/', data: 'standard-matchups-open__matrix', copy: 'Загружаем матчапы' },
    ];
    for (const { path, data, copy } of pages) {
      const response = await fetch(`${stand.next.origin}${path}`);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.ok(['HIT', 'STALE', 'MISS'].includes(response.headers.get('x-nextjs-cache')), `${path} is an ISR page: ${response.headers.get('x-nextjs-cache')}`);
      assert.equal(html.includes(data), false, `the build copy of ${path} has no data`);
      assert.ok(html.includes(copy), `the build copy of ${path} says it is unavailable`);
    }
    const { code, output } = await stand.warm({ WARM_ONLY: '/legendaries/,/heroes/,/standard/matchups/', WARM_TOTAL_MS: '30000' });
    assert.equal(code, 0, output);
    assert.ok(stand.revalidations.length >= 1, `the warm-up asked the route to regenerate: ${output}`);
    for (const path of ['/legendaries', '/heroes', '/standard/matchups']) assert.ok(stand.revalidations[0].includes(path), `the route regenerates ${path}`);
    for (const path of ['/legendaries/', '/heroes/', '/standard/matchups/']) assert.match(output, new RegExp(`\\[warm\\] ${path}: with data`), output);
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
