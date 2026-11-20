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

// The open layer: a build with its deck code and card list (everything else of a build stays out of the guest answer).
const OPEN_CODE = 'AAEBAa0GBvAEOpOiYwHHYoKZAAA=AAAA';
const openBuild = { deckCode: OPEN_CODE, games: 2216, winrate: 57.1, updatedAt: '2026-07-24T12:38:57.727Z', sampleRank: 'all', samplePeriod: 'past_30_days',
  cards: [{ dbfId: 1, name: 'Гость из Бездны', cost: 3, rarity: 'EPIC', count: 2 }, { dbfId: 2, name: 'Огненный шар', cost: 4, rarity: 'COMMON', count: 1 }],
  privateNote: 'PRIVATE_BUILD' };
// A full open layer: the first twelve builds of 24 cards each, as the endpoint sends a busy archetype.
const fullBuilds = Array.from({ length: 12 }, (_, build) => ({
  ...openBuild, deckCode: `${OPEN_CODE.slice(0, 24)}${String(build).padStart(8, 'B')}`,
  cards: [...openBuild.cards, ...Array.from({ length: 22 }, (_, card) => ({ dbfId: 100 + card, name: `Название карты номер ${card}`, cost: card % 9, rarity: card % 5 ? 'COMMON' : 'RARE', count: 1 + (card % 2) }))],
}));
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
  history: [{ recordedAt: 'PRIVATE_HISTORY', games: 4242424 }],
  analysis: { private: 'PRIVATE_ANALYSIS', classMatchups: [{ classLabel: 'PRIVATE_MATCHUP', winrate: 61.6161 }],
    cardStats: [{ cardName: 'PRIVATE_CARD_STAT', mulliganImpact: 7.1717, keptImpact: 6.2626 }] },
};
// Standard archetypes: one strong enough to be indexed, one that is not; the catalog gives the summary its neighbours.
const catalogRow = (format, slug, label, english, classKey, games, winrate, popularity, deckCount) => ({
  slug, archetype: english, archetypeLabel: label, translated: true, classKey, format, games, winrate, popularity, turns: 7.9,
  durationMinutes: 8, climbingSpeed: 1.24, deckCount, sourceUrl: 'https://www.hsguru.com/meta', builds: deckCount ? [openBuild] : [],
});
const STANDARD_ROWS = [
  { ...catalogRow('standard', 'zoolock', 'Зоолок', 'Zoolock', 'warlock', 14800, 61.2, 20.4, 40), builds: fullBuilds },
  catalogRow('standard', 'cube-warlock', 'Куб Чернокнижник', 'Cube Warlock', 'warlock', 9000, 55.5, 8, 2),
  catalogRow('standard', 'handlock', 'Ханделок', 'Handlock', 'warlock', 5000, 52, 5, 2),
  catalogRow('standard', 'wincon-warlock', 'Вин-кон Чернокнижник', 'Wincon Warlock', 'warlock', 2000, 49, 2, 1),
  catalogRow('standard', 'weak-warlock', 'Слабый Чернокнижник', 'Weak Warlock', 'warlock', 500, 50, 0.2, 0),
];
const WILD_ROWS = [catalogRow('wild', 'thief-priest', 'Воровской Жрец', 'Thief Priest', 'priest', 31959, 58.3, 13.5, 1)];
const teaserOf = item => ({ ...teaser, format: item.format, formatLabel: item.format === 'wild' ? 'Вольный' : 'Стандарт', item });
const catalogOf = format => ({
  format, formatLabel: format === 'wild' ? 'Вольный' : 'Стандарт', patch: '36.0.3', minimumGames: 50, updatedAt: teaser.updatedAt,
  coverage: {}, items: format === 'wild' ? WILD_ROWS : STANDARD_ROWS,
});
const INDEXABLE_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const placeholder = readFileSync(new URL('../public/arena-logo-icon.webp', import.meta.url));

