import assert from 'node:assert/strict';
import express from 'express';
import { createBattlegroundHeroSeoRouter } from '../server/battlegroundSeoRoutes.js';

const privateSentinels = [
  'QA_BG_PRIVATE_PICK_RATE_97_77',
  'QA_BG_PRIVATE_PLACEMENT_DISTRIBUTION',
  'QA_BG_PRIVATE_PAYWALL_PAYLOAD',
];

const catalog = {
  ok: true,
  source_id: 'hsreplay_battlegrounds_heroes',
  fetched_at: '2026-07-21T16:02:52.020Z',
  view: {
    type: 'bg_heroes',
    heroes: [
      {
        hero: 'А. Ф. Ка <script>alert("x")</script>',
        dbfId: 57944,
        id: 'TB_BaconShop_HERO_16',
        image: '/images/heroes/TB_BaconShop_HERO_16.png',
        tier: 'S',
        pick_rate: privateSentinels[0],
        placement_distribution: [privateSentinels[1]],
        best_composition: privateSentinels[2],
        statsAccess: privateSentinels[2],
        hero_power: {
          dbf: 57945,
          privateMetric: privateSentinels[0],
          card: {
            dbf: 57945,
            card_id: 'TB_BaconShop_HP_044',
            name: 'Прокрастинация & польза',
            text: 'Пропустите первые два хода. <b>Начните</b> с существа 3-го уровня.',
            image: 'https://cdn.example.test/cards/TB_BaconShop_HP_044.png',
            image_gold: privateSentinels[1],
            sounds: [privateSentinels[2]],
          },
        },
      },
      {
        hero: 'Миллифисент Манашторм',
        dbfId: 57946,
        id: 'TB_BaconShop_HERO_17',
        image: 'javascript:alert(1)',
        hero_power: {
          card: {
            name: 'Механическое могущество',
            text: 'Ваши механизмы получают +1/+1.',
            image: 'data:image/svg+xml,unsafe',
          },
        },
      },
    ],
  },
};

const duoCatalog = {
  type: 'bg_heroes',
  mode: 'duos',
  heroes: [
    {
      hero: 'Madam Goya',
      dbfId: 107183,
      id: 'BGDUO_HERO_104',
      tier: 'A',
      pick_rate: privateSentinels[0],
      placement_distribution: [privateSentinels[1]],
    },
  ],
};

const duoLibraryHero = {
  data: [
    {
      card_id: 'BGDUO_HERO_104',
      dbf: 107183,
      name: { ru: 'Мадам Гойя', en: 'Madam Goya' },
      images: { hero: 'https://cdn.example.test/heroes/madam-goya.png' },
      hero_power: {
        card: {
          name: 'Выгодный обмен',
          text: '<b>Передает</b> незолотое существо.',
          image: 'https://cdn.example.test/cards/madam-goya-power.png',
        },
      },
    },
  ],
};

const frontendAssets = [
  '<script type="module" crossorigin src="/assets/index-safe.js"></script>',
  '<link rel="stylesheet" crossorigin href="/assets/index-safe.css">',
].join('\n');

