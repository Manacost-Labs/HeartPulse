import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, resolve, sep } from 'node:path';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';

// Anonymous public data that pages used to fetch after hydration is in the
// first HTML: the meta and fun-deck guest previews and the archetype catalog
// teaser. A guest makes no request for it, only the free decks reach the HTML,
// the dates hydrate without a mismatch in another time zone, and a stalled
// Express read gives up and leaves the browser request as before.

const metaItem = index => ({
  id: `meta-${index}`, slug: `meta-${index}`, archetype: `Archetype ${index}`, archetypeLabel: `Архетип ${index}`,
  translated: true, classKey: 'mage', winrate: 50 + index, popularity: 3 + index, games: 1000 * index,
  turns: null, durationMinutes: null, climbingSpeed: null,
});
// Express answers the teaser with the games of the whole slice, which has more rows than the three it shows.
const metaTotalGames = 52_500;
const metaTeaser = period => ({
  format: 'standard', formatLabel: 'Стандарт', rank: 'diamond_legend', rankLabel: 'Алмаз — Легенда', period,
  availablePeriods: ['past_day', 'past_week', 'patch_36.6.3'], currentPeriod: 'patch_36.6.3',
  currentPatchPeriod: 'patch_36.6.3', coin: 'any_player', minGames: 100, source: 'hsguru', sourceUrl: '',
  translationSource: '', updatedAt: '2026-10-03T10:00:00.000Z', totalGames: metaTotalGames,
  items: [metaItem(1), metaItem(2), metaItem(3)],
});
const archetype = (slug, games) => ({
  slug, archetype: slug, archetypeLabel: `Архетип ${slug}`, translated: true, classKey: 'priest', format: 'standard',
  games, winrate: 52.1, popularity: 4.2, turns: 8, durationMinutes: 7, climbingSpeed: 1, deckCount: 3,
  sourceUrl: 'https://www.hsguru.com/meta', builds: [{ deckCode: 'PAID_BUILD_CODE' }],
});
const catalog = {
  format: 'standard', formatLabel: 'Стандарт', patch: '36.6.3', minimumGames: 50,
  updatedAt: '2026-10-03T21:30:00.000Z', coverage: {}, items: [archetype('fixture-a', 9000), archetype('fixture-b', 4000)],
};
const funDeck = (code, firstSeenAt, format = 'Standard', cards = [{ id: 'FIX_CARD_1', name: 'Фикстурная карта', cost: 1, count: 2, hasPage: true }]) => ({
  title: `Колода ${code}`, deckCode: code, format, className: 'mage', streamer: null, funScore: 0.7,
  maxMetaSimilarity: 0.3, nearestArchetype: null, winRate: 51, games: 120, reasons: [], url: null,
  firstSeenAt, lastSeenAt: null, ...(cards ? { cards } : {}),
});
const funDecks = {
  fetchedAt: '2026-10-03T10:00:00.000Z', stats: { total: 7, standard: 6, wild: 1 },
  methodology: { detectorVersion: 'v3', minFunScore: 0.55, maxMetaSimilarity: 0.42 },
  decks: [funDeck('TOKEN_DECK', '2026-06-01', 'Standard', [{ id: 'TIME_609t1', name: 'Рейнджер-капитан Алерия', cost: 3, count: 1, hasPage: false }, { id: null, name: null, cost: null, count: 1, hasPage: false }]),
    funDeck('NO_LIST_DECK', '2026-05-01', 'Standard', null), funDeck('FREE_DECK_C', '2026-09-20'), funDeck('OLDER_DECK', '2026-08-01'), funDeck('FREE_DECK_A', '2026-10-02'),
    funDeck('FREE_DECK_B', '2026-10-01'), funDeck('OLDEST_DECK', '2026-07-01', 'Wild')],
};

