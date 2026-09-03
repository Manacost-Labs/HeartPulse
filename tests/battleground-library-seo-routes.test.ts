import assert from 'node:assert/strict';
import express from 'express';
import { createBattlegroundLibrarySeoRouter } from '../server/battlegroundLibrarySeoRoutes.js';

const INDEX_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
const privateSentinels = [
  'QA_BG_PRIVATE_WINRATE_99_99',
  'QA_BG_PRIVATE_POPULARITY_88_88',
  'QA_BG_PRIVATE_PAYWALL_PAYLOAD',
];

const minion = {
  id: 15,
  card_id: 'BG26_146',
  dbf: 98582,
  card_type: { slug: 'minion', name_ru: 'Существо' },
  name: { ru: 'Баюбот <script>alert("x")</script>', en: 'Lullabot & Friends' },
  tavern_tier: 1,
  creature_type: { slug: 'mech', name_ru: 'Механизм' },
  attack: 2,
  health: 2,
  in_pool: true,
  mechanics: [
    { slug: 'MAGNETIC', name_ru: 'Магнетизм' },
    { slug: 'MAGNETIC', name_ru: 'Магнетизм' },
    { slug: 'END_OF_TURN_TRIGGER', name_ru: 'В конце хода' },
  ],
  text: {
    ru: 'Магнетизм. <b>В конце хода</b> получает +1 к здоровью.',
    en: 'Magnetic. At the end of your turn, gain +1 Health.',
  },
  text_ru: 'SHOULD_NOT_OVERRIDE_STRUCTURED_TEXT',
  images: {
    card: '/images/bg/BG26_146.png',
    golden: 'https://cdn.example.test/BG26_146_G.png',
    art: 'javascript:alert(1)',
    framed: 'data:image/svg+xml,unsafe',
  },
  artist: 'Крис Ран <img src=x onerror=alert(1)>',
  impact: privateSentinels[0],
  winrate: privateSentinels[0],
  popularity: privateSentinels[1],
  games: 123456,
  avg_placement: privateSentinels[2],
  statsAccess: privateSentinels[2],
  raw_stats: { marker: privateSentinels[0] },
};

const archivedMinion = {
  ...minion,
  id: 16,
  card_id: 'BG26_147',
  dbf: 98583,
  name: { ru: 'Старый механизм', en: 'Old Mech' },
  in_pool: false,
};

const spell = {
  id: 2955,
  card_id: 'BG28_897',
  dbf: 105752,
  card_type: { slug: 'spell', name_ru: 'Заклинание' },
  name: { ru: 'Банан в меню', en: 'Tavern Dish Banana' },
  tavern_tier: 1,
  creature_type: null,
  attack: null,
  health: null,
  in_pool: true,
  mechanics: [],
  text_ru: 'Существо получает +2/+2.\nМеханики: HIDDEN_RAW_TAG\nEN: Give a minion +2/+2.',
  images: {
    card: 'https://db.kolodahs.ru/uploads/cards/BG28_897.png',
    golden: null,
    art: 'https://db.kolodahs.ru/uploads/art/BG28_897.jpg',
    framed: null,
  },
  artist: null,
  combat_winrate: privateSentinels[0],
  total_played: privateSentinels[1],
};

const archivedSpell = {
  ...spell,
  id: 3009,
  card_id: 'BGDUO_124',
  dbf: 107943,
  name: { ru: 'План по вербовке', en: 'Recruitment Program' },
  in_pool: false,
};

const catalogs = new Map<string, unknown>([
  ['minion:1', { data: [minion] }],
  ['minion:0', { data: [archivedMinion] }],
  ['spell:1', { data: [spell] }],
  ['spell:0', { data: [archivedSpell] }],
]);

const frontendAssets = [
  '<script type="module" crossorigin src="/assets/index-safe.js"></script>',
  '<link rel="stylesheet" crossorigin href="/assets/index-safe.css">',
  '<script src="https://evil.example.test/leak.js"></script>',
].join('\n');