type FetchCall = { url: string; init?: RequestInit };
const calls: FetchCall[] = [];
const app = express();
app.use(createBattlegroundHeroSeoRouter({
  fetchImpl: async (url, init) => {
    calls.push({ url: String(url), init });
    const payload = String(url).includes('db.kolodahs.ru')
      ? duoLibraryHero
      : (String(url).includes('mode=duos') ? duoCatalog : catalog);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
  frontendAssets,
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;

function occurrences(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function assertNoPrivateData(html: string, label: string): void {
  assert.doesNotMatch(
    html,
    /\b(?:pick_rate|placement_distribution|best_composition|statsAccess|privateMetric|image_gold|sounds)\b/i,
    `${label} must not expose private or statistical field names`,
  );
  for (const sentinel of privateSentinels) {
    assert.equal(html.includes(sentinel), false, `${label} leaked ${sentinel}`);
  }
}

try {
  const existing = await fetch(`${origin}/heroes/57944/`);
  assert.equal(existing.status, 200);
  assert.match(existing.headers.get('content-type') || '', /^text\/html; charset=utf-8/i);
  assert.equal(
    existing.headers.get('x-robots-tag'),
    'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  );
  assert.match(existing.headers.get('cache-control') || '', /no-store/);
  const html = await existing.text();
  assert.equal(occurrences(html, /<title>/gi), 1, 'hero detail must have one title');
  assert.equal(occurrences(html, /<meta name="description"/gi), 1, 'hero detail must have one description');
  assert.equal(occurrences(html, /<link rel="canonical"/gi), 1, 'hero detail must have one canonical');
  assert.equal(occurrences(html, /<h1(?:\s[^>]*)?>/gi), 1, 'hero detail must have one H1');
  assert.match(
    html,
    /<title>А\. Ф\. Ка alert\(&quot;x&quot;\) — герой Полей сражений Hearthstone \| Manacost Stats<\/title>/,
  );
  assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/arena\.hs-manacost\.ru\/heroes\/57944\/">/);
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /<meta property="og:url" content="https:\/\/arena\.hs-manacost\.ru\/heroes\/57944\/">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/arena\.hs-manacost\.ru\/images\/heroes\/TB_BaconShop_HERO_16\.png">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<h1>А\. Ф\. Ка alert\(&quot;x&quot;\)<\/h1>/);
  assert.doesNotMatch(html, /<script>alert/i, 'upstream markup must not become executable HTML');
  assert.match(html, /<img[^>]+src="https:\/\/arena\.hs-manacost\.ru\/images\/heroes\/TB_BaconShop_HERO_16\.png"/);
  assert.match(html, /<dt>DBF ID<\/dt><dd><code>57944<\/code><\/dd>/);
  assert.match(html, /<dt>ID карты<\/dt><dd><code>TB_BaconShop_HERO_16<\/code><\/dd>/);
  assert.match(html, /<h2>Сила героя<\/h2>/);
  assert.match(html, /Прокрастинация &amp; польза/);
  assert.match(html, /Пропустите первые два хода\. Начните с существа 3-го уровня\./,
    'hero-power text must remain useful while upstream HTML is stripped');
  assert.match(html, /src="\/assets\/index-safe\.js"/,
    'valid SSR must retain the Vite client entry');
  assert.match(html, /href="\/assets\/index-safe\.css"/);
  assert.match(html, /<div id="root" data-route-status="200">/);
  assert.match(html, /data-server-entity-jsonld data-entity-path="\/heroes\/57944"/);
  const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, 'existing hero must expose entity JSON-LD');
  const jsonLd = JSON.parse(jsonLdMatch[1]);
  assert.deepEqual(jsonLd['@graph'].map((node: any) => node['@type']), ['CreativeWork', 'BreadcrumbList']);
  assert.equal(jsonLd['@graph'][0].identifier, 57944);
  assert.equal(jsonLd['@graph'][0].alternateName, 'TB_BaconShop_HERO_16');
  assert.equal(jsonLd['@graph'][0].about.name, 'Прокрастинация & польза');
  assertNoPrivateData(html, 'existing hero');
  assert.equal(calls[0]?.url, 'http://127.0.0.1:3108/api/bg/heroes');
  const upstreamHeaders = new Headers(calls[0]?.init?.headers);
  assert.equal(upstreamHeaders.get('cookie'), null);
  assert.equal(upstreamHeaders.get('authorization'), null);
  assert.equal(upstreamHeaders.get('user-agent'), 'ManacostArena/BattlegroundHeroSEO');

  for (const headers of [
    { Cookie: 'session=private-user' },
    { Authorization: 'Bearer private-token' },
    { 'User-Agent': 'Googlebot/2.1' },
  ]) {
    const identityRequest = await fetch(`${origin}/heroes/57944/`, { headers });
    assert.equal(await identityRequest.text(), html,
      'SSR representation must not vary by identity or crawler headers');
    assert.doesNotMatch(identityRequest.headers.get('vary') || '', /cookie|authorization|user-agent/i);
  }

  const head = await fetch(`${origin}/heroes/57944/`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('x-robots-tag'), existing.headers.get('x-robots-tag'));

  const unsafeImage = await fetch(`${origin}/heroes/57946/`);
  assert.equal(unsafeImage.status, 200);
  const unsafeImageHtml = await unsafeImage.text();
  assert.doesNotMatch(unsafeImageHtml, /javascript:|data:image/i);
  assert.match(unsafeImageHtml, /https:\/\/arena\.hs-manacost\.ru\/assets\/og-preview\.png/,
    'unsafe hero and hero-power image schemes must use the public fallback');
  assertNoPrivateData(unsafeImageHtml, 'unsafe-image hero');

  const duoHero = await fetch(`${origin}/heroes/107183/`);
  assert.equal(duoHero.status, 200);
  const duoHeroHtml = await duoHero.text();
  assert.match(duoHeroHtml, /<h1>Мадам Гойя<\/h1>/);
  assert.match(duoHeroHtml, /Выгодный обмен/);
  assert.match(duoHeroHtml, /Передает незолотое существо\./);
  assert.match(duoHeroHtml, /https:\/\/cdn\.example\.test\/heroes\/madam-goya\.png/);
  assertNoPrivateData(duoHeroHtml, 'duo hero');

  const missing = await fetch(`${origin}/heroes/999999/`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('x-robots-tag'), 'noindex, nofollow');
  const missingHtml = await missing.text();
  assert.match(missingHtml, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(missingHtml, /<div id="root" data-route-status="404">/);
  assert.match(missingHtml, /<h1>Герой не найден<\/h1>/);
  assert.doesNotMatch(missingHtml, /<link rel="canonical"/i);
  assert.doesNotMatch(missingHtml, /<script type="module"/i,
    'authoritative 404 must not be reclassified by client hydration');
  assertNoPrivateData(missingHtml, 'missing hero');

  const callsBeforeInvalid = calls.length;
  for (const invalidPath of [
    '/heroes/0/',
    '/heroes/01/',
    '/heroes/not-a-number/',
    '/heroes/57944-extra/',
  ]) {
    const invalid = await fetch(`${origin}${invalidPath}`);
    assert.equal(invalid.status, 404, `${invalidPath} must be a real 404`);
    assert.equal(invalid.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(await invalid.text(), /<meta name="robots" content="noindex, nofollow">/);
  }
  assert.equal(calls.length, callsBeforeInvalid, 'invalid dbfId values must not query the catalog');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

async function assertUnavailable(
  label: string,
  fetchImpl: typeof fetch,
  expectedRetryAfter = '300',
): Promise<void> {
  const unavailableApp = express();
  unavailableApp.use(createBattlegroundHeroSeoRouter({
    fetchImpl,
    frontendAssets,
    catalogTimeoutMs: label === 'timeout' ? 10 : 1_000,
    retryAfterSeconds: Number(expectedRetryAfter),
    onError: () => {
      throw new Error('QA diagnostics callback failure');
    },
  }));
  const unavailableServer = unavailableApp.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    unavailableServer.once('listening', resolve);
    unavailableServer.once('error', reject);
  });
  const unavailableAddress = unavailableServer.address();
  assert.ok(unavailableAddress && typeof unavailableAddress === 'object');
  try {
    const unavailable = await fetch(`http://127.0.0.1:${unavailableAddress.port}/heroes/57944/`);
    assert.equal(unavailable.status, 503, `${label} must be retryable instead of a false 404`);
    assert.equal(unavailable.headers.get('retry-after'), expectedRetryAfter);
    assert.equal(unavailable.headers.get('x-robots-tag'), 'noindex, nofollow');
    const html = await unavailable.text();
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(html, /<div id="root" data-route-status="503">/);
    assert.match(html, /<h1>Каталог героев временно недоступен<\/h1>/);
    assert.doesNotMatch(html, /<script type="module"/i,
      '503 responses must stay authoritative without client hydration');
    assertNoPrivateData(html, `${label} response`);

    const head = await fetch(`http://127.0.0.1:${unavailableAddress.port}/heroes/57944/`, { method: 'HEAD' });
    assert.equal(head.status, 503);
    assert.equal(head.headers.get('retry-after'), expectedRetryAfter);
    assert.equal(await head.text(), '');
  } finally {
    await new Promise<void>((resolve, reject) => unavailableServer.close(error => (error ? reject(error) : resolve())));
  }
}

await assertUnavailable('HTTP failure', async () => new Response('upstream private error', { status: 500 }));
await assertUnavailable('invalid payload', async () => new Response(JSON.stringify({ view: { heroes: 'broken' } }), { status: 200 }));
await assertUnavailable('empty catalog', async () => new Response(JSON.stringify({ view: { heroes: [] } }), { status: 200 }));
await assertUnavailable('timeout', () => new Promise<Response>(() => {}), '15');

console.log('battleground hero SEO route tests passed');
