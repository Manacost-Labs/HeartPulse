import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { createPublicWebGateway } from '../scripts/public-web-gateway.mjs';
import { closeLocal, listenLocal } from './helpers/publicCardFixture.mjs';
import { isMenuBackgroundRead, MENU_PATCH_ARCHIVE } from './helpers/menuBackgroundReads.mjs';

// The deck hub /standard/decks/ and the class pages /standard/decks/<class>/ (#309) on the production Next build
// with a fake Express: server HTML without JavaScript, open deck codes, no paid value of the archetype answer.
const PAID_SENTINELS = ['7.1717', '6.2626', '41.4141', 'mulliganImpact', 'keptImpact', 'PRIVATE_'];
const row = (slug, label, classKey, games, winrate, popularity, deckCount = 3) => ({
  slug, archetype: slug, archetypeLabel: label, translated: true, classKey, format: 'standard', games, winrate, popularity,
  turns: 8, durationMinutes: 8, climbingSpeed: 1, deckCount, sourceUrl: 'https://www.hsguru.com/meta', builds: [{ deckCode: 'PRIVATE_DECK' }],
});
// Paladin: four strong archetypes (an indexable class) and a weak one below the 1000-game threshold. Warlock: one strong
// archetype (below the content threshold). Hunter: a strong archetype whose detail fails. Other classes: none.
const ROWS = [
  row('pure-paladin', 'Чистый Паладин', 'paladin', 52000, 55.4, 9.1),
  row('aggro-paladin', 'Агро Паладин', 'paladin', 30000, 57.9, 6.2),
  row('handbuff-paladin', 'Хэндбафф Паладин', 'paladin', 4000, 51.2, 1.4),
  row('dude-paladin', 'Паладин на новобранцах', 'paladin', 1200, 49.8, 0.5),
  row('weak-paladin', 'Слабый Паладин', 'paladin', 600, 70, 0.1),
  row('zoolock', 'Зоолок', 'warlock', 14800, 53.1, 5),
  row('face-hunter', 'Фейс Охотник', 'hunter', 9000, 50.5, 3),
];
const deckOf = slug => `AAECAZ8FAAAA${slug.replace(/[^a-z]/g, '').slice(0, 12)}AAA=`;
const detailOf = item => ({
  format: 'standard', formatLabel: 'Стандарт', patch: '37.0.2', minimumGames: 10, updatedAt: '2026-07-24T12:38:57.727Z',
  account: 'PRIVATE_ACCOUNT',
  item: { ...item, builds: [{ deckCode: deckOf(item.slug), games: 700, winrate: 60.1, updatedAt: '2026-07-24T00:00:00.000Z',
    sampleRank: 'all', samplePeriod: 'patch_37.0.2', mulliganImpact: 7.1717, keptImpact: 6.2626,
    cards: [{ id: 'TST_001', name: 'Тестовый удар', cost: 1, count: 2, hasPage: true }, { id: 'TIME_875t', name: 'Король Ллейн', cost: 3, count: 1, hasPage: false }] }] },
  buildsTotal: 1, buildsOffset: 0, nextOffset: null,
  featuredBuild: { games: 700, winrate: 60.1, updatedAt: null, sampleRank: 'all', samplePeriod: 'patch_37.0.2', deckCode: 'PRIVATE_FEATURED_DECK' },
  history: [{ recordedAt: 'PRIVATE_HISTORY', winrate: 41.4141 }],
  analysis: { private: 'PRIVATE_ANALYSIS', cardStats: [{ cardId: 'TST_001', mulliganImpact: 7.1717, keptImpact: 6.2626 }] },
});
const catalog = { format: 'standard', formatLabel: 'Стандарт', patch: '37.0.2', minimumGames: 10,
  updatedAt: '2026-07-24T12:38:57.727Z', coverage: {}, items: ROWS };
const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');