// A value of the meta banner's summary by its visible caption.
const summaryValue = (page, caption) => page.$$eval('#root dl[aria-label="Сводка меты"] > div', (rows, wanted) => (
  rows.find(row => row.querySelector('dt')?.textContent === wanted)?.querySelector('dd')?.textContent ?? null), caption);

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

function startLegacy(state) {
  const publicRoot = resolve('public');
  const respond = (url, response) => {
    const path = url.pathname;
    const staticFile = resolve(publicRoot, `.${path}`);
    if (staticFile.startsWith(`${publicRoot}${sep}`) && existsSync(staticFile) && statSync(staticFile).isFile()) {
      response.setHeader('Content-Type', { '.webp': 'image/webp', '.png': 'image/png', '.otf': 'font/otf',
        '.woff2': 'font/woff2' }[extname(staticFile)] ?? 'application/octet-stream');
      response.end(readFileSync(staticFile));
      return;
    }
    const payload = path === '/api/auth/me' ? { user: null }
      : path === '/api/standard-meta/public' ? metaTeaser('patch_36.6.3')
        : path === '/api/constructed-archetypes/teaser' ? catalog
          : path === '/api/fun-decks' ? funDecks
            : null;
    response.setHeader('Content-Type', 'application/json');
    response.writeHead(payload ? 200 : 404).end(JSON.stringify(payload ?? { error: 'missing' }));
  };
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://fixture');
    const browser = Boolean(request.headers['x-forwarded-host']);
    state.reads.push({ path: `${url.pathname}${url.search}`, cookie: request.headers.cookie ?? '', browser });
    // Latency and stalls apply to server reads only; the browser, through the gateway, is answered at once.
    const serverRead = !browser && /^\/api\/(standard-meta|constructed-archetypes|fun-decks)/.test(url.pathname);
    if (serverRead && state.stall) return;
    if (serverRead && state.delay) setTimeout(() => respond(url, response), state.delay);
    else respond(url, response);
  });
}

