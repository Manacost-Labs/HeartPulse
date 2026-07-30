import assert from 'node:assert/strict';
import express from 'express';
import { createPublicApiRouter } from '../server/modules/publicApi/public.js';
import type { PublicApiKey } from '../server/modules/publicApi/public.js';

const authenticatedKey: PublicApiKey = {
  id: 'api_key_catalog_test',
  name: 'Card catalog test',
  prefix: 'mca_live_catalogtest1',
  scopes: ['catalog.read'],
  createdAt: '2026-07-30T10:00:00.000Z',
  createdBy: 'admin-1',
  lastUsedAt: null,
  revokedAt: null,
  status: 'ACTIVE',
};

const cards = [
  {
    card_id: 'CARD_1',
    dbf: 101,
    slug: '101-alpha',
    collectible: true,
    formats: [{ slug: 'standard' }, { slug: 'wild' }],
    name: { ru: 'Альфа', en: 'Alpha' },
    text: {
      ru: '<b>Боевой клич:</b> призывает токен.<script>private()</script>',
      en: '<b>Battlecry:</b> Summon a token.',
    },
    flavor: { ru: 'Первая карта.', en: 'The first card.' },
    card_set: 'CORE',
    card_type: { slug: 'MINION', name_ru: 'Существо' },
    rarity: 'COMMON',
    class: 'MAGE',
    multi_class: [],
    minion_type: 'BEAST',
    minion_types: ['BEAST'],
    spell_school: null,
    mana_cost: 2,
    attack: 3,
    health: 4,
    durability: null,
    armor: null,
    artist: 'Artist',
    mechanics: ['BATTLECRY', 'BATTLECRY'],
    referenced_tags: ['TAUNT'],
    keyword_ids: [8, 1],
    stats: { privateSentinel: 'PRIVATE_STATS' },
    decks: [{ deckCode: 'PRIVATE_DECK' }],
    subscription: 'PRIVATE_SUBSCRIPTION',
    images: { card: 'https://blocked.example/card.png' },
  },
  {
    card_id: 'CARD_2',
    dbf: 102,
    slug: '102-beta',
    collectible: true,
    formats: [{ slug: 'standard' }, { slug: 'wild' }],
    name: { ru: 'Бета', en: 'Beta' },
    text: { ru: 'Вторая карта.', en: 'Second card.' },
    flavor: { ru: null, en: null },
    card_set: 'CORE',
    card_type: { slug: 'SPELL', name_ru: 'Заклинание' },
    rarity: 'RARE',
    class: 'PRIEST',
    multi_class: [],
    minion_type: null,
    spell_school: 'HOLY',
    mana_cost: 3,
    attack: null,
    health: null,
    durability: null,
    armor: null,
    artist: null,
    mechanics: [],
    referenced_tags: [],
    keyword_ids: [],
    images: { card: 'https://blocked.example/card-2.png' },
  },
];