test('Next archetype details isolate access and load builds before independent optional sections', async () => {
  let member = false, optionalMode = 'hold', coreFails = false, coreDelayMs = 0;
  let releaseOptional;
  let optionalGate = new Promise(resolve => { releaseOptional = resolve; });
  const sectionCalls = [];
  const legacy = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const pathname = new URL(request.url, 'http://fixture').pathname;
    if (pathname === '/api/constructed-archetypes/public/wild/thief-priest') {
      response.end(JSON.stringify(teaser)); return;
    }
    const standardRow = STANDARD_ROWS.find(row => pathname === `/api/constructed-archetypes/public/standard/${row.slug}`);
    if (standardRow) { response.end(JSON.stringify(teaserOf(standardRow))); return; }
    if (pathname === '/api/constructed-archetypes/teaser') {
      response.end(JSON.stringify(catalogOf(new URL(request.url, 'http://fixture').searchParams.get('format') === 'wild' ? 'wild' : 'standard'))); return;
    }
    if (pathname.startsWith('/api/constructed-archetypes/public/')) {
      response.writeHead(404).end('{"error":"missing"}'); return;
    }
    if (pathname === '/api/constructed-archetypes/wild/thief-priest') {
      const section = new URL(request.url, 'http://fixture').searchParams.get('section');
      sectionCalls.push(section);
      if (!member) { response.writeHead(403).end('{"error":"denied"}'); return; }
      if (section === 'core') {
        if (coreFails) { response.writeHead(502).end('{"error":"Сборки временно недоступны"}'); return; }
        const body = JSON.stringify({ ...teaser, item: { ...teaser.item, builds: [{ deckCode: 'AAEBAa0GValidDeckCode', games: 2216, winrate: 57.1, sourceUrl: '', classKey: 'priest' }] }, history: [], analysis: null });
        if (coreDelayMs) { setTimeout(() => response.end(body), coreDelayMs); return; }
        response.end(body); return;
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
      if (/^\/api\/constructed-archetypes\/(?!(?:teaser|public)\/)/.test(new URL(request.url()).pathname)) protectedCalls.push(request.url());
    });
    // The strong Standard archetype is the only one offered to search engines; every page carries the summary.
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
      assert.match(document.summary?.heading ?? '', /^Насколько силён /, `${path} shows the summary`);
      assert.ok(document.summary.inMain && document.summary.height > 150 && document.summary.right <= width, `${path} summary sits in <main> inside the viewport`);
      assert.equal(document.html.includes('PRIVATE_'), false);
      // The open layer: the build with its card list and code is the same HTML for every viewer; the closed layer is a lock.
      const hasBuilds = !path.includes('weak-warlock');
      if (path.includes('/standard/archetypes/standard/zoolock/')) {
        const bytes = Buffer.byteLength(await response.text());
        assert.ok(bytes < 300_000, `${path} weighs ${bytes} bytes with twelve full builds (HTML and RSC payload; the budget of a data page is 300 KB)`);
      }
      assert.equal(document.html.includes(path.includes('zoolock') ? fullBuilds[0].deckCode : OPEN_CODE), hasBuilds, `${path} carries the open deck code`);
      assert.equal(document.html.includes('Гость из Бездны'), hasBuilds, `${path} lists the cards of the build`);
      assert.equal(document.html.includes('paywalled-archetype-analysis'), true, `${path} names the closed block`);
      assert.doesNotMatch(document.html, /mulliganImpact|keptImpact|7\.1717|6\.2626|61\.6161|4242424/, `${path} carries no closed value`);
    }
    // A robot and a guest get the same document (the open layer is not a robot-only or a guest-only view).
    const documentFor = userAgent => fetch(`${origin}/standard/archetypes/standard/zoolock/`, { headers: { 'User-Agent': userAgent } }).then(answer => answer.text());
    const guestHtml = await documentFor('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36');
    const robotHtml = await documentFor('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
    // Resource hints are emitted in the order the render finishes, which varies between two requests of the same viewer: they are not content.
    const withoutHints = html => html.replace(/<link rel="preload"[^>]*\/>/g, '');
    assert.equal(withoutHints(robotHtml), withoutHints(guestHtml), 'a robot and a guest get the same HTML');
    assert.ok(robotHtml.includes(fullBuilds[0].deckCode) && robotHtml.includes('paywalled-archetype-history'));
    // «Скопировать код» works for a guest: it writes the code of the build.
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${origin}/standard/archetypes/standard/zoolock/`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      window.__copied = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copied.push(text); } } });
    });
    await page.click('.open-deck__copy');
    await page.waitForFunction(() => document.querySelector('.open-deck__copy')?.textContent?.includes('Код скопирован'));
    assert.deepEqual(await page.evaluate(() => window.__copied), [fullBuilds[0].deckCode]);
    // Without JavaScript the strong page still reads: the question, the date, the source and the class links.
    const plain = await browser.newPage();
    await plain.setJavaScriptEnabled(false);
    await plain.goto(`${origin}/standard/archetypes/standard/zoolock/`, { waitUntil: 'domcontentloaded' });
    const bareBuilds = await plain.evaluate(() => ({
      code: document.querySelector('.open-deck__code code')?.textContent,
      cards: [...document.querySelectorAll('.open-deck__cards li')].map(row => row.textContent),
      costs: [...document.querySelectorAll('.open-deck__cards li')].slice(0, 2).map(row => row.dataset.cost),
      facts: document.querySelector('.open-deck__facts')?.textContent ?? '',
      copy: Boolean(document.querySelector('.open-deck__copy')),
    }));
    assert.equal(bareBuilds.code, fullBuilds[0].deckCode, 'without JavaScript the deck code is on the page');
    assert.deepEqual(bareBuilds.cards.slice(0, 2), ['Гость из Бездны ×2', 'Огненный шар']);
    assert.match(bareBuilds.facts, /57,1%/);
    assert.deepEqual(bareBuilds.costs, ['3', '4']);
    assert.equal(bareBuilds.copy, true);
    const bare = await plain.evaluate(() => {
      const summary = document.querySelector('.archetype-seo-summary');
      return { text: (summary?.innerText ?? '').replaceAll('\u00a0', ' '), time: summary?.querySelector('time')?.getAttribute('datetime'),
        links: [...(summary?.querySelectorAll('a[href^="/standard/archetypes/standard/"]') ?? [])].length };
    });
    await plain.close();
    const bareWords = bare.text.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
    assert.ok(bareWords >= 150 && bareWords <= 250, `the summary has ${bareWords} words without JavaScript`);
    assert.ok(bare.text.includes('HSGuru') && bare.text.includes('14 800') && bare.text.includes('от 50 игр'));
    assert.equal(bare.time, '2026-07-24T12:38:57.727Z');
    assert.ok(bare.links >= 3 && bare.links <= 6, `${bare.links} class links`);
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
    assert.ok(await page.evaluate(() => window.__detailCls < 0.01), 'core loading must not push visible optional placeholders away');
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
    const optionalCalls = sectionCalls.filter(section => section !== 'core').length;
    coreFails = false;
    await page.click('section[aria-label="Сборки архетипа"] button');
    await page.waitForSelector('.archetype-builds');
    assert.equal(sectionCalls.filter(section => section !== 'core').length, optionalCalls);
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
    // The open builds stay until the paid view can replace them in one render: nothing visible moves.
    coreDelayMs = 1_500;
    const swap = await browser.newPage();
    await swap.setViewport({ width: 1440, height: 900 });
    await swap.evaluateOnNewDocument(() => {
      window.__swapCls = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__swapCls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await swap.goto(`${origin}/standard/archetypes/wild/thief-priest/`, { waitUntil: 'domcontentloaded' });
    await swap.waitForSelector('.open-deck-list');
    assert.equal(await swap.$('.archetype-builds'), null, 'the paid gallery waits for its data');
    await swap.waitForSelector('.archetype-builds', { timeout: 10_000 });
    assert.equal(await swap.$('.open-deck-list'), null, 'the paid view replaces the open one');
    await delay(500);
    assert.ok(await swap.evaluate(() => window.__swapCls < 0.01), `open to paid view shifted the layout by ${await swap.evaluate(() => window.__swapCls)}`);
    await swap.close();
    coreDelayMs = 0;
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
