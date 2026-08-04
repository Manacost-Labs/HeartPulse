import assert from 'node:assert/strict';
import express from 'express';
import {
  createConstructedCardSeoRouter,
  extractConstructedCardFrontendAssets,
} from '../server/constructedCardSeoRoutes.js';

const privateSentinels = [
  'QA_PRIVATE_STATS_97_77',
  'QA_PRIVATE_DECK_CODE_AAECA_TEST_ONLY',
  'QA_PRIVATE_SUBSCRIPTION_PAYLOAD',
];

const cards = [
  {
    card_id: 'CARD_1',
    name: { ru: 'Огненный <script>alert("x")</script> дракон', en: 'Fire Dragon' },
    text: { ru: 'Наносит <b>5</b> урона & оглушает противника.' },
    flavor: { ru: 'Даже драконам нужен безопасный HTML.' },
    card_set: 'ESCAPEFROM_VIOLET_HOLD',
    card_type: { slug: 'MINION', name_ru: 'Существо' },
    class: 'MAGE',
    rarity: 'LEGENDARY',
    mana_cost: 7,
    attack: 8,
    health: 9,
    artist: 'Тестовый художник',
    images: { card: 'https://db.kolodahs.ru/uploads/cards/CARD_1.png' },
    related_cards_localized: [{
      heading: { ru: 'Награды за задание', en: 'Quest rewards' },
      cards: [
        {
          card_id: 'CARD_1t1',
          name: { ru: 'Первая награда <img src=x>', en: 'First Reward' },
          text: { ru: '<b>Боевой клич:</b> получите награду.' },
          mana_cost: 1,
          attack: 2,
          health: 3,
          artist: 'Художник токена',
          images: {
            card: 'https://db.kolodahs.ru/uploads/cards/CARD_1t1.png',
            art: 'https://db.kolodahs.ru/uploads/wiki-full/CARD_1-shared.jpg',
            art_metadata: {
              file_page_url: 'https://hearthstone.wiki.gg/wiki/File:CARD_1_shared_full.jpg',
              width: 760,
              height: 1016,
              sha1: 'shared-art-sha1',
            },
            crop: 'https://db.kolodahs.ru/uploads/game-crop/QA_CROP_MUST_NOT_RENDER.jpg',
          },
          relationship: { wiki_url: 'https://hearthstone.wiki.gg/wiki/CARD_1t1' },
        },
        {
          card_id: 'CARD_1t2',
          name: { ru: 'Вторая награда', en: 'Second Reward' },
          text: { ru: 'Продолжение задания.' },
          mana_cost: 2,
          images: {
            card: 'https://db.kolodahs.ru/uploads/cards/CARD_1t2.png',
            art: 'https://db.kolodahs.ru/uploads/wiki-full/CARD_1-shared-duplicate.jpg',
            art_metadata: {
              file_page_url: 'https://hearthstone.wiki.gg/wiki/File:CARD_1_shared_full.jpg',
              width: 760,
              height: 1016,
              sha1: 'shared-art-sha1',
            },
          },
        },
        {
          card_id: 'CARD_1t3',
          name: { ru: 'Финальная награда', en: 'Final Reward' },
          text: { ru: 'Завершает задание.' },
          mana_cost: 5,
          attack: 8,
          health: 8,
          images: {
            card: 'https://db.kolodahs.ru/uploads/cards/CARD_1t3.png',
            art: 'https://db.kolodahs.ru/uploads/wiki-full/CARD_1-final.jpg',
            art_metadata: {
              file_page_url: 'https://hearthstone.wiki.gg/wiki/File:CARD_1_final_full.jpg',
              width: 1200,
              height: 900,
              sha1: 'final-art-sha1',
            },
          },
        },
      ],
    }],
    stats: { deckWinrate: privateSentinels[0] },
    decks: [{ deckCode: privateSentinels[1] }],
    deckCode: privateSentinels[1],
    subscriptionPayload: privateSentinels[2],
  },
  {
    card_id: 'CARD_2',
    name: { ru: 'Ледяная стрела', en: 'Frostbolt' },
    text: { ru: 'Замораживает выбранную цель.' },
    card_set: 'CORE',
    card_type: { slug: 'SPELL', name_ru: 'Заклинание' },
    class: 'MAGE',
    rarity: 'COMMON',
    mana_cost: 2,
    images: { card: 'javascript:alert(1)' },
  },
];
const catalogCards = cards.map(card => {
  const compact = structuredClone(card) as any;
  delete compact.related_cards_localized;
  return compact;
});