/** Production Next behind the public gateway with a fake Express; `api(pathname, request, response)` answers `/api/` reads. */
async function startStand(api) {
  const legacy = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    const pathname = new URL(request.url, 'http://fixture').pathname;
    if (api(pathname, request, response)) return;
    if (pathname === '/api/auth/me') { response.end('{"user":null,"adminAllowed":false,"contestAdminAllowed":false}'); return; }
    if (isMenuBackgroundRead(pathname)) { response.end(JSON.stringify(MENU_PATCH_ARCHIVE)); return; }
    if (pathname.startsWith('/api/')) { response.writeHead(401).end('{"error":"guest"}'); return; }
    response.writeHead(204).end();
  });
  const legacyOrigin = await listenLocal(legacy);
  const reservation = http.createServer(); const nextOrigin = await listenLocal(reservation); await closeLocal(reservation);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'apps/public-web',
    '--hostname', '127.0.0.1', '--port', new URL(nextOrigin).port], {
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', RUNTIME_CLIENT_CONFIG_FILE: '', LEGACY_WEB_ORIGIN: legacyOrigin },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let gateway;
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  const close = async () => {
    if (gateway) await closeLocal(gateway);
    child.kill('SIGTERM');
    legacy.closeAllConnections();
    await closeLocal(legacy);
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200 && !ready; attempt++) {
      if (child.exitCode !== null) throw new Error(`Next exited: ${output}`);
      ready = await fetch(`${nextOrigin}/health/next/`).then(response => response.ok, () => false);
      if (!ready) await delay(50);
    }
    assert.ok(ready, `Next did not start: ${output}`);
    gateway = createPublicWebGateway({ legacyOrigin, nextOrigin, enabled: true, pagesEnabled: true });
    return { origin: await listenLocal(gateway), close };
  } catch (error) {
    await close();
    throw error;
  }
}

