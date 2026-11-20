import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import express from 'express';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startNextServer } from '../scripts/lib/next-server.mjs';
import { createBattlegroundHeroRankingRouter } from '../server/battlegroundHeroRankingRoutes.ts';
import { createTierlistRouter } from '../server/tierlistRoutes.ts';
import { createWinrateRouter } from '../server/winrateRoutes.ts';
import { buildHeroCatalog, closedValues as closedHeroValues } from './helpers/battlegroundHeroesFixture.ts';
import { buildClassesFixture, closedValues as closedClassValues } from './helpers/classesTeaserFixture.ts';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';
import { buildTierlistFixture, closedValues as closedTierlistValues } from './helpers/tierlistPublicFixture.ts';

// The mode hubs /standard/, /arena/, /battlegrounds/ and /wild/ as a visitor and a
// crawler get them: one H1 for the mode, the canonical address, indexable, no
// prose for robots in <main> (owner rule, #538: a one-line lead, then data rows
// and links), a link to every
// indexable page of the mode that answers 200, no horizontal scroll on a phone
// or a desktop; and, with data, the «Сейчас в режиме» block from the open
// layers with its date, without a value that is closed on the source pages.

const INDEXABLE = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ROBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const HUBS = [
  {
    path: '/standard/', heading: 'Стандарт Hearthstone: колоды, мета и архетипы',
    links: ['/standard/meta/', '/standard/archetypes/', '/standard/matchups/', '/standard/fun-decks/', '/standard/cards/',
      '/standard/cards/standard/', '/standard/patches/', '/arena/', '/battlegrounds/', '/wild/'],
  },
  {
    path: '/arena/', heading: 'Арена Hearthstone: тир-лист карт и классы',
    links: ['/tierlist/', '/classes/', '/legendaries/', '/standard/', '/battlegrounds/', '/wild/'],
  },
  {
    path: '/battlegrounds/', heading: 'Поля сражений Hearthstone: герои, сборки и карты',
    links: ['/heroes/', '/battlegrounds/tier-list/', '/battlegrounds/strategies/', '/library/', '/library/minions/', '/library/spells/',
      '/library/anomalies/', '/library/dark-gifts/', '/library/quests/', '/library/rewards/', '/library/darkmoon-prizes/',
      '/library/trinkets/', '/library/timewarped/', '/standard/patches/', '/standard/', '/arena/', '/wild/'],
  },
  {
    path: '/wild/', heading: 'Вольный формат Hearthstone: колоды и карты',
    links: ['/standard/meta/wild/', '/standard/archetypes/wild/', '/standard/matchups/', '/standard/fun-decks/', '/standard/cards/wild/',
      '/standard/patches/', '/standard/', '/arena/', '/battlegrounds/'],
  },
];

const decoded = text => text.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>').replaceAll('&nbsp;', ' ').replaceAll('&amp;', '&');

