import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { isAbortedRoutePrefetch } from './helpers/abortedRoutePrefetch.mjs';
import { isMenuBackgroundRead, MENU_PATCH_ARCHIVE } from './helpers/menuBackgroundReads.mjs';

// The open layer of a build as Express sends it, with paid values a careless pass-through would leak (sentinel).
const OPEN_DECK = 'AAECAf0GAfKiBALxogTzogQAAA==';
const openBuild = { deckCode: OPEN_DECK, games: 2216, winrate: 57.1, updatedAt: '2026-07-22T21:05:32.877Z',
  sampleRank: 'all', samplePeriod: 'past_30_days', mulliganImpact: 7.1717, keptImpact: 6.2626,
  cards: [{ id: 'TST_001', name: 'Тестовый удар', cost: 1, count: 2, hasPage: true }, { id: 'TST_002', name: 'Тестовый страж', cost: 4, count: 1, hasPage: true },
    { id: 'TIME_875t', name: 'Король Ллейн', cost: 3, count: 1, hasPage: false }] };
const PAID_SENTINELS = ['7.1717', '6.2626', '41.4141'];
const teaser = {
  format: 'wild', formatLabel: 'Вольный', patch: '36.0.3', minimumGames: 50,
  updatedAt: '2026-07-24T12:38:57.727Z', account: 'PRIVATE_ACCOUNT',
  item: {
    slug: 'thief-priest', archetype: 'Thief Priest', archetypeLabel: 'Воровской Жрец',
    translated: true, classKey: 'priest', format: 'wild', games: 31959,
    winrate: 58.3, popularity: 13.5, turns: 7.9, durationMinutes: 8,
    climbingSpeed: 1.24, deckCount: 1, sourceUrl: 'https://www.hsguru.com/meta',
    builds: [openBuild],
  },
  featuredBuild: { games: 2216, winrate: 57.1, updatedAt: null,
    sampleRank: 'all', samplePeriod: 'past_30_days', deckCode: 'PRIVATE_FEATURED_DECK' },
  history: [{ recordedAt: 'PRIVATE_HISTORY', winrate: 41.4141 }],
  analysis: { private: 'PRIVATE_ANALYSIS', cardStats: [{ cardId: 'TST_001', mulliganImpact: 7.1717, keptImpact: 6.2626 }] },
};
// Standard archetypes: one strong enough to be indexed, one that is not; the catalog gives the summary its neighbours.
const catalogRow = (format, slug, label, english, classKey, games, winrate, popularity, deckCount) => ({
  slug, archetype: english, archetypeLabel: label, translated: true, classKey, format, games, winrate, popularity, turns: 7.9,
  durationMinutes: 8, climbingSpeed: 1.24, deckCount, sourceUrl: 'https://www.hsguru.com/meta', builds: [{ deckCode: 'PRIVATE_DECK' }],
});
const STANDARD_ROWS = [
  catalogRow('standard', 'zoolock', 'Зоолок', 'Zoolock', 'warlock', 14800, 61.2, 20.4, 9),
  catalogRow('standard', 'cube-warlock', 'Куб Чернокнижник', 'Cube Warlock', 'warlock', 9000, 55.5, 8, 2),
  catalogRow('standard', 'handlock', 'Ханделок', 'Handlock', 'warlock', 5000, 52, 5, 9),
  catalogRow('standard', 'wincon-warlock', 'Вин-кон Чернокнижник', 'Wincon Warlock', 'warlock', 2000, 49, 2, 1),
  catalogRow('standard', 'weak-warlock', 'Слабый Чернокнижник', 'Weak Warlock', 'warlock', 500, 50, 0.2, 0),
];
const WILD_ROWS = [catalogRow('wild', 'thief-priest', 'Воровской Жрец', 'Thief Priest', 'priest', 31959, 58.3, 13.5, 1)];
// Zoolock lists nine builds (a page of eight and «Загрузить ещё»); Cube Warlock's builds are all refused by the allowlist.
// Zoolock: nine builds, the second refused by the allowlist (a mixed first page). Handlock: the whole first page refused,
// the ninth build valid. Every valid build has its own code. Cube Warlock's builds are all refused.
const deckOf = index => (index ? `AAECAf0GAfKiBALxogTzogQ${'ABCDEFGHI'[index]}AA==` : OPEN_DECK);
const buildsOf = item => (item.slug === 'cube-warlock' ? [{ deckCode: 'PRIVATE_DECK' }, { deckCode: 'PRIVATE_DECK_2' }]
  : Array.from({ length: item.deckCount }, (_, index) => ((item.slug === 'zoolock' && index === 1) || (item.slug === 'handlock' && index < 8)
    ? { deckCode: `PRIVATE_REFUSED_${index}` } : { ...openBuild, deckCode: deckOf(index), games: 2216 - index })));