type FetchCall = { url: string; init?: RequestInit };
const calls: FetchCall[] = [];
const catalogFetch: typeof fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  const parsed = new URL(String(url));
  const key = `${parsed.searchParams.get('card_type')}:${parsed.searchParams.get('in_pool')}`;
  const payload = catalogs.get(key);
  return new Response(JSON.stringify(payload ?? { data: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

function occurrences(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function assertNoPrivateData(html: string, label: string): void {
  assert.doesNotMatch(
    html,
    /\b(?:impact|winrate|popularity|games|avg_placement|combat_winrate|total_played|statsAccess|raw_stats)\b/i,
    `${label} must not expose private or statistical field names`,
  );
  for (const sentinel of privateSentinels) {
    assert.equal(html.includes(sentinel), false, `${label} leaked ${sentinel}`);
  }
}

async function startApp(fetchImpl: typeof fetch, options: {
  timeout?: number;
  retryAfter?: number;
  cacheTtl?: number;
  now?: () => number;
} = {}) {
  const app = express();
  app.use(createBattlegroundLibrarySeoRouter({
    fetchImpl,
    frontendAssets,
    catalogTimeoutMs: options.timeout,
    retryAfterSeconds: options.retryAfter,
    catalogCacheTtlMs: options.cacheTtl,
    now: options.now,
    onError: () => {
      throw new Error('QA diagnostics callback failure');
    },
  }));
  app.use((_request, response) => response.status(299).send('DOWNSTREAM_SHELL'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

const app = await startApp(catalogFetch);
try {
  const path = '/library/minions/баюбот-alert-x-98582/';
  const existing = await fetch(`${app.origin}${path}`);
  assert.equal(existing.status, 200);
  assert.equal(existing.headers.get('x-robots-tag'), INDEX_ROBOTS);
  assert.match(existing.headers.get('cache-control') || '', /no-store/);
  const html = await existing.text();
  assert.equal(occurrences(html, /<title>/gi), 1);
  assert.equal(occurrences(html, /<meta name="description"/gi), 1);
  assert.equal(occurrences(html, /<link rel="canonical"/gi), 1);
  assert.equal(occurrences(html, /<h1(?:\s[^>]*)?>/gi), 1);
  assert.match(html, /<html lang="ru">/);
  assert.match(html, /<title>Баюбот alert\(&quot;x&quot;\) — существо Полей сражений Hearthstone \| HearthPulse<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/hearthpulse\.net\/library\/minions\/%D0%B1%D0%B0%D1%8E%D0%B1%D0%BE%D1%82-alert-x-98582\/">/);
  assert.match(html, /<meta property="og:type" content="website">/);
  assert.match(html, /<meta property="og:site_name" content="HearthPulse">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/hearthpulse\.net\/library\/minions\/%D0%B1%D0%B0%D1%8E%D0%B1%D0%BE%D1%82-alert-x-98582\/">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<h1>Баюбот alert\(&quot;x&quot;\)<\/h1>/);
  assert.doesNotMatch(html, /<script>alert/i);
  assert.match(html, /Lullabot &amp; Friends/);
  assert.match(html, /<dt>Тип<\/dt><dd>Существо<\/dd>/);
  assert.match(html, /<dt>Уровень таверны<\/dt><dd>1<\/dd>/);
  assert.match(html, /<dt>Тип существа<\/dt><dd>Механизм<\/dd>/);
  assert.match(html, /<dt>Атака<\/dt><dd>2<\/dd>/);
  assert.match(html, /<dt>Здоровье<\/dt><dd>2<\/dd>/);
  assert.match(html, /<dt>Статус<\/dt><dd>В активном пуле<\/dd>/);
  assert.match(html, /href="\/battlegrounds\/tier-list\/">Тир-лист БГ<\/a>/);
  assert.match(html, /href="\/heroes\/">Герои БГ<\/a>/);
  assert.match(html, /Магнетизм/);
  assert.equal(occurrences(html, />Магнетизм</g), 1, 'duplicate mechanics must collapse');
  assert.match(html, /Магнетизм\. В конце хода получает \+1 к здоровью\./);
  assert.match(html, /Magnetic\. At the end of your turn, gain \+1 Health\./);
  assert.match(html, /Крис Ран &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /src="https:\/\/hearthpulse\.net\/images\/bg\/BG26_146\.png"/);
  assert.doesNotMatch(html, /https:\/\/cdn\.example\.test/);
  assert.doesNotMatch(html, /javascript:|data:image/i);
  assert.match(html, /src="\/assets\/index-safe\.js"/);
  assert.match(html, /href="\/assets\/index-safe\.css"/);
  assert.doesNotMatch(html, /evil\.example\.test/);
  assert.match(html, /data-server-entity-jsonld data-entity-path="\/library\/minions\/баюбот-alert-x-98582"/);
  const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch);
  const jsonLd = JSON.parse(jsonLdMatch[1]);
  assert.deepEqual(jsonLd['@graph'].map((node: any) => node['@type']), ['WebPage', 'CreativeWork', 'BreadcrumbList']);
  assert.equal(jsonLd['@graph'][0].mainEntity['@id'], 'https://hearthpulse.net/library/minions/%D0%B1%D0%B0%D1%8E%D0%B1%D0%BE%D1%82-alert-x-98582/#card');
  assert.equal(jsonLd['@graph'][1].identifier, 98582);
  assert.equal(jsonLd['@graph'][1].alternateName, 'Lullabot & Friends');
  assertNoPrivateData(html, 'existing minion');

  const requestedUrls = calls.slice(0, 2).map(call => call.url).sort();
  assert.deepEqual(requestedUrls, [
    'http://127.0.0.1:3108/api/bg/library/cards?card_type=minion&in_pool=0',
    'http://127.0.0.1:3108/api/bg/library/cards?card_type=minion&in_pool=1',
  ]);
  for (const call of calls.slice(0, 2)) {
    const headers = new Headers(call.init?.headers);
    assert.equal(headers.get('cookie'), null);
    assert.equal(headers.get('authorization'), null);
    assert.equal(headers.get('user-agent'), 'ManacostArena/BattlegroundLibrarySEO');
  }

  for (const headers of [
    { Cookie: 'session=private-user' },
    { Authorization: 'Bearer private-token' },
    { 'User-Agent': 'Googlebot/2.1' },
  ]) {
    const identityRequest = await fetch(`${app.origin}${path}`, { headers });
    assert.equal(await identityRequest.text(), html, 'SSR representation must not vary by identity or crawler headers');
    assert.doesNotMatch(identityRequest.headers.get('vary') || '', /cookie|authorization|user-agent/i);
  }

  const head = await fetch(`${app.origin}${path}`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('x-robots-tag'), INDEX_ROBOTS);
  assert.equal(await head.text(), '');

  const wrongSlug = await fetch(`${app.origin}/library/minions/wrong-name-98582/?utm_source=qa&value=1`, {
    redirect: 'manual',
  });
  assert.equal(wrongSlug.status, 301);
  assert.equal(
    wrongSlug.headers.get('location'),
    'https://hearthpulse.net/library/minions/%D0%B1%D0%B0%D1%8E%D0%B1%D0%BE%D1%82-alert-x-98582/?utm_source=qa&value=1',
  );
  assert.equal(wrongSlug.headers.get('x-robots-tag'), 'noindex, nofollow');

  const existingSpell = await fetch(`${app.origin}/library/spells/банан-в-меню-105752/`);
  assert.equal(existingSpell.status, 200);
  const spellHtml = await existingSpell.text();
  assert.match(spellHtml, /<h1>Банан в меню<\/h1>/);
  assert.match(spellHtml, /Существо получает \+2\/\+2\./);
  assert.match(spellHtml, /Give a minion \+2\/\+2\./);
  assert.doesNotMatch(spellHtml, /HIDDEN_RAW_TAG|Механики:/);
  assert.doesNotMatch(spellHtml, /<dt>Атака|<dt>Здоровье|<dt>Тип существа/);
  assert.match(spellHtml, /https:\/\/hearthpulse\.net\/api\/public-resource\/db\/uploads\/cards\/BG28_897\.png/);
  assert.match(spellHtml, /https:\/\/hearthpulse\.net\/api\/public-resource\/db\/uploads\/art\/BG28_897\.jpg/);
  assert.doesNotMatch(spellHtml, /https:\/\/db\.kolodahs\.ru/);
  assertNoPrivateData(spellHtml, 'existing spell');

  const missing = await fetch(`${app.origin}/library/minions/missing-999999/`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('x-robots-tag'), 'noindex, nofollow');
  const missingHtml = await missing.text();
  assert.match(missingHtml, /<div id="root" data-route-status="404">/);
  assert.match(missingHtml, /<h1>Карта не найдена<\/h1>/);
  assert.doesNotMatch(missingHtml, /<link rel="canonical"|<script type="module"/i);
  assertNoPrivateData(missingHtml, 'missing card');

  const callsBeforeInvalid = calls.length;
  for (const invalidPath of [
    '/library/minions/no-dbf/',
    '/library/minions/card-0/',
    '/library/minions/card-01/',
    '/library/spells/-105752/',
  ]) {
    const invalid = await fetch(`${app.origin}${invalidPath}`);
    assert.equal(invalid.status, 404, `${invalidPath} must be a real 404`);
    assert.equal(invalid.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.doesNotMatch(await invalid.text(), /<script type="module"/i);
  }
  assert.equal(calls.length, callsBeforeInvalid, 'invalid detail paths must not query catalogs');

  for (const untouchedPath of [
    '/library/minions/',
    '/library/spells/',
    '/library/anomalies/example-123/',
    '/library/archive/minions/example-123/',
  ]) {
    const untouched = await fetch(`${app.origin}${untouchedPath}`);
    assert.equal(untouched.status, 299, `${untouchedPath} must stay owned by the downstream shell`);
    assert.equal(await untouched.text(), 'DOWNSTREAM_SHELL');
  }
} finally {
  await app.close();
}

let cacheNow = 1_000;
let cacheFetches = 0;
let cacheRefreshFails = false;
const cacheApp = await startApp(async url => {
  cacheFetches += 1;
  await new Promise(resolve => setTimeout(resolve, 15));
  const parsed = new URL(String(url));
  const inPool = parsed.searchParams.get('in_pool') === '1';
  if (cacheRefreshFails && !inPool) return new Response('refresh failed', { status: 500 });
  return new Response(JSON.stringify({ data: [inPool ? minion : archivedMinion] }), { status: 200 });
}, { cacheTtl: 100, now: () => cacheNow });
try {
  const cachePath = `${cacheApp.origin}/library/minions/баюбот-alert-x-98582/`;
  const concurrent = await Promise.all([
    fetch(cachePath),
    fetch(cachePath, { headers: { Cookie: 'identity-must-not-split-cache' } }),
    fetch(cachePath, { method: 'HEAD' }),
  ]);
  assert.deepEqual(concurrent.map(response => response.status), [200, 200, 200]);
  assert.equal(cacheFetches, 2, 'concurrent detail requests must share one active/archive fetch pair');

  assert.equal((await fetch(cachePath)).status, 200);
  assert.equal(cacheFetches, 2, 'a request within the TTL must use the validated projected catalog');

  cacheNow += 101;
  assert.equal((await fetch(cachePath)).status, 200);
  assert.equal(cacheFetches, 4, 'the first request after expiry must refresh both catalogs');

  cacheRefreshFails = true;
  cacheNow += 101;
  assert.equal((await fetch(cachePath)).status, 503,
    'an expired cache must fail closed when either relevant catalog cannot refresh');
  assert.equal(cacheFetches, 6);

  cacheRefreshFails = false;
  assert.equal((await fetch(cachePath)).status, 200,
    'a failed refresh must not be cached and must retry the complete pair');
  assert.equal(cacheFetches, 8);
} finally {
  await cacheApp.close();
}

async function assertUnavailable(
  label: string,
  fetchImpl: typeof fetch,
  expectedRetryAfter = '300',
): Promise<void> {
  const unavailableApp = await startApp(fetchImpl, {
    timeout: label === 'timeout' ? 10 : 1_000,
    retryAfter: Number(expectedRetryAfter),
  });
  try {
    const unavailable = await fetch(`${unavailableApp.origin}/library/minions/баюбот-alert-x-98582/`);
    assert.equal(unavailable.status, 503, `${label} must be retryable instead of false content or 404`);
    assert.equal(unavailable.headers.get('retry-after'), expectedRetryAfter);
    assert.equal(unavailable.headers.get('x-robots-tag'), 'noindex, nofollow');
    const html = await unavailable.text();
    assert.match(html, /<div id="root" data-route-status="503">/);
    assert.match(html, /<h1>Каталог карт временно недоступен<\/h1>/);
    assert.doesNotMatch(html, /<link rel="canonical"|<script type="module"/i);
    assertNoPrivateData(html, `${label} response`);

    const head = await fetch(`${unavailableApp.origin}/library/minions/баюбот-alert-x-98582/`, { method: 'HEAD' });
    assert.equal(head.status, 503);
    assert.equal(head.headers.get('retry-after'), expectedRetryAfter);
    assert.equal(await head.text(), '');
  } finally {
    await unavailableApp.close();
  }
}

await assertUnavailable('HTTP failure', async url => {
  const parsed = new URL(String(url));
  if (parsed.searchParams.get('in_pool') === '0') return new Response('private upstream error', { status: 500 });
  return new Response(JSON.stringify({ data: [minion] }), { status: 200 });
});
await assertUnavailable('invalid payload', async () => new Response(JSON.stringify({ data: 'broken' }), { status: 200 }));
await assertUnavailable('empty catalog', async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
await assertUnavailable('timeout', () => new Promise<Response>(() => {}), '15');

console.log('battleground library SEO route tests passed');