let listLoads = 0;
let detailLoads = 0;
let failList = false;
const app = express();
app.use('/api/v1', createPublicApiRouter({
  apiKeys: {
    create: () => { throw new Error('not used'); },
    list: () => [],
    authenticate: value => value === 'valid-catalog-key' ? authenticatedKey : null,
    revoke: () => null,
  },
  now: () => '2026-07-30T10:30:00.000Z',
  cardCatalog: {
    loadCards: async format => {
      listLoads += 1;
      if (failList) throw new Error('PRIVATE_UPSTREAM_CARD_FAILURE');
      return {
        cards: format === 'standard' ? cards : [...cards, {
          ...cards[1],
          card_id: 'WILD_1',
          dbf: 103,
          name: { ru: 'Вольная карта', en: 'Wild card' },
          formats: [{ slug: 'wild' }],
        }],
        datasetVersion: `catalog-${format}-v1`,
        dataStatus: 'fresh',
        cacheSource: 'fresh',
        catalogPublishedAt: '2026-07-30T10:25:00.000Z',
      };
    },
    loadCardDetail: async (format, cardId) => {
      detailLoads += 1;
      if (cardId === 'MISSING_1') return null;
      return {
        card: {
          ...cards[0],
          card_id: cardId,
          formats: [{ slug: format }],
          wiki: {
            related_cards: [{
              heading: 'Choice cards',
              cards: [{
                card_id: 'TOKEN_1',
                title: 'Token one',
                image_url: 'https://blocked.example/token.png',
                url: 'https://blocked.example/token',
              }],
            }],
            generated_card_pools: [{
              pool: 'Generated cards',
              cards: [{
                card_id: 'TOKEN_2',
                title: 'Token two',
                image_url: 'https://blocked.example/token-2.png',
              }],
            }],
            external_links: [{ label: 'Private source', url: 'https://blocked.example' }],
          },
        },
        datasetVersion: `catalog-${format}-v1`,
        dataStatus: 'fresh',
        cacheSource: 'fresh',
        partial: false,
        warning: null,
      };
    },
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;
const headers = { 'X-API-Key': 'valid-catalog-key' };

try {
  const unauthenticated = await fetch(`${origin}/api/v1/cards`);
  assert.equal(unauthenticated.status, 401);
  assert.equal(listLoads, 0, 'authentication must run before the catalog loader');

  const firstPage = await fetch(
    `${origin}/api/v1/cards?format=standard&set=core&limit=1`,
    { headers },
  );
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.headers.get('cache-control'), 'private, max-age=60');
  assert.match(String(firstPage.headers.get('etag')), /^"/);
  const firstPayload = await firstPage.json() as Record<string, any>;
  assert.deepEqual(firstPayload.meta, {
    format: 'standard',
    datasetVersion: 'catalog-standard-v1',
    dataStatus: 'fresh',
    publishedAt: '2026-07-30T10:25:00.000Z',
  });
  assert.equal(firstPayload.data.length, 1);
  assert.equal(firstPayload.data[0].id, 'CARD_1');
  assert.equal(firstPayload.data[0].dbfId, 101);
  assert.equal(firstPayload.data[0].cardClass, 'MAGE');
  assert.equal(firstPayload.data[0].cost, 2);
  assert.equal(firstPayload.data[0].durability, null);
  assert.equal(firstPayload.data[0].armor, null);
  assert.deepEqual(firstPayload.data[0].mechanics, ['BATTLECRY']);
  assert.equal(firstPayload.data[0].text.ru.includes('<script>'), false);
  assert.deepEqual(firstPayload.data[0].images, {
    thumb: '/api/v1/cards/CARD_1/images/thumb.webp',
    full: '/api/v1/cards/CARD_1/images/full.webp',
    tile: '/api/v1/cards/CARD_1/images/tile.webp',
  });
  assert.equal(JSON.stringify(firstPayload).includes('PRIVATE_'), false);
  assert.equal(JSON.stringify(firstPayload).includes('blocked.example'), false);
  assert.deepEqual(firstPayload.pagination, {
    limit: 1,
    total: 2,
    hasMore: true,
    nextCursor: 'djE6Q0FSRF8x',
  });

  const secondPage = await fetch(
    `${origin}/api/v1/cards?format=standard&set=core&limit=1&cursor=${firstPayload.pagination.nextCursor}`,
    { headers },
  );
  assert.equal(secondPage.status, 200);
  const secondPayload = await secondPage.json() as Record<string, any>;
  assert.deepEqual(secondPayload.data.map((card: Record<string, unknown>) => card.id), ['CARD_2']);
  assert.deepEqual(secondPayload.pagination, {
    limit: 1,
    total: 2,
    hasMore: false,
    nextCursor: null,
  });

  const searched = await fetch(
    `${origin}/api/v1/cards?format=standard&query=%D0%B0%D0%BB%D1%8C%D1%84%D0%B0&class=mage&mechanic=battlecry`,
    { headers },
  );
  assert.equal(searched.status, 200);
  assert.deepEqual(
    ((await searched.json()) as Record<string, any>).data.map((card: Record<string, unknown>) => card.id),
    ['CARD_1'],
  );

  const invalidQuery = await fetch(`${origin}/api/v1/cards?limit=1001`, { headers });
  assert.equal(invalidQuery.status, 400);
  assert.deepEqual(await invalidQuery.json(), {
    error: { code: 'INVALID_CARD_QUERY', message: 'Card catalog query is invalid' },
  });

  const invalidCursor = await fetch(`${origin}/api/v1/cards?cursor=not-a-cursor`, { headers });
  assert.equal(invalidCursor.status, 400);

  const detail = await fetch(`${origin}/api/v1/cards/CARD_1?format=standard`, { headers });
  assert.equal(detail.status, 200);
  const detailPayload = await detail.json() as Record<string, any>;
  assert.equal(detailPayload.data.id, 'CARD_1');
  assert.deepEqual(detailPayload.data.relatedCards, [{
    heading: 'Choice cards',
    cards: [{
      id: 'TOKEN_1',
      name: { ru: null, en: 'Token one' },
      images: {
        thumb: '/api/v1/cards/TOKEN_1/images/thumb.webp',
        full: '/api/v1/cards/TOKEN_1/images/full.webp',
        tile: '/api/v1/cards/TOKEN_1/images/tile.webp',
      },
    }],
  }]);
  assert.deepEqual(detailPayload.data.generatedCardPools, [{
    name: 'Generated cards',
    cards: [{
      id: 'TOKEN_2',
      name: { ru: null, en: 'Token two' },
      images: {
        thumb: '/api/v1/cards/TOKEN_2/images/thumb.webp',
        full: '/api/v1/cards/TOKEN_2/images/full.webp',
        tile: '/api/v1/cards/TOKEN_2/images/tile.webp',
      },
    }],
  }]);
  assert.equal(JSON.stringify(detailPayload).includes('external_links'), false);
  assert.equal(detailLoads, 1);

  const notFound = await fetch(`${origin}/api/v1/cards/MISSING_1?format=wild`, { headers });
  assert.equal(notFound.status, 404);
  assert.deepEqual(await notFound.json(), {
    error: { code: 'CARD_NOT_FOUND', message: 'Card was not found' },
  });

  const invalidId = await fetch(`${origin}/api/v1/cards/bad-id!`, { headers });
  assert.equal(invalidId.status, 400);

  const unchanged = await fetch(`${origin}/api/v1/cards?format=standard&set=core&limit=1`, {
    headers: { ...headers, 'If-None-Match': String(firstPage.headers.get('etag')) },
  });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');

  failList = true;
  const unavailable = await fetch(`${origin}/api/v1/cards?format=wild`, { headers });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  const unavailablePayload = await unavailable.json();
  assert.deepEqual(unavailablePayload, {
    error: { code: 'CARD_CATALOG_UNAVAILABLE', message: 'Card catalog is temporarily unavailable' },
  });
  assert.equal(JSON.stringify(unavailablePayload).includes('PRIVATE_UPSTREAM'), false);
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
}

console.log('public API card catalog contract tests passed');