const frontendAssets = extractConstructedCardFrontendAssets(`
  <script src="/runtime-config.js?v=cdn-20260804" onload="QA_UNSAFE_ATTRIBUTE"></script>
  <script src="/runtime-config.js?redirect=https://evil.example.test"></script>
  <script type="module" crossorigin src="/assets/index-safe.js" onload="QA_UNSAFE_ATTRIBUTE"></script>
  <script type="module" crossorigin src="/assets/index-versioned.js?v=75ba82834a61d77ec511eab42fef935a792f8491"></script>
  <script type="module" crossorigin src="/assets/index-unsafe.js?redirect=https://evil.example.test"></script>
  <script src="https://evil.example.test/steal.js"></script>
  <link rel="modulepreload" crossorigin href="/assets/vendor-safe.js" onload="QA_UNSAFE_ATTRIBUTE">
  <link rel="stylesheet" crossorigin href="/assets/index-safe.css">
`);
assert.match(frontendAssets, /<script src="\/runtime-config\.js\?v=cdn-20260804"><\/script>/,
  'server-rendered entity pages must load runtime delivery config before the client bundle');
assert.match(frontendAssets, /src="\/assets\/index-safe\.js"/);
assert.match(
  frontendAssets,
  /src="\/assets\/index-versioned\.js\?v=75ba82834a61d77ec511eab42fef935a792f8491"/,
  'release-versioned frontend entry must be preserved so the React app can boot',
);
assert.match(frontendAssets, /href="\/assets\/vendor-safe\.js"/);
assert.match(frontendAssets, /href="\/assets\/index-safe\.css"/);
assert.ok(
  frontendAssets.indexOf('/runtime-config.js?v=cdn-20260804') < frontendAssets.indexOf('/assets/index-safe.js'),
  'runtime delivery config must preserve its position before the Vite entry',
);
assert.doesNotMatch(frontendAssets, /evil\.example|redirect=|QA_UNSAFE_ATTRIBUTE/,
  'only reconstructed local build asset tags may enter the document');