test('deck hub and class pages: server HTML with open codes, 404 for an unknown class, 503 without the catalog', async () => {
  let catalogState = 'missing';
  const detailReads = [];
  const stand = await startStand((pathname, _request, response) => {
    if (pathname === '/api/constructed-archetypes/teaser') {
      if (catalogState === 'missing') response.writeHead(404).end('{"error":"no catalog"}');
      else if (catalogState === 'down') response.writeHead(502).end('{"error":"down"}');
      else response.end(JSON.stringify(catalog));
      return true;
    }
    const detail = pathname.match(/^\/api\/constructed-archetypes\/teaser\/standard\/([a-z-]+)$/);
    if (!detail) return false;
    detailReads.push(detail[1]);
    const item = ROWS.find(candidate => candidate.slug === detail[1]);
    if (!item || item.slug === 'face-hunter') response.writeHead(item ? 502 : 404).end('{"error":"detail"}');
    else response.end(JSON.stringify(detailOf(item)));
    return true;
  });
  const { origin } = stand;
  let browser;
  try {
    // Without any copy of the catalog the pages are a 503, not a page without its data: whether the source
    // refuses the read (404 of a rollout) or fails it (502).
    for (const state of ['missing', 'down']) {
      catalogState = state;
      await delay(1100);
      for (const path of ['/standard/decks/', '/standard/decks/paladin/']) {
        const unavailable = await fetch(`${origin}${path}`);
        assert.equal(unavailable.status, 503, `${path} with the catalog ${state}`);
        assert.equal(unavailable.headers.get('retry-after'), '60', path);
      }
    }
    catalogState = 'up';
    await delay(1100);

    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const plain = await browser.newPage();
    await plain.setJavaScriptEnabled(false);
    const read = async (path, width) => {
      await plain.setViewport({ width, height: 900 });
      const response = await plain.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
      return { status: response.status(), ...await plain.evaluate(() => ({
        title: document.title,
        robots: [...document.querySelectorAll('meta[name=robots]')].map(node => node.content),
        canonical: document.querySelector('link[rel=canonical]')?.href ?? null,
        graphs: document.querySelectorAll('script[type="application/ld+json"]').length,
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent),
        data: document.querySelector('h1 + p')?.textContent.replaceAll(' ', ' '),
        links: [...document.querySelectorAll('main a')].map(node => `${node.textContent.replaceAll(' ', ' ')} → ${node.getAttribute('href')}`),
        codes: [...document.querySelectorAll('main code')].map(node => node.textContent),
        overflow: document.documentElement.scrollWidth > innerWidth,
        text: document.querySelector('main')?.textContent.replaceAll('\u00a0', ' '),
      })) };
    };

    for (const width of [390, 1440]) {
      const hub = await read('/standard/decks/', width);
      assert.equal(hub.status, 200);
      assert.deepEqual(hub.h1, ['Лучшие колоды Hearthstone']);
      assert.match(hub.title, /^Лучшие колоды Hearthstone \(хс\), \d{4} \| HearthPulse$/);
      assert.deepEqual(hub.robots, ['noindex, follow']);
      assert.equal(hub.canonical, null);
      assert.equal(hub.graphs, 0, 'no JSON-LD while the page is noindex');
      assert.equal(hub.data, 'Данные на 24 июля 2026, 15:38 МСК · 3 архетипа, 53 800 игр · источник HSGuru');
      assert.equal(hub.overflow, false, `hub at ${width}px`);
      // The best archetype of each class by winrate above the threshold: Агро Паладин, not the weak 70%.
      for (const link of ['Агро Паладин → /standard/archetypes/standard/aggro-paladin/', 'Все колоды Паладина → /standard/decks/paladin/',
        'Зоолок → /standard/archetypes/standard/zoolock/', 'Фейс Охотник → /standard/archetypes/standard/face-hunter/',
        'Все колоды Рыцаря смерти → /standard/decks/deathknight/', 'Все колоды Охотника на демонов → /standard/decks/demonhunter/',
        'Мета Стандарта: тир-лист архетипов → /standard/meta/']) {
        assert.ok(hub.links.includes(link), `hub links ${link}`);
      }
      assert.equal(hub.links.filter(link => link.startsWith('Все колоды ')).length, 11);
      assert.deepEqual(hub.codes, ['AAECAZ8FAAAAaggropaladinAAA=', 'AAECAZ8FAAAAzoolockAAA=']);

      const paladin = await read('/standard/decks/paladin/', width);
      assert.equal(paladin.status, 200);
      assert.deepEqual(paladin.h1, ['Колоды Паладина']);
      assert.match(paladin.title, /^Колоды Паладина Hearthstone \(хс\): топ/);
      assert.deepEqual(paladin.robots, ['noindex, follow']);
      assert.equal(paladin.canonical, null);
      assert.equal(paladin.data, 'Данные на 24 июля 2026, 15:38 МСК · 4 архетипа, 87 200 игр · источник HSGuru');
      assert.equal(paladin.overflow, false, `class page at ${width}px`);
      assert.deepEqual(paladin.links.filter(link => link.includes('/standard/archetypes/')), [
        'Агро Паладин → /standard/archetypes/standard/aggro-paladin/', 'Чистый Паладин → /standard/archetypes/standard/pure-paladin/',
        'Хэндбафф Паладин → /standard/archetypes/standard/handbuff-paladin/', 'Паладин на новобранцах → /standard/archetypes/standard/dude-paladin/',
      ]);
      assert.ok(paladin.links.includes('Тестовый удар → /standard/cards/standard/TST_001/'), 'the build lists its cards');
      assert.deepEqual(paladin.codes, ['AAECAZ8FAAAAaggropaladinAAA=', 'AAECAZ8FAAAApurepaladinAAA=', 'AAECAZ8FAAAAhandbuffpalaAAA=', 'AAECAZ8FAAAAdudepaladinAAA=']);
    }
    // The class pages ask Express only for the archetypes above the threshold, never for the weak one.
    assert.equal(detailReads.includes('weak-paladin'), false);

    const warlock = await read('/standard/decks/warlock/', 390);
    assert.ok(warlock.text.includes('Мало данных: 1 из 4 нужных архетипов от 1 000 игр, страница не индексируется.'));
    const hunter = await read('/standard/decks/hunter/', 390);
    assert.ok(hunter.text.includes('Фейс Охотник: код сборки пока недоступен.'), 'a failed detail keeps the row without a code');
    const empty = await read('/standard/decks/mage/', 390);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.h1, ['Колоды Мага']);

    const unknown = await read('/standard/decks/necromancer/', 390);
    assert.equal(unknown.status, 404);
    assert.ok(unknown.robots.includes('noindex, nofollow'), 'an unknown class is noindex, nofollow');

    // The documents and their RSC payloads carry the open codes, never a paid value of the archetype answer.
    for (const path of ['/standard/decks/', '/standard/decks/paladin/']) {
      for (const init of [{}, { headers: { RSC: '1' } }]) {
        const body = await (await fetch(`${origin}${path}`, init)).text();
        assert.ok(body.includes('AAECAZ8FAAAAaggropaladinAAA='), `${path} ${JSON.stringify(init)} carries the open code`);
        for (const paid of PAID_SENTINELS) assert.equal(body.includes(paid), false, `${path} ${JSON.stringify(init)} carries ${paid}`);
      }
    }

    // With JavaScript: the page is accessible and a guest copies a code.
    const page = await browser.newPage();
    await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
    for (const path of ['/standard/decks/', '/standard/decks/paladin/']) {
      await page.goto(`${origin}${path}`, { waitUntil: 'networkidle2' });
      await page.evaluate(axe);
      const violations = await page.evaluate(async () => (await axe.run(document.querySelector('main'),
        { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(violation => violation.id));
      assert.deepEqual(violations, [], path);
    }
    await page.goto(`${origin}/standard/decks/`, { waitUntil: 'networkidle2' });
    await page.click('button[aria-label="Скопировать код колоды: Агро Паладин"]');
    await page.waitForSelector('button[aria-label="Код скопирован: Агро Паладин"]');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'AAECAZ8FAAAAaggropaladinAAA=');
  } finally {
    await browser?.close();
    await stand.close();
  }
});

