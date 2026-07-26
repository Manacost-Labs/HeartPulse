import assert from 'node:assert/strict';
import express from 'express';
import { createCosmeticsRouter } from '../server/cosmeticsRoutes.js';

const calls: Array<{ method: string; kind: string; value?: unknown }> = [];
const app = express();
app.use('/api', createCosmeticsRouter({
  loadCatalog: async (kind, query) => {
    calls.push({ method: 'catalog', kind, value: query });
    return {
      items: [{ cardId: `${kind}-1` }],
      pagination: { page: query.page, perPage: query.perPage, total: 1, totalPages: 1 },
      updatedAt: '2026-07-26T18:05:44Z',
      source: 'db.kolodahs.ru',
      ...(kind === 'coins' ? { generatedBy: new Array(44).fill(null), related: new Array(3).fill(null) } : {}),
    };
  },
  loadDetail: async (kind, cardId) => {
    calls.push({ method: 'detail', kind, value: cardId });
    return cardId === 'missing' ? null : { cardId, kind, sounds: [{ type: 'Start' }] };
  },
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api/cosmetics`;

try {
  const heroes = await fetch(`${baseUrl}/heroes?page=2&per_page=48&class=mage&rarity=full&category=1800_gold_skins&q=jaina`);
  assert.equal(heroes.status, 200);
  assert.match(heroes.headers.get('cache-control') ?? '', /stale-while-revalidate/);
  assert.ok(heroes.headers.get('etag'));
  assert.deepEqual(await heroes.json(), {
    items: [{ cardId: 'heroes-1' }],
    pagination: { page: 2, perPage: 48, total: 1, totalPages: 1 },
    updatedAt: '2026-07-26T18:05:44Z',
    source: 'db.kolodahs.ru',
  });
  assert.deepEqual(calls[0], {
    method: 'catalog',
    kind: 'heroes',
    value: {
      page: 2,
      perPage: 48,
      q: 'jaina',
      classSlug: 'mage',
      rarity: 'full',
      category: '1800_gold_skins',
    },
  });

  const invalid = await fetch(`${baseUrl}/heroes?per_page=999`);
  assert.equal(invalid.status, 400);

  const coin = await fetch(`${baseUrl}/coins/JAIL_COIN1`);
  assert.equal(coin.status, 200);
  assert.deepEqual(await coin.json(), { cardId: 'JAIL_COIN1', kind: 'coins', sounds: [{ type: 'Start' }] });

  const malformed = await fetch(`${baseUrl}/pets/PET_3_1%2Fbad`);
  assert.equal(malformed.status, 400);

  const missing = await fetch(`${baseUrl}/heroes/missing`);
  assert.equal(missing.status, 404);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('cosmetics route tests passed');
