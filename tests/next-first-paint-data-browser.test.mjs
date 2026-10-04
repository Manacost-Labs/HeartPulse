import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { extname, resolve, sep } from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer';
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
  turns: 8, durationMinutes: 7, climbingSpeed: 1,
});
const metaTeaser = period => ({
  format: 'standard', formatLabel: 'Стандарт', rank: 'diamond_legend', rankLabel: 'Алмаз — Легенда', period,
  availablePeriods: ['past_day', 'past_week', 'patch_36.6.3'], currentPeriod: 'patch_36.6.3',
  currentPatchPeriod: 'patch_36.6.3', coin: 'any_player', minGames: 100, source: 'hsguru', sourceUrl: '',
  translationSource: '', updatedAt: '2026-10-03T10:00:00.000Z', items: [metaItem(1), metaItem(2), metaItem(3)],
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
const funDeck = (code, firstSeenAt) => ({
  title: `Колода ${code}`, deckCode: code, format: 'Standard', className: 'mage', streamer: null, funScore: 0.7,
  maxMetaSimilarity: 0.3, nearestArchetype: null, winRate: 51, games: 120, reasons: [], url: null,
  firstSeenAt, lastSeenAt: null,
});
const funDecks = {
  fetchedAt: '2026-10-03T10:00:00.000Z', stats: { total: 5, standard: 5, wild: 0 },
  methodology: { detectorVersion: 'v3', minFunScore: 0.55, maxMetaSimilarity: 0.42 },
  decks: [funDeck('FREE_DECK_C', '2026-09-20'), funDeck('PAID_DECK_OLD', '2026-08-01'), funDeck('FREE_DECK_A', '2026-10-02'),
    funDeck('FREE_DECK_B', '2026-10-01'), funDeck('PAID_DECK_OLDEST', '2026-07-01')],
};

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
      : path === '/api/standard-meta/teaser' ? metaTeaser(url.searchParams.get('period') ?? 'past_day')
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
  try {
    const metaHtml = await (await fetch(`${origin}/standard/meta/`, { headers: { Cookie: 'session=guest-fixture' } })).text();
    assert.equal(metaHtml.match(/class="standard-meta-card"/g)?.length, 3, 'the three teaser archetypes are in the HTML');
    assert.match(metaHtml, /В предпросмотре<\/dt><dd>3<\/dd>/, 'the summary counts the teaser, not a placeholder zero');
    assert.doesNotMatch(metaHtml, /data-arrive/, 'server-rendered data does not fade in');
    // The chart is part of the document with its stylesheet: no loader before it and no unstyled reveal.
    assert.match(metaHtml, /class="standard-meta-chart"/);
    assert.doesNotMatch(metaHtml, /data-loading-surface/, 'no loader is rendered for data the HTML already has');
    const stylesheets = [...metaHtml.matchAll(/href="(\/_next\/static\/css\/[^"]+\.css)"/g)].map(match => match[1]);
    const css = (await Promise.all([...new Set(stylesheets)].map(href => fetch(`${origin}${href}`).then(response => response.text())))).join('');
    assert.match(css, /\.standard-meta-chart__header\{/, 'the chart stylesheet loads with the document');
    assert.deepEqual(state.reads.filter(read => read.path.startsWith('/api/standard-meta')).map(read => read.path), [
      '/api/standard-meta/teaser?format=standard&rank=diamond_legend&coin=any_player&min_games=100',
      '/api/standard-meta/teaser?format=standard&rank=diamond_legend&coin=any_player&min_games=100&period=patch_36.6.3',
    ], 'Express answers its own default period first; the page opens on the current one');
    assert.deepEqual([...new Set(state.reads.map(read => read.cookie))], [''], 'server reads never forward cookies');

    const archetypesHtml = await (await fetch(`${origin}/standard/archetypes/`)).text();
    assert.equal(archetypesHtml.match(/class="archetype-row"/g)?.length, 2);
    assert.doesNotMatch(archetypesHtml, /PAID_BUILD_CODE/, 'builds are paid data');

    const funHtml = await (await fetch(`${origin}/standard/fun-decks/`)).text();
    assert.equal(funHtml.match(/class="fun-deck-card"/g)?.length, 3);
    for (const code of ['FREE_DECK_A', 'FREE_DECK_B', 'FREE_DECK_C']) assert.match(funHtml, new RegExp(code));
    assert.doesNotMatch(funHtml, /PAID_DECK_/, 'only the free preview of the selection reaches the HTML');

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    for (const [path, ready] of [['/standard/meta/', '.standard-meta-card'], ['/standard/archetypes/', '.archetype-row'],
      ['/standard/fun-decks/', '.fun-deck-card']]) {
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
        // The collapsed chart is server-rendered; its plot loads when opened.
        await page.click('#root .standard-meta-chart__header-actions button');
        await page.waitForSelector('#root .standard-meta-chart__point', { visible: true });
      }
      if (path === '/standard/archetypes/') {
        await page.waitForFunction(() => /обновлено 4 окт\., 07:30/.test(document.querySelector('#root .archetypes-tools small')?.textContent ?? ''));
      }
      await page.close();
    }

    // A slow Express: the meta reads run in parallel (the period is known from
    // the first request), so 350 ms each still fits the 600 ms budget.
    state.delay = 350;
    let started = Date.now();
    const slowHtml = await (await fetch(`${origin}/standard/meta/`)).text();
    assert.ok(Date.now() - started < 1500, `a slow Express read is awaited in parallel (${Date.now() - started} ms)`);
    assert.equal(slowHtml.match(/class="standard-meta-card"/g)?.length, 3, 'two parallel reads fit the budget');
    state.delay = 0;

    // A stalled Express: the document leaves after the budget with the loader,
    // and the browser loads the teaser itself.
    state.stall = true;
    started = Date.now();
    const stalled = await (await fetch(`${origin}/standard/meta/`)).text();
    const stalledMs = Date.now() - started;
    assert.ok(stalledMs >= 550 && stalledMs < 2000, `a stalled Express read gives up at the budget (${stalledMs} ms)`);
    assert.match(stalled, /data-loading-surface="panel"/, 'without data the page renders its loader');
    assert.match(stalled, /В предпросмотре<\/dt><dd>—<\/dd>/, 'and no fake zero');
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const browserReads = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname === '/api/standard-meta/teaser') browserReads.push(request.url());
    });
    await page.goto(`${origin}/standard/meta/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#root .standard-meta-card', { visible: true });
    assert.ok(browserReads.length >= 1, 'the browser loads the teaser the server could not');
    assert.match(await page.$eval('#root .traditional-mode-banner__summary dd', node => node.textContent), /^3$/);
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