const teaserOf = (item, offset = 0) => ({ ...teaser, format: item.format, formatLabel: item.format === 'wild' ? 'Вольный' : 'Стандарт',
  item: { ...item, builds: buildsOf(item).slice(offset, offset + 8) }, buildsTotal: buildsOf(item).length, buildsOffset: offset,
  nextOffset: offset + 8 < buildsOf(item).length ? offset + 8 : null });
const catalogOf = format => ({
  format, formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт', patch: '36.0.3', minimumGames: 50, updatedAt: teaser.updatedAt,
  coverage: {}, items: format === 'wild' ? WILD_ROWS : STANDARD_ROWS,
});
const INDEXABLE_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const placeholder = readFileSync(new URL('../public/arena-logo-icon.webp', import.meta.url));

test('Next archetype details isolate access and load builds before independent optional sections', async () => {
  let member = false, optionalMode = 'hold', coreFails = false, coreEmpty = false;
  let releaseOptional;
  let optionalGate = new Promise(resolve => { releaseOptional = resolve; });
  const sectionCalls = [];
  const legacy = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const pathname = new URL(request.url, 'http://fixture').pathname;
    if (pathname === '/api/constructed-archetypes/teaser/wild/thief-priest') {
      response.end(JSON.stringify(teaser)); return;
    }
    const standardRow = STANDARD_ROWS.find(row => pathname === `/api/constructed-archetypes/teaser/standard/${row.slug}`);
    if (standardRow) {
      response.end(JSON.stringify(teaserOf(standardRow, Number(new URL(request.url, 'http://fixture').searchParams.get('buildsOffset') ?? 0)))); return;
    }
    if (pathname === '/api/constructed-archetypes/teaser') {
      response.end(JSON.stringify(catalogOf(new URL(request.url, 'http://fixture').searchParams.get('format') === 'wild' ? 'wild' : 'standard'))); return;
    }
    if (pathname.startsWith('/api/constructed-archetypes/teaser/')) {
      response.writeHead(404).end('{"error":"missing"}'); return;
    }
    if (pathname === '/api/constructed-archetypes/wild/thief-priest') {
      const section = new URL(request.url, 'http://fixture').searchParams.get('section');
      sectionCalls.push(section);
      if (!member) { response.writeHead(403).end('{"error":"denied"}'); return; }
      if (section === 'core') {
        if (coreFails) { response.writeHead(502).end('{"error":"Сборки временно недоступны"}'); return; }
        response.end(JSON.stringify({ ...teaser, item: { ...teaser.item, builds: coreEmpty ? [] : [{ deckCode: 'AAEBAa0GValidDeckCode', games: 2216, winrate: 57.1, sourceUrl: '', classKey: 'priest' }] }, history: [], analysis: null })); return;
      }
      if (optionalMode === 'denied' && section === 'analysis') { response.writeHead(403).end('{"error":"access revoked"}'); return; }
      if (optionalMode === 'error') { response.writeHead(502).end('{"error":"Временная ошибка истории"}'); return; }
      const answer = () => {
        if (response.destroyed) return;
        response.end(JSON.stringify(section === 'history' ? { history: [] }
          : section === 'ranks' ? { ranks: { ranks: [], periods: [], cells: [], updatedAt: null } } : { analysis: null }));
      };
      if (optionalMode === 'hold' || optionalMode === 'denied') void optionalGate.then(answer); else answer(); return;
    }
    if (pathname === '/api/subscription/status') { response.end(JSON.stringify({ hasAccess: member === true, entitlements: { standard: member === true }, active: member === true })); return; }
    if (pathname === '/api/deck/render') { response.end(JSON.stringify({ ok: true, ready: true, imageUrl: '/arena-logo-icon.webp', renderer: 'rust', style: 'parchment' })); return; }
    if (pathname === '/api/deck/resolve') { response.end(JSON.stringify({ ok: true, cards: [], sideboards: [], totalCards: 30, deckSizeLimit: 30 })); return; }
    if (pathname === '/api/auth/me' && member) { response.end(JSON.stringify({ user: { id: 'test-member', name: 'Тест', email: 'member@example.test', role: member === 'admin' ? 'admin' : 'user', adminAllowed: member === 'admin' } })); return; }
    if (pathname === '/api/auth/me') {
      response.end('{"user":null,"adminAllowed":false,"contestAdminAllowed":false}'); return;
    }
    if (isMenuBackgroundRead(pathname)) { response.end(JSON.stringify(MENU_PATCH_ARCHIVE)); return; }
    if (pathname.startsWith('/api/')) {
      response.writeHead(401).end('{"error":"guest"}'); return;
    }
    if (/\.(?:webp|png|jpg|jpeg)$/.test(pathname)) {
      response.setHeader('Content-Type', 'image/webp'); response.end(placeholder); return;
    }
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
    const errors = []; const failed = []; const protectedCalls = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    // Opening the next document cancels the class art the previous one was still fetching: not a failed page.
    const isAbortedImage = request => request.resourceType() === 'image' && request.failure()?.errorText === 'net::ERR_ABORTED';
    page.on('requestfailed', request => { if (!isAbortedRoutePrefetch(request) && !isAbortedImage(request)) failed.push(request.url()); });
    page.on('request', request => {
      if (/^\/api\/constructed-archetypes\/(?!teaser\/)/.test(new URL(request.url()).pathname)) protectedCalls.push(request.url());
    });
    // The strong Standard archetype is the only one offered to search engines; every page carries the plates and the class links.
    // The old `meta` family is redirected by nginx; served without it (here) it names the archetype URL as canonical.
    const NOINDEX = 'noindex, follow';
    for (const [path, width, h1, robots, graph, canonicalPath = path] of [
      ['/standard/archetypes/wild/thief-priest/', 1440, 'Воровской Жрец', NOINDEX, false],
      ['/standard/meta/wild/thief-priest/', 390, 'Воровской Жрец', NOINDEX, false, '/standard/archetypes/wild/thief-priest/'],
      ['/standard/archetypes/standard/zoolock/', 1440, 'Зоолок', INDEXABLE_ROBOTS, true],
      ['/standard/archetypes/standard/zoolock/', 390, 'Зоолок', INDEXABLE_ROBOTS, true],
      ['/standard/archetypes/standard/weak-warlock/', 390, 'Слабый Чернокнижник', NOINDEX, false],
      ['/standard/meta/standard/zoolock/', 1440, 'Зоолок', NOINDEX, false, '/standard/archetypes/standard/zoolock/'],
    ]) {
      await page.setViewport({ width, height: 900 });
      const response = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
      assert.equal(response.status(), 200);
      await page.evaluate(axe);
      const document = await page.evaluate(async () => ({
        html: document.documentElement.outerHTML,
        canonical: document.querySelector('link[rel=canonical]')?.href,
        robots: document.querySelector('meta[name=robots]')?.content,
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        main: document.querySelectorAll('main').length,
        overflow: document.documentElement.scrollWidth > innerWidth,
        graphs: document.querySelectorAll('script[type="application/ld+json"]').length,
        summary: (summary => summary && { heading: summary.querySelector('h2')?.textContent, height: summary.getBoundingClientRect().height,
          right: summary.getBoundingClientRect().right, inMain: Boolean(summary.closest('main')) })(document.querySelector('.archetype-seo-summary')),
        accessibility: (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
          .violations.map(violation => violation.id),
      }));
      assert.deepEqual(document.h1, [h1], path);
      assert.equal(document.main, 1, path);
      assert.equal(document.overflow, false, `${path} at ${width}px`);
      assert.deepEqual(document.accessibility, [], path);
      assert.equal(document.canonical, `https://hearthpulse.net${canonicalPath}`);
      assert.equal(document.robots, robots, path);
      assert.equal(document.graphs, graph ? 1 : 0, `${path} JSON-LD`);
      assert.match(document.summary?.heading ?? '', /^Среди архетипов /, `${path} shows the plates`);
      assert.ok(document.summary.inMain && document.summary.height > 150 && document.summary.right <= width, `${path} summary sits in <main> inside the viewport`);
      assert.equal(document.html.includes('PRIVATE_'), false);
      // Deck codes are open (owner decision 2026-11-18); mulligan and card statistics and history are not.
      assert.equal(document.html.includes(OPEN_DECK), h1 !== 'Слабый Чернокнижник', `${path} shows the open deck code`);
      for (const paid of PAID_SENTINELS) assert.equal(document.html.includes(paid), false, `${path} carries ${paid}`);
    }
    // The server answer itself (HTML with its RSC payload and JSON-LD, and the RSC payload of a client navigation) carries no paid value.
    for (const init of [{}, { headers: { RSC: '1' } }]) {
      const body = await (await fetch(`${origin}/standard/archetypes/standard/zoolock/`, init)).text();
      assert.ok(body.includes(OPEN_DECK) && body.includes('/standard/cards/standard/TST_001/'), `${JSON.stringify(init)} carries the open build`);
      for (const paid of [...PAID_SENTINELS, 'mulliganImpact', 'keptImpact', 'PRIVATE_']) {
        assert.equal(body.includes(paid), false, `${JSON.stringify(init)} carries ${paid}`);
      }
    }
    const graph = JSON.parse(await page.goto(`${origin}/standard/archetypes/standard/zoolock/`, { waitUntil: 'networkidle2' })
      .then(() => page.$eval('script[type="application/ld+json"]', node => node.textContent)));
    assert.deepEqual(graph['@graph'].map(node => node['@type']), ['Organization', 'BreadcrumbList', 'ItemPage', 'Dataset']);
    assert.equal(JSON.stringify(graph).includes('isAccessibleForFree'), false, 'the deck code is not marked as paid');
    // A guest copies the deck code.
    await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
    await page.click('button[aria-label="Скопировать код колоды: Зоолок, сборка 1"]');
    await page.waitForSelector('button[aria-label="Код скопирован: Зоолок, сборка 1"]');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), OPEN_DECK);
    // Every build is open, for a guest too: a page of eight in the HTML, «Загрузить ещё» for the rest. The next page starts
    // where the source's page ended, whatever the allowlist refused: no build twice, none skipped.
    const pressButton = text => page.$$eval('button', (nodes, name) => {
      const button = nodes.find(node => node.textContent.trim() === name);
      button?.click();
      return Boolean(button);
    }, text);
    const openBuilds = () => page.$$eval('section[aria-labelledby="archetype-open-builds-title"] article', nodes => nodes.map(node => [
      node.querySelector('h3')?.textContent, node.querySelector('code')?.textContent]));
    assert.equal((await openBuilds()).length, 7, 'the refused second build is left out');
    assert.ok(await pressButton('Загрузить ещё 1'), 'the guest gets «Загрузить ещё»');
    await page.waitForFunction(() => document.body.textContent.includes('Зоолок, сборка 8'));
    await delay(300);
    assert.deepEqual((await openBuilds()).slice(-2), [['Зоолок, сборка 7', deckOf(7)], ['Зоолок, сборка 8', deckOf(8)]]);
    assert.equal(new Set((await openBuilds()).map(([, code]) => code)).size, 8, 'every build once');
    assert.equal(await page.$$eval('button', nodes => nodes.some(node => node.textContent.includes('Загрузить ещё'))), false, 'nothing more to load');
    assert.ok(await page.$('ol[aria-label="Карты: Зоолок, сборка 8"] a[href="/standard/cards/standard/TST_002/"]'));
    // A first page refused whole still offers the next one, which has a valid build.
    await page.goto(`${origin}/standard/archetypes/standard/handlock/`, { waitUntil: 'networkidle2' });
    assert.equal((await openBuilds()).length, 0);
    assert.ok(await pressButton('Загрузить ещё 1'), 'the guest gets «Загрузить ещё»');
    await page.waitForFunction(() => document.body.textContent.includes('Ханделок, сборка 1'));
    assert.deepEqual(await openBuilds(), [['Ханделок, сборка 1', deckOf(8)]]);
    // Without open builds (none, or all refused) the paywall sells only what is paid and nothing says decks are paid.
    for (const [path, state] of [['/standard/archetypes/standard/weak-warlock/', 'Колоды появятся, когда наберётся выборка'],
      ['/standard/archetypes/standard/cube-warlock/', 'Сборок пока нет.']]) {
      const html = await (await fetch(`${origin}${path}`)).text();
      assert.ok(html.includes(state) && !html.includes('Загружаем сборки архетипа'), `${path}: a short state, not a skeleton, without builds`);
      await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
      await page.waitForSelector('.arena-inline-paywall--archetype');
      assert.equal(await page.$eval('.arena-inline-paywall--archetype h2', node => node.textContent), 'Матчапы, муллиган и история', path);
      const text = await page.evaluate(() => document.body.textContent);
      assert.ok(!/Колоды, матчапы|коды колод|Состав и код колоды/i.test(text), `${path} sells decks as paid`);
    }
    // Without JavaScript the strong page still reads: its plates, the date, the source and the class links; the page's own
    // content (without the menu and the footer) stays above the indexing threshold.
    const plain = await browser.newPage();
    await plain.setJavaScriptEnabled(false);
    await plain.goto(`${origin}/standard/archetypes/standard/zoolock/`, { waitUntil: 'domcontentloaded' });
    const bare = await plain.evaluate(() => {
      const summary = document.querySelector('.archetype-seo-summary');
      const heading = [...document.querySelectorAll('h2')].find(node => node.textContent === 'Сборки архетипа');
      const builds = heading?.closest('section');
      const main = document.querySelector('main')?.cloneNode(true);
      main?.querySelectorAll('nav:not(.archetype-seo-summary__class), footer').forEach(node => node.remove());
      return { text: (summary?.innerText ?? '').replaceAll('\u00a0', ' '), time: summary?.querySelector('time')?.getAttribute('datetime'),
        main: main?.textContent ?? '',
        links: [...(summary?.querySelectorAll('a[href^="/standard/archetypes/standard/"]') ?? [])].length,
        // The page's headings in order: the builds come right after the archetype's name and metrics.
        headings: [...document.querySelectorAll('h1, h2')].map(node => node.textContent),
        builds: builds && {
          text: builds.innerText.replaceAll('\u00a0', ' ').toLowerCase(),
          titles: [...builds.querySelectorAll('h3')].map(node => node.textContent),
          code: builds.querySelector('code')?.textContent, time: builds.querySelector('time')?.getAttribute('datetime'),
          cards: [...(builds.querySelector('ol[aria-label="Карты: Зоолок, сборка 1"]')?.querySelectorAll('a') ?? [])]
            .map(link => [link.textContent, link.getAttribute('href')]),
        } };
    });
    await plain.close();
    // shared/seoIndexThreshold.ts: at least 150 own words or at least 10 own facts (here: the numbers the page states).
    const tokens = bare.main.split(/\s+/);
    const ownWords = tokens.filter(token => /[\p{L}\p{N}]/u.test(token)).length;
    const ownNumbers = tokens.filter(token => /\d/.test(token)).length;
    assert.ok(ownWords >= 150 || ownNumbers >= 10, `${ownWords} own words, ${ownNumbers} numbers without JavaScript`);
    for (const phrase of ['Насколько силён', 'Как читать эти цифры', 'в этом тексте их нет', 'В каталог входят']) assert.ok(!bare.text.includes(phrase), phrase);
    for (const part of ['место по играм\n1 из 5', 'медиана класса\n53,8% +7,5 п. п.\nсреди 4 архетипов чернокнижника от 1 000 игр', 'источник: hsguru', 'другие архетипы чернокнижника']) {
      assert.ok(bare.text.toLowerCase().includes(part), `«${part}» in ${bare.text}`);
    }
    assert.equal(bare.time, '2026-07-24T12:38:57.727Z');
    assert.ok(bare.links >= 3 && bare.links <= 6, `${bare.links} class links`);
    // Right after the metrics, without JavaScript: the build's numbers, date, source, linked cards and code.
    assert.deepEqual(bare.headings.slice(0, 2), ['Зоолок', 'Сборки архетипа']);
    assert.equal(bare.builds.titles.length, 7, 'the first page of builds, less the refused one, is in the HTML');
    assert.ok(['9 сборок', 'король ллейн', 'винрейт', '57,1%', 'игры', '2 216', 'hsguru', 'тестовый удар ×2'].every(part => bare.builds.text.includes(part)), bare.builds.text);
    assert.equal(bare.builds.time, '2026-07-22T21:05:32.877Z');
    assert.equal(bare.builds.code, OPEN_DECK);
    assert.deepEqual(bare.builds.cards, [['Тестовый удар', '/standard/cards/standard/TST_001/'], ['Тестовый страж', '/standard/cards/standard/TST_002/']]);
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    assert.deepEqual(protectedCalls, []);
    for (const path of ['/standard/archetypes/invalid/thief-priest/', '/standard/meta/wild/missing/']) {
      assert.equal((await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' })).status(), 404);
    }
    member = true;
    await page.evaluateOnNewDocument(() => {
      window.__detailCls = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__detailCls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const started = Date.now();
    await page.goto(`${origin}/standard/archetypes/wild/thief-priest/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.archetype-builds', { timeout: 5_000 });
    assert.ok(Date.now() - started < 5_000, 'builds must render while optional responses remain held');
    assert.equal(await page.$eval('h1', node => node.textContent), 'Воровской Жрец');
    await page.waitForFunction(() => document.querySelectorAll('section[data-loading=true]').length === 3);
    await delay(10_000);
    assert.ok(await page.$('.archetype-builds'), 'ten seconds of optional latency must not hide the build');
    assert.deepEqual(sectionCalls.slice(-4).sort(), ['analysis', 'core', 'history', 'ranks']);
    assert.ok(await page.evaluate(() => window.__detailCls < 0.1), 'core loading must not push visible optional placeholders away');
    releaseOptional();
    await page.waitForFunction(() => document.querySelectorAll('section[data-loading=true]').length === 0);
    optionalMode = 'error';
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.querySelectorAll('button').length > 0 && [...document.querySelectorAll('button')].some(node => node.textContent === 'Повторить загрузку'));
    assert.ok(await page.$('.archetype-builds'), 'optional errors leave the build usable');
    assert.ok(await page.$eval('section[aria-label="История архетипа"] button', node => node.getBoundingClientRect().height >= 44));
    await page.evaluate(axe);
    assert.deepEqual(await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(item => item.id)), []);
    const coreCalls = sectionCalls.filter(section => section === 'core').length;
    optionalMode = 'ready';
    const retry = await page.$('section[aria-label="История архетипа"] button'); await retry.click();
    await page.waitForSelector('.archetype-history');
    assert.equal(sectionCalls.filter(section => section === 'core').length, coreCalls, 'retry only the failed block');
    coreFails = true;
    await page.reload({ waitUntil: 'networkidle2' });
    assert.equal(await page.$eval('h1', node => node.textContent), 'Воровской Жрец', 'public identity survives a core failure');
    const openHeading = () => page.$eval('#archetype-open-builds-title', node => node.textContent).catch(() => null);
    assert.equal(await openHeading(), 'Сборки архетипа', 'a failed paid answer keeps the open builds for a subscriber');
    // One «Сборки архетипа» on the page: the failed gallery is a line with its retry, not a second section that says builds are unavailable.
    const coreFailed = await page.evaluate(() => ({
      headings: [...document.querySelectorAll('h2')].filter(node => node.textContent === 'Сборки архетипа').length,
      regions: document.querySelectorAll('section[aria-label="Сборки архетипа"]').length,
      line: document.querySelector('[role="status"]:has(button)')?.textContent,
      text: document.querySelector('main').textContent,
    }));
    assert.deepEqual([coreFailed.headings, coreFailed.regions], [1, 0]);
    assert.equal(coreFailed.line, 'Галерея подписчика не загрузилась, ниже — открытые сборки. Повторить загрузку');
    assert.equal(coreFailed.text.includes('Сборки временно недоступны'), false);
    const optionalCalls = sectionCalls.filter(section => section !== 'core').length;
    coreFails = false;
    await page.click('[role="status"] button');
    await page.waitForSelector('.archetype-builds');
    assert.equal(sectionCalls.filter(section => section !== 'core').length, optionalCalls);
    assert.equal(await openHeading(), null, 'the subscriber gallery takes the place of the open builds');
    coreEmpty = true;
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('.archetype-history');
    assert.equal(await openHeading(), 'Сборки архетипа', 'an empty paid answer keeps the open builds');
    coreEmpty = false;
    optionalGate = new Promise(resolve => { releaseOptional = resolve; });
    optionalMode = 'denied';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.textContent.includes('Доступ изменился'));
    assert.equal(await page.$('.archetype-builds'), null, 'a rejected section immediately removes all protected data');
    releaseOptional();
    await delay(300);
    assert.equal(await page.$('.archetype-history'), null, 'a late cancelled history reply must not restore paid data');
    optionalMode = 'ready';
    const chunkDirectory = new URL('../apps/public-web/.next/static/chunks/', import.meta.url);
    const analysisChunks = readdirSync(chunkDirectory, { recursive: true }).filter(file => file.endsWith('.js')
      && readFileSync(new URL(file, chunkDirectory), 'utf8').includes('constructed-analysis-stack'));
    assert.ok(analysisChunks.length > 0, 'the build must contain the optional analysis chunk');
    const chunkPage = await browser.newPage();
    const blockedChunks = [];
    await chunkPage.setCacheEnabled(false);
    await chunkPage.setRequestInterception(true);
    chunkPage.on('request', request => {
      const blocked = analysisChunks.some(file => new URL(request.url()).pathname.endsWith(`/${file}`));
      if (blocked) blockedChunks.push(request.url());
      void (blocked ? request.abort() : request.continue()).catch(() => {});
    });
    await chunkPage.goto(`${origin}/standard/archetypes/wild/thief-priest/`, { waitUntil: 'networkidle2' });
    await chunkPage.waitForSelector('section[aria-label="Матчапы и муллиган"] [data-recovery-state="error"]');
    assert.ok(blockedChunks.length > 0, 'the analysis chunk failure must actually be exercised');
    assert.ok(await chunkPage.$('.archetype-builds'), 'an optional code failure must not remove the build');
    assert.equal(await chunkPage.$eval('h1', node => node.textContent), 'Воровской Жрец');
    await chunkPage.close();
    member = false;
    await page.reload({ waitUntil: 'networkidle2' });
    assert.equal(await page.$('.archetype-builds'), null, 'logout removes protected builds');
    assert.equal(await page.$('.archetype-history'), null, 'logout removes protected history');
    member = 'admin';
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('.archetype-builds');
    assert.ok(await page.$('.archetype-history'), 'administrator access remains independent of a subscription');
    await page.close();
  } finally {
    releaseOptional();
    if (browser) await browser.close();
    if (gateway) await closeLocal(gateway);
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await closeLocal(legacy);
  }
});