/** The words a reader gets in <main> without JavaScript: tags, scripts and styles left out. */
function mainText(html) {
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  return decoded(main.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
const wordCount = text => text.split(' ').filter(word => /[\p{L}\p{N}]/u.test(word)).length;
/** The links of <main> outside the open data block (whose rows depend on the data of the moment). */
function mainLinks(html) {
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const now = main.indexOf('class="mode-hub__now"');
  const withoutData = now === -1 ? main : main.slice(0, now) + main.slice(main.indexOf('</section>', now));
  return [...withoutData.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map(match => match[1]);
}

test('every hub is an indexable page with its own text and links to every page of the mode', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true });
  let browser;
  try {
    for (const hub of HUBS) {
      const response = await fetch(`${runtime.origin}${hub.path}`, { redirect: 'manual' });
      assert.equal(response.status, 200, hub.path);
      const html = await response.text();
      assert.deepEqual([...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(match => decoded(match[1])), [hub.heading], `${hub.path} H1`);
      assert.deepEqual([...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map(match => match[1]),
        [`https://hearthpulse.net${hub.path}`], `${hub.path} canonical`);
      assert.deepEqual([...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map(match => match[1]), [INDEXABLE], `${hub.path} robots`);
      // No wall of text: every paragraph of <main> is a short line (the lead, a data note), not an SEO essay.
      const main = html.match(/<main\b[\s\S]*?<\/main>/)?.[0] ?? '';
      const paragraphs = [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(match => wordCount(decoded(match[1].replace(/<[^>]+>/g, ' '))));
      assert.ok(paragraphs.length > 0 && paragraphs.every(words => words <= 20), `${hub.path} paragraphs: ${paragraphs}`);
      assert.deepEqual(mainLinks(html), hub.links, `${hub.path} links every page of the mode, then the other hubs`);
      for (const link of hub.links) {
        const target = await fetch(`${runtime.origin}${link}`, { redirect: 'manual' });
        await target.arrayBuffer();
        assert.equal(target.status, 200, `${hub.path} → ${link}`);
      }
    }

    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [390, 1440]) {
      await page.setViewport({ width, height: 900 });
      for (const hub of HUBS) {
        await page.goto(`${runtime.origin}${hub.path}`, { waitUntil: 'networkidle2' });
        const state = await page.evaluate(() => ({
          heading: document.querySelector('h1')?.textContent,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }));
        assert.deepEqual(state, { heading: hub.heading, overflow: false }, `${hub.path} at ${width}px`);
      }
    }
    assert.deepEqual(errors, [], 'the hubs run without page errors');
  } finally {
    await browser?.close();
    await runtime.close();
  }
});

// ── The open data block, against an Express that serves the real open projections ──

const META_UPDATED_AT = '2026-11-19T23:00:02.401Z';
const metaRow = (slug, label, winrate, popularity, games) => ({
  id: slug, slug, archetype: label, archetypeLabel: label, translated: true, classKey: 'warlock', winrate, popularity, games,
  turns: null, durationMinutes: null, climbingSpeed: null, deckCode: `SENTINEL_META_DECK_${slug}`,
});
const META = {
  format: 'standard', formatLabel: 'Стандарт', rank: 'diamond_legend', rankLabel: 'Алмаз — Легенда', period: 'patch_36.6.3',
  availablePeriods: ['past_day', 'past_week', 'patch_36.6.3'], currentPeriod: 'patch_36.6.3', currentPatchPeriod: 'patch_36.6.3',
  coin: 'any_player', minGames: 100, source: 'hsguru', sourceUrl: 'https://www.hsguru.com/meta', translationSource: '',
  updatedAt: META_UPDATED_AT, privateBreakdown: 'SENTINEL_META_BREAKDOWN',
  items: [metaRow('nzoth-warlock', 'Н\'зот Чернокнижник', 57.4, 3.3, 258), metaRow('zoolock', 'Зоолок', 61, 20.4, 14800),
    metaRow('cthun-shaman', 'Шаман К\'туна', 58.2, 12.1, 5400)],
};
const wildRow = (slug, label, winrate, popularity, games) => ({
  slug, format: 'wild', classKey: 'warlock', archetype: label, archetypeLabel: label, translated: true, games, winrate, popularity,
  turns: 6.5, durationMinutes: 7, climbingSpeed: 1, deckCount: 200, sourceUrl: `https://www.hsguru.com/archetype/${slug}`,
  builds: [{ deckCode: `SENTINEL_WILD_BUILD_${slug}` }],
});
const WILD = {
  format: 'wild', formatLabel: 'Вольный', patch: '37.0.2', period: null, minimumGames: 10, updatedAt: '2026-11-19T23:00:02.401Z',
  coverage: { secret: 'SENTINEL_WILD_COVERAGE' },
  items: [wildRow('pirate-warrior', 'Пират Воин', 61.7, 6.5, 116383), wildRow('boarlock', 'Чернокнижник на Элвинских вепрях', 57.6, 9.5, 170577)],
};
const CLOSED = [...new Set([...closedClassValues(), ...closedTierlistValues(), ...closedHeroValues(),
  'SENTINEL_META_DECK', 'SENTINEL_META_BREAKDOWN', 'SENTINEL_WILD_BUILD', 'SENTINEL_WILD_COVERAGE'])];
// A closed value leaks only as a whole token: short figures also occur inside chunk hashes and ids.
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CLOSED_TOKENS = CLOSED.map(value => [value, new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(value)}`, 'u')]);
// Next's build id and asset names are random and may spell a short closed value (#503): they are not page content.
const scrubbed = text => text.replaceAll(readFileSync(new URL('../apps/public-web/.next/BUILD_ID', import.meta.url), 'utf8').trim(), '')
  .replace(/\/_next\/static\/[^"'\s\\)]+/g, '');
const closedIn = page => {
  const text = scrubbed(page);
  return CLOSED_TOKENS.filter(([value, token]) => text.includes(value) && token.test(text)).map(([value]) => value);
};

function startLegacy(state) {
  const app = express();
  app.use((request, _response, next) => { state.reads.push(request.originalUrl); next(); });
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  const down = response => response.status(503).json({ error: 'no data' });
  app.get('/api/standard-meta/public', (_request, response) => (state.down ? down(response) : response.json(META)));
  app.get('/api/constructed-archetypes/teaser', (request, response) => (state.down || request.query.format !== 'wild'
    ? down(response) : response.json(WILD)));
  app.use('/api', createWinrateRouter({
    accessGuard: (_request, response) => { response.status(401).json({ error: 'authentication required' }); },
    cache: new Map(), redisKey: source => `winrates:${source}`, redisGet: async () => null, redisSet: async () => undefined,
    fetchSource: async () => { if (state.down) throw new Error('origin down'); return buildClassesFixture(); },
    loadSnapshot: () => null, memoryTtlMs: 0, redisTtlSeconds: 60, onError: () => undefined,
  }));
  app.use('/api', createTierlistRouter({
    accessGuard: (_request, response) => { response.status(403).json({ error: 'subscription required' }); },
    cache: new Map(), resolveSource: () => 'hsreplay',
    getData: async () => { if (state.down) throw new Error('origin down'); return { data: buildTierlistFixture(), etag: '"fixture"', cacheSource: 'origin' }; },
    present: data => ({ ...data, classPositions: {} }), loadFallback: () => null, onError: () => undefined,
  }));
  app.use('/api', createBattlegroundHeroRankingRouter({
    loadCatalog: async mode => { if (state.down) throw new Error('service down'); return buildHeroCatalog('TOP_50_PERCENT', mode); },
    onError: () => undefined,
  }));
  return app;
}

/** The text of the «Сейчас в режиме» section, or null when the page has none. */
function nowBlock(html) {
  const marker = html.indexOf('class="mode-hub__now"');
  if (marker === -1) return null;
  const start = html.indexOf('>', marker) + 1;
  // React separates adjacent text nodes with an empty comment; it is not a break in what a reader sees.
  return decoded(html.slice(start, html.indexOf('</section>', start)).replaceAll('<!-- -->', '').replace(/<[^>]+>/g, '|'))
    .replaceAll(' ', ' ').split('|').map(part => part.trim()).filter(Boolean);
}

test('with data each hub shows its open layer with the date and nothing closed; without data the block is gone', async () => {
  assert.equal(existsSync('apps/public-web/.next/BUILD_ID'), true, 'run build:next before this test');
  const state = { reads: [], down: false };
  const legacyServer = startLegacy(state).listen(0, '127.0.0.1');
  await once(legacyServer, 'listening');
  const next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacyServer.address().port}`,
    env: { NODE_OPTIONS: `--require=${resolve('tests/helpers/shiftableClock.cjs')}` } });
  const get = async (path, userAgent = BROWSER_UA) => {
    const response = await fetch(`${next.origin}${path}`, { headers: { 'User-Agent': userAgent } });
    assert.equal(response.status, 200, path);
    return response.text();
  };
  // The hubs are five-minute ISR pages built without Express: move the server's clock until the regenerated copy is served.
  const regenerated = async (path, ready) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      process.kill(next.pid, 'SIGUSR2');
      const html = await get(path);
      if (ready(nowBlock(html))) return html;
      await delay(250);
    }
    return assert.fail(`${path} was not regenerated; reads ${JSON.stringify(state.reads.slice(-10))}; ${next.output().slice(-300)}`);
  };
  try {
    const expected = {
      '/standard/': ['Сейчас в Стандарте', 'Данные на', '20 ноября 2026, 02:00 МСК', '· источник HSGuru',
        'Самые популярные архетипы: Алмаз — Легенда',
        'Зоолок', '— винрейт 61,0%, популярность 20,4%, 14 800 игр',
        'Шаман К\'туна', '— винрейт 58,2%, популярность 12,1%, 5 400 игр',
        'Н\'зот Чернокнижник — винрейт 57,4%, популярность 3,3%, 258 игр'],
      '/wild/': ['Сейчас в Вольном формате', 'Данные на', '20 ноября 2026, 02:00 МСК', '· источник HSGuru',
        'Самые популярные архетипы Вольного',
        'Чернокнижник на Элвинских вепрях — винрейт 57,6%, популярность 9,5%, 170 577 игр',
        'Пират Воин — винрейт 61,7%, популярность 6,5%, 116 383 игр'],
    };
    const html = {};
    // A row of the fixture marks the copy made from this Express (a build next to a live API may carry other data).
    const fixtureRow = { '/standard/': 'Зоолок', '/arena/': 'Класс death-knight — 57,3%, 120 011 забегов', '/battlegrounds/': 'Герой 0',
      '/wild/': 'Пират Воин — винрейт 61,7%, популярность 6,5%, 116 383 игр' };
    for (const [path, row] of Object.entries(fixtureRow)) html[path] = await regenerated(path, block => block?.includes(row) ?? false);
    for (const [path, rows] of Object.entries(expected)) assert.deepEqual(nowBlock(html[path]), rows, `${path} open block`);
    // A strong archetype links to its page; one below the sample threshold does not (its page is not indexed).
    assert.match(html['/standard/'], /<a href="\/standard\/archetypes\/standard\/zoolock\/">Зоолок<\/a>/);
    assert.doesNotMatch(html['/standard/'], /href="\/standard\/archetypes\/standard\/nzoth-warlock\/"/);
    // The menu links the Wild list (#543); the hub links no Wild archetype page.
    assert.doesNotMatch(html['/wild/'], /href="\/standard\/archetypes\/wild\/[a-z0-9]/, 'the hub links no Wild archetype page');

    const arena = nowBlock(html['/arena/']);
    assert.deepEqual(arena.slice(0, 6), ['Сейчас на Арене', 'Данные на', '15 ноября 2026, 20:00 МСК', '· источник HSReplay',
      'Классы по проценту побед', 'Класс death-knight — 57,3%, 120 011 забегов']);
    assert.equal(arena.filter(row => row.startsWith('Класс ')).length, 11, 'all eleven classes in order');
    assert.ok(arena.includes('Карты с самым высоким винрейтом'), 'the best cards of the open tier list');
    const heroes = nowBlock(html['/battlegrounds/']);
    assert.deepEqual([heroes[0], heroes[1], heroes[2]], ['Сейчас на Полях сражений', 'Данные на', '18 ноября 2026, 20:01 МСК']);
    assert.ok(heroes.includes('Лучшие герои: одиночная игра, рейтинг «Топ 50%»'));
    assert.match(html['/battlegrounds/'], /<a href="\/heroes\/1000\/">Герой 0<\/a> — тир A, среднее место 3,21, топ-4 49,4%<\/li>/);

    for (const [path, page] of Object.entries(html)) {
      const payload = [...page.matchAll(/<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)].map(match => match[1]).join('\n');
      assert.ok(payload.length > 0, `${path} carries an RSC payload, so the check below is not vacuous`);
      assert.deepEqual(closedIn(page), [], `${path} HTML and RSC payload hold no closed value`);
    }
    assert.ok(state.reads.every(read => !read.startsWith('/api/winrates?') && !read.startsWith('/api/tierlist?')),
      'only the open projections are read');

    // A robot and a guest get the same document, once regenerations started above have landed.
    for (const path of ['/standard/', '/arena/', '/battlegrounds/', '/wild/']) {
      let settled = await get(path);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await delay(250);
        const again = await get(path);
        if (again === settled) break;
        settled = again;
      }
      assert.equal(await get(path, ROBOT_UA), await get(path, BROWSER_UA), `${path} does not depend on the user agent`);
    }

    // No data: still a 200 hub with its lead and links, without the block and without a date.
    state.down = true;
    for (const path of ['/standard/', '/wild/']) {
      const empty = await regenerated(path, block => block === null);
      assert.doesNotMatch(mainText(empty), /Данные на/, `${path} prints no date without data`);
      assert.ok(mainLinks(empty).length >= 4, `${path} keeps its links`);
    }
  } finally {
    await next.close();
    legacyServer.closeAllConnections();
    legacyServer.close();
  }
});