test('public previews render on the server and hydrate without a guest data request', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before browser QA');
  const state = { reads: [], stall: false, delay: 0 };
  const legacy = startLegacy(state);
  const legacyOrigin = await listen(legacy);
  const next = await startNextServer({ legacyOrigin });
  const gateway = createPublicWebGateway({ legacyOrigin, nextOrigin: next.origin, enabled: true, pagesEnabled: true });
  const origin = await listen(gateway);
  let browser;
  // /standard/meta/ is prerendered: as after a deploy, mark it stale on the host
  // so the next request regenerates it from the fixture Express.
  const regenerate = async () => {
    const response = await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' });
    assert.equal(response.status, 200, 'the local revalidation call is accepted');
  };
  try {
    await regenerate();
    const metaHtml = await (await fetch(`${origin}/standard/meta/`, { headers: { Cookie: 'session=guest-fixture' } })).text();
    assert.equal(metaHtml.match(/class="standard-meta-card"/g)?.length, 3, 'the three teaser archetypes are in the HTML');
    assert.match(metaHtml, /Архетипов<\/dt><dd>3<\/dd>/, 'the summary counts the open rows, not a placeholder zero');
    // 1 000 + 2 000 + 3 000 are the shown rows; the sample is the slice's.
    assert.match(metaHtml, /Игр в выборке<\/dt><dd>52\s500<\/dd>/, 'the guest sample is the whole slice, not the three shown rows');
    assert.doesNotMatch(metaHtml, /data-arrive/, 'server-rendered data does not fade in');
    // The chart is part of the document with its stylesheet: no loader before it and no unstyled reveal.
    assert.match(metaHtml, /class="standard-meta-chart"/);
    assert.doesNotMatch(metaHtml, /data-loading-surface/, 'no loader is rendered for data the HTML already has');
    const stylesheets = [...metaHtml.matchAll(/href="(\/_next\/static\/css\/[^"]+\.css)"/g)].map(match => match[1]);
    const css = (await Promise.all([...new Set(stylesheets)].map(href => fetch(`${origin}${href}`).then(response => response.text())))).join('');
    assert.match(css, /\.standard-meta-chart__header\{/, 'the chart stylesheet loads with the document');
    assert.deepEqual(state.reads.filter(read => read.path.startsWith('/api/standard-meta')).map(read => read.path).slice(0, 1), [
      '/api/standard-meta/public?format=standard',
    ], 'one read of the open general slice, filters fixed by Express');
    assert.deepEqual([...new Set(state.reads.map(read => read.cookie))], [''], 'server reads never forward cookies');

    const archetypesHtml = await (await fetch(`${origin}/standard/archetypes/`)).text();
    assert.equal(archetypesHtml.match(/class="archetype-row"/g)?.length, 2);
    assert.doesNotMatch(archetypesHtml, /PAID_BUILD_CODE/, 'builds are paid data');

    const funHtml = await (await fetch(`${origin}/standard/fun-decks/`)).text();
    assert.equal(funHtml.match(/class="archetype-open-build"/g)?.length, 7, 'the open list holds every deck of the selection on the server');
    for (const code of ['FREE_DECK_A', 'FREE_DECK_B', 'FREE_DECK_C', 'OLDER_DECK', 'OLDEST_DECK', 'TOKEN_DECK', 'NO_LIST_DECK']) assert.match(funHtml, new RegExp(`<code>${code}</code>`));
    assert.match(funHtml, /<a href="\/standard\/cards\/standard\/FIX_CARD_1\/">Фикстурная карта<\/a> ×2/, 'with the cards of the deck, linked to the card page of the deck\'s format');
    assert.match(funHtml, /<a href="\/standard\/cards\/wild\/FIX_CARD_1\/">/, 'a wild deck links to the card pages of Wild');
    // A card outside the catalog is named without a link, one nobody knows keeps its place, a deck without a list keeps its code.
    assert.match(funHtml, /<span>Рейнджер-капитан Алерия<\/span>/);
    assert.doesNotMatch(funHtml, /<a [^>]*TIME_609t1/);
    assert.match(funHtml, /Неизвестная карта/);
    const robotHtml = await (await fetch(`${origin}/standard/fun-decks/`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } })).text();
    // Resource hints follow the order the render finishes in, which varies between requests: they are not content.
    const withoutHints = html => html.replace(/<link rel="preload"[^>]*\/>/g, '');
    assert.equal(withoutHints(robotHtml), withoutHints(funHtml), 'a robot and a guest get the same HTML');
    assert.ok(funHtml.indexOf('FREE_DECK_A') < funHtml.indexOf('FREE_DECK_B') && funHtml.indexOf('FREE_DECK_B') < funHtml.indexOf('FREE_DECK_C'), 'the newest first');

    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const [path, ready] of [['/standard/meta/', '.standard-meta-card'], ['/standard/archetypes/', '.archetype-row'],
      ['/standard/fun-decks/', '.fun-deck-tiles']]) {
      const page = await browser.newPage();
      // Another zone than the server's: a date rendered differently would break hydration.
      await page.emulateTimezone('Asia/Vladivostok');
      const errors = [];
      const dataRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        // The fixture has no deck lists or card art; their 404s are not what this test checks.
        if (message.type() === 'error' && !/^Failed to load resource/.test(message.text())) errors.push(message.text());
      });
      page.on('request', request => {
        const { pathname } = new URL(request.url());
        if (/^\/api\/(standard-meta|constructed-archetypes|fun-decks)/.test(pathname)) dataRequests.push(pathname);
      });
      await page.goto(`${origin}${path}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector(`#root ${ready}`, { visible: true });
      // Only the fun-deck page loads its complete list behind the preview, for filters and subscribers.
      assert.deepEqual(dataRequests, path === '/standard/fun-decks/' ? ['/api/fun-decks'] : [], `${path} guest data requests`);
      assert.deepEqual(errors, [], `${path} hydrates without errors`);
      assert.equal(await page.$('#root [data-loading-surface="panel"]'), null,
        `${path} shows no loader for server-rendered data`);
      if (path === '/standard/meta/') {
        assert.match(await summaryValue(page, 'Игр в выборке'), /^52\s500$/, 'hydration keeps the slice sample');
        // The collapsed chart is server-rendered; its plot loads when opened.
        await page.click('#root .standard-meta-chart__header-actions button');
        await page.waitForSelector('#root .standard-meta-map .ui-scatter-chart__point', { visible: true });
      }
      if (path === '/standard/archetypes/') {
        await page.waitForFunction(() => /обновлено 4 окт\., 07:30/.test(document.querySelector('#root .archetypes-tools small')?.textContent ?? ''));
      }
      await page.close();
    }

    // A slow Express during a regeneration: the meta reads run in parallel (the
    // period is known from the first request) and fit the budget.
    state.delay = 350;
    await regenerate();
    let started = Date.now();
    const slowHtml = await (await fetch(`${origin}/standard/meta/`)).text();
    assert.ok(Date.now() - started < 1500, `a slow Express read is awaited in parallel (${Date.now() - started} ms)`);
    assert.equal(slowHtml.match(/class="standard-meta-card"/g)?.length, 3, 'the read fits the budget');
    state.delay = 0;

    // A stalled Express at the deploy's warm-up: the revalidate route's probe gives up after its 5 s budget and leaves the page as it
    // is, so nobody waits for a regeneration that has no data and nobody gets a 500 or the loader instead of the earlier copy.
    state.stall = true;
    started = Date.now();
    const answer = await (await fetch(`${next.origin}/health/next/revalidate/`, { method: 'POST' })).json();
    const probeMs = Date.now() - started;
    assert.ok(probeMs < 9000, `the probe gives up at its budget (${probeMs} ms)`);
    assert.ok(answer.skipped.some(item => item.path === '/standard/meta' && item.reason === 'source-unavailable'), 'the meta page is skipped');
    assert.ok(!answer.revalidated.includes('/standard/meta'));
    started = Date.now();
    const kept = await (await fetch(`${origin}/standard/meta/`)).text();
    assert.ok(Date.now() - started < 1500, 'the earlier copy is served at once');
    assert.equal(kept.match(/class="standard-meta-card"/g)?.length, 3, 'with the numbers it had');

    // A stalled Express during a regeneration: it gives up after the 5 s
    // budget with the loader (no 500), and the browser loads the teaser itself.
    // The probe passes (Express answers), the page is marked stale, and only then the source stalls for the regeneration.
    state.stall = false;
    await regenerate();
    state.stall = true;
    started = Date.now();
    const stalled = await (await fetch(`${origin}/standard/meta/`)).text();
    const stalledMs = Date.now() - started;
    assert.ok(stalledMs >= 4500 && stalledMs < 9000, `a stalled Express read gives up at the budget (${stalledMs} ms)`);
    assert.match(stalled, /data-loading-surface="panel"/, 'without data the page renders its loader');
    assert.match(stalled, /Архетипов<\/dt><dd><span class="loading-block loading-value"/, 'and no fake zero: a value placeholder');
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const browserReads = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/standard-meta/public') browserReads.push(request.url());
    });
    await page.goto(`${origin}/standard/meta/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#root .standard-meta-card', { visible: true });
    assert.ok(browserReads.length >= 1, 'the browser loads the teaser the server could not');
    assert.match(await page.$eval('#root .traditional-mode-banner__summary dd', node => node.textContent), /^3$/);
    assert.match(await summaryValue(page, 'Игр в выборке'), /^52\s500$/, 'the teaser the browser loads itself shows the slice sample too');
    assert.deepEqual(errors, []);
    await page.close();
    state.stall = false;
  } finally {
    if (browser) await browser.close();
    gateway.closeAllConnections();
    await new Promise(done => gateway.close(done));
    await next.close();
    legacy.closeAllConnections();
    await new Promise(done => legacy.close(done));
  }
});