const calls: string[] = [];
const detailCalls: string[] = [];
const app = express();
app.use(createConstructedCardSeoRouter({
  loadCards: async format => {
    calls.push(format);
    return {
      cards: format === 'standard' ? catalogCards : [catalogCards[1]],
      updatedAt: null,
      sourceUrl: '',
      cacheSource: 'fresh',
      dataStatus: 'fresh',
      partial: false,
      datasetVersion: `ccc1-sha256:${'1'.repeat(64)}`,
      catalogVerifiedAt: '2026-07-21T00:00:00.000Z',
      catalogPublishedAt: '2026-07-21T00:00:00.000Z',
    };
  },
  loadCardDetail: async (format, cardId) => {
    detailCalls.push(`${format}:${cardId}`);
    const card = (format === 'standard' ? cards : [cards[1]])
      .find(item => item.card_id === cardId);
    return card ? {
      card,
      cacheSource: 'fresh',
      dataStatus: 'fresh',
      partial: false,
      warning: null,
      datasetVersion: `ccc1-sha256:${'1'.repeat(64)}`,
    } : null;
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
  assert.doesNotMatch(html, /\b(?:statsAccess|deckCode|subscriptionPayload)\b/i,
    `${label} must not contain private field names`);
  for (const sentinel of privateSentinels) {
    assert.equal(html.includes(sentinel), false, `${label} leaked ${sentinel}`);
  }
}

try {
  const existing = await fetch(`${origin}/standard/cards/standard/CARD_1/`);
  assert.equal(existing.status, 200);
  assert.match(existing.headers.get('content-type') || '', /^text\/html; charset=utf-8/i);
  assert.equal(
    existing.headers.get('x-robots-tag'),
    'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  );
  const html = await existing.text();
  assert.equal(occurrences(html, /<title>/gi), 1, 'detail must have one title');
  assert.equal(occurrences(html, /<meta name="description"/gi), 1, 'detail must have one description');
  assert.equal(occurrences(html, /<link rel="canonical"/gi), 1, 'detail must have one canonical');
  assert.equal(occurrences(html, /<h1(?:\s[^>]*)?>/gi), 1, 'detail must have one H1');
  assert.match(html, /<title>Огненный &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; дракон — карта Hearthstone \(Стандарт, CARD_1\) \| Manacost Stats<\/title>/);
  assert.match(html, /<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/arena\.hs-manacost\.ru\/standard\/cards\/standard\/CARD_1\/">/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /<meta property="og:description"/);
  assert.match(html, /<meta property="og:url" content="https:\/\/arena\.hs-manacost\.ru\/standard\/cards\/standard\/CARD_1\/">/);
  assert.match(html, /<meta property="og:image" content="https:\/\/arena\.hs-manacost\.ru\/api\/public-resource\/db\/uploads\/cards\/CARD_1\.png">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta name="twitter:title"/);
  assert.match(html, /<meta name="twitter:description"/);
  assert.match(html, /<meta name="twitter:image"/);
  assert.match(html, /<h1>Огненный &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; дракон<\/h1>/);
  assert.match(html, /<img[^>]+src="https:\/\/arena\.hs-manacost\.ru\/api\/public-resource\/db\/uploads\/cards\/CARD_1\.png"[^>]+alt="Карта Hearthstone «Огненный &lt;script&gt;/);
  assert.doesNotMatch(html, /https:\/\/db\.kolodahs\.ru/);
  assert.match(html, /<dt>Мана<\/dt><dd>7<\/dd>/);
  assert.match(html, /<dt>Атака<\/dt><dd>8<\/dd>/);
  assert.match(html, /<dt>Здоровье<\/dt><dd>9<\/dd>/);
  assert.match(html, /<dt>ID карты<\/dt><dd><code>CARD_1<\/code><\/dd>/);
  assert.match(html, /Наносит 5 урона &amp; оглушает противника\./,
    'rules text must be useful but stripped of upstream markup');
  assert.match(html, /Токены, награды и связанные карты · 3/,
    'server-rendered detail must expose all localized related cards');
  assert.match(html, /<h3>Награды за задание<\/h3>/);
  assert.match(html, /<p lang="en">Quest rewards<\/p>/);
  assert.equal(occurrences(html, /<article class="card-seo__related-card">/g), 3);
  assert.match(html, /Первая награда &lt;img src=x&gt;/,
    'related card names must remain escaped');
  assert.match(html, /Боевой клич: получите награду\./,
    'related rules text must be stripped of upstream markup');
  assert.match(html, /<dt>Мана<\/dt><dd>1<\/dd>/);
  assert.match(html, /<code>CARD_1t1<\/code>/);
  assert.match(html, /href="https:\/\/hearthstone\.wiki\.gg\/wiki\/CARD_1t1"/);
  assert.match(html, /Полноразмерные арты · 2/,
    'shared Wiki art must be deduplicated by exact SHA-1');
  assert.equal(occurrences(html, /<figure class="card-seo__art">/g), 2);
  assert.match(html, /wiki-full\/CARD_1-shared\.jpg/);
  assert.match(html, /wiki-full\/CARD_1-final\.jpg/);
  assert.match(html, /Карты: CARD_1t1, CARD_1t2/);
  assert.match(html, /Оригинал: 760×1016/);
  assert.match(html, /object-fit:contain/,
    'full Wiki art must be shown uncropped');
  assert.doesNotMatch(html, /CARD_1-shared-duplicate\.jpg/,
    'a shared full art duplicate must not create a second gallery item');
  assert.doesNotMatch(html, /QA_CROP_MUST_NOT_RENDER/,
    'game crop images must never enter the full-art gallery');
  assert.match(html, /src="\/assets\/index-safe\.js"/,
    'the client app entry must remain available after SSR');
  assert.match(html, /<div id="root" data-route-status="200">/,
    'valid entity HTML must tell the client to preserve its first metadata pass');
  const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, 'existing detail must expose public entity JSON-LD');
  assert.match(html, /data-server-entity-jsonld data-entity-path="\/standard\/cards\/standard\/CARD_1"/,
    'entity JSON-LD must be scoped so SPA navigation can remove stale data');
  const jsonLd = JSON.parse(jsonLdMatch[1]);
  assert.deepEqual(jsonLd['@graph'].map((node: any) => node['@type']), ['CreativeWork', 'BreadcrumbList']);
  assert.equal(jsonLd['@graph'][0].identifier, 'CARD_1');
  assert.equal(jsonLd['@graph'][0].additionalProperty.find((item: any) => item.name === 'Формат')?.value, 'Стандарт');
  assertNoPrivateData(html, 'existing detail');
  assert.deepEqual(calls, ['standard'], 'existence must be resolved by loadCards for the requested format');
  assert.deepEqual(detailCalls, ['standard:CARD_1'],
    'public HTML must load the enriched detail that contains related cards');

  for (const headers of [
    { Cookie: 'session=private-user' },
    { Authorization: 'Bearer private-token' },
    { 'User-Agent': 'Googlebot/2.1' },
  ]) {
    const anonymousContract = await fetch(`${origin}/standard/cards/standard/CARD_1/`, { headers });
    assert.equal(await anonymousContract.text(), html,
      'SSR HTML must not vary by identity headers or crawler user-agent');
    assert.doesNotMatch(anonymousContract.headers.get('vary') || '', /cookie|authorization|user-agent/i);
  }
  const head = await fetch(`${origin}/standard/cards/standard/CARD_1/`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('x-robots-tag'), existing.headers.get('x-robots-tag'));

  const unsafeImage = await fetch(`${origin}/standard/cards/wild/CARD_2/`);
  assert.equal(unsafeImage.status, 200);
  const unsafeImageHtml = await unsafeImage.text();
  assert.doesNotMatch(unsafeImageHtml, /javascript:/i);
  assert.match(unsafeImageHtml, /https:\/\/arena\.hs-manacost\.ru\/assets\/og-preview\.png/,
    'unsafe image schemes must use the public fallback');

  const missing = await fetch(`${origin}/standard/cards/standard/UNKNOWN_1/`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('x-robots-tag'), 'noindex, nofollow');
  const missingHtml = await missing.text();
  assert.match(missingHtml, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(missingHtml, /<div id="root" data-route-status="404">/);
  assert.match(missingHtml, /<h1>Карта не найдена<\/h1>/);
  assert.doesNotMatch(missingHtml, /<link rel="canonical"/i);
  assert.doesNotMatch(missingHtml, /<script type="module"/i,
    'authoritative missing entities must not be reclassified by client hydration');
  assertNoPrivateData(missingHtml, 'missing detail');

  for (const missingMembershipPath of [
    '/standard/cards/standard/card_1/',
    '/standard/cards/wild/CARD_1/',
  ]) {
    const mismatched = await fetch(`${origin}${missingMembershipPath}`);
    assert.equal(mismatched.status, 404, `${missingMembershipPath} must require exact format membership`);
    assert.equal(mismatched.headers.get('x-robots-tag'), 'noindex, nofollow');
  }

  const callsBeforeInvalid = calls.length;
  for (const invalidPath of [
    '/standard/cards/classic/CARD_1/',
    '/standard/cards/standard/A/',
    '/standard/cards/standard/bad-id!/',
    `/standard/cards/standard/${'A'.repeat(81)}/`,
  ]) {
    const invalid = await fetch(`${origin}${invalidPath}`);
    assert.equal(invalid.status, 404, `${invalidPath} must be a real 404`);
    assert.equal(invalid.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(await invalid.text(), /<meta name="robots" content="noindex, nofollow">/);
  }
  assert.equal(calls.length, callsBeforeInvalid, 'invalid route parameters must not query the catalog');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

const outageApp = express();
let outageCalls = 0;
outageApp.use(createConstructedCardSeoRouter({
  loadCards: async () => {
    outageCalls += 1;
    if (outageCalls === 1) throw new Error(`upstream failed: ${privateSentinels[0]}`);
    return {
      cards: [],
      updatedAt: null,
      sourceUrl: '',
      cacheSource: 'fresh',
      dataStatus: 'fresh',
      partial: false,
      datasetVersion: `ccc1-sha256:${'1'.repeat(64)}`,
      catalogVerifiedAt: '2026-07-21T00:00:00.000Z',
      catalogPublishedAt: '2026-07-21T00:00:00.000Z',
    };
  },
  loadCardDetail: async () => {
    throw new Error('detail must not load before catalog membership succeeds');
  },
  frontendAssets,
}));
const outageServer = outageApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  outageServer.once('listening', resolve);
  outageServer.once('error', reject);
});
const outageAddress = outageServer.address();
assert.ok(outageAddress && typeof outageAddress === 'object');
try {
  const unavailable = await fetch(`http://127.0.0.1:${outageAddress.port}/standard/cards/standard/CARD_1/`);
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('retry-after'), '300');
  assert.equal(unavailable.headers.get('x-robots-tag'), 'noindex, nofollow');
  const unavailableHtml = await unavailable.text();
  assert.match(unavailableHtml, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(unavailableHtml, /<div id="root" data-route-status="503">/);
  assert.match(unavailableHtml, /<h1>Библиотека карт временно недоступна<\/h1>/);
  assert.doesNotMatch(unavailableHtml, /<script type="module"/i);
  assert.doesNotMatch(unavailableHtml, /upstream failed/);
  assertNoPrivateData(unavailableHtml, 'unavailable detail');

  const emptyCatalog = await fetch(`http://127.0.0.1:${outageAddress.port}/standard/cards/standard/CARD_1/`);
  assert.equal(emptyCatalog.status, 503, 'an empty catalog must fail closed instead of declaring every card missing');
  assert.equal(emptyCatalog.headers.get('retry-after'), '300');
  assert.equal(emptyCatalog.headers.get('x-robots-tag'), 'noindex, nofollow');
} finally {
  await new Promise<void>((resolve, reject) => outageServer.close(error => (error ? reject(error) : resolve())));
}

const deadlineApp = express();
deadlineApp.use(createConstructedCardSeoRouter({
  loadCards: () => new Promise(() => {}),
  loadCardDetail: () => new Promise(() => {}),
  catalogTimeoutMs: 10,
  retryAfterSeconds: 15,
}));
const deadlineServer = deadlineApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  deadlineServer.once('listening', resolve);
  deadlineServer.once('error', reject);
});
const deadlineAddress = deadlineServer.address();
assert.ok(deadlineAddress && typeof deadlineAddress === 'object');
try {
  const timedOut = await fetch(
    `http://127.0.0.1:${deadlineAddress.port}/standard/cards/standard/CARD_1/`,
  );
  assert.equal(timedOut.status, 503, 'a stuck catalog must fail before the edge proxy deadline');
  assert.equal(timedOut.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(timedOut.headers.get('retry-after'), '15');
  assert.match(await timedOut.text(), /Библиотека карт временно недоступна/);
} finally {
  await new Promise<void>((resolve, reject) => deadlineServer.close(error => (error ? reject(error) : resolve())));
}

const staleMembershipApp = express();
staleMembershipApp.use(createConstructedCardSeoRouter({
  loadCards: async () => ({
    cards: [cards[0]],
    updatedAt: null,
    sourceUrl: '',
    cacheSource: 'LKG',
    dataStatus: 'stale',
    partial: false,
    datasetVersion: `ccc1-sha256:${'2'.repeat(64)}`,
    catalogVerifiedAt: '2026-07-20T00:00:00.000Z',
    catalogPublishedAt: '2026-07-20T00:00:00.000Z',
  }),
  loadCardDetail: async (_format, cardId) => cardId === 'CARD_1' ? {
    card: cards[0],
    cacheSource: 'LKG',
    dataStatus: 'stale',
    partial: true,
    warning: 'Последняя сохранённая версия.',
    datasetVersion: `ccc1-sha256:${'2'.repeat(64)}`,
  } : null,
  retryAfterSeconds: 60,
}));
const staleMembershipServer = staleMembershipApp.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  staleMembershipServer.once('listening', resolve);
  staleMembershipServer.once('error', reject);
});
const staleMembershipAddress = staleMembershipServer.address();
assert.ok(staleMembershipAddress && typeof staleMembershipAddress === 'object');
try {
  const staleKnown = await fetch(`http://127.0.0.1:${staleMembershipAddress.port}/standard/cards/standard/CARD_1/`);
  assert.equal(staleKnown.status, 200, 'membership present in the LKG remains safe to render');
  const staleUnknown = await fetch(`http://127.0.0.1:${staleMembershipAddress.port}/standard/cards/standard/UNKNOWN_STALE/`);
  assert.equal(staleUnknown.status, 503,
    'absence from a stale catalog is not authoritative enough for a permanent SEO 404');
  assert.equal(staleUnknown.headers.get('retry-after'), '60');
  assert.equal(staleUnknown.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(await staleUnknown.text(), /data-route-status="503"/);
} finally {
  await new Promise<void>((resolve, reject) => staleMembershipServer.close(error => (error ? reject(error) : resolve())));
}