// Details that hang must neither hold the page nor pile up requests (GPT review of #639): one shared deadline for
// the details of a page, one request per archetype whoever asks, at most four at once; the codes come back after.
test('hanging archetype details: the page answers by its deadline without codes and without piling up requests', async () => {
  const DRUIDS = Array.from({ length: 9 }, (_, index) => row(`druid-${'abcdefghi'[index]}`, `Друид ${index + 1}`, 'druid', 5000 + index, 50 + index, 2));
  const rows = [...DRUIDS, ...ROWS];
  let hold = true;
  let active = 0, maxActive = 0;
  const held = [];
  const requested = [];
  const stand = await startStand((pathname, request, response) => {
    if (pathname === '/api/constructed-archetypes/teaser') { response.end(JSON.stringify({ ...catalog, items: rows })); return true; }
    const detail = pathname.match(/^\/api\/constructed-archetypes\/teaser\/standard\/([a-z-]+)$/);
    if (!detail) return false;
    requested.push(detail[1]);
    active += 1; maxActive = Math.max(maxActive, active);
    response.on('close', () => { active -= 1; });
    const answer = () => response.end(JSON.stringify(detailOf(rows.find(item => item.slug === detail[1]))));
    if (hold) held.push(answer); else answer();
    return true;
  });
  try {
    const visit = async path => {
      const started = Date.now();
      const response = await fetch(`${stand.origin}${path}`);
      return { path, status: response.status, ms: Date.now() - started, html: await response.text() };
    };
    const visits = await Promise.all(['/standard/decks/druid/', '/standard/decks/druid/', '/standard/decks/', '/standard/decks/paladin/',
      '/standard/decks/druid/'].map(visit));
    for (const { path, status, ms, html } of visits) {
      assert.equal(status, 200, path);
      assert.ok(ms < 4000, `${path} answered in ${ms} ms`);
      assert.equal(html.includes('AAECAZ8FAAAA'), false, `${path} has no code while the details hang`);
    }
    assert.ok(maxActive <= 4, `at most four detail requests at once, saw ${maxActive}`);
    assert.equal(new Set(requested).size, requested.length, `one request per archetype: ${requested.join(', ')}`);
    // The source answers again: the codes come back.
    hold = false;
    for (const answer of held.splice(0)) answer();
    let recovered = '';
    for (let attempt = 0; attempt < 40 && !recovered.includes('AAECAZ8FAAAAdruidiAAA='); attempt++) {
      await delay(250);
      recovered = (await visit('/standard/decks/druid/')).html;
    }
    assert.ok(recovered.includes('AAECAZ8FAAAAdruidiAAA='), 'the best build is back once its detail answers');
  } finally {
    for (const answer of held.splice(0)) answer();
    await stand.close();
  }
});
