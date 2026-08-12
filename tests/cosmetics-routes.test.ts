import assert from 'node:assert/strict';
import express from 'express';
import { createCosmeticsRouter } from '../server/cosmeticsRoutes.js';

const calls: Array<{ method: string; kind: string; value?: unknown }> = [];
const mediaCalls: string[] = [];
const app = express();
app.use('/api', createCosmeticsRouter({
  loadCatalog: async (kind, query) => {
    calls.push({ method: 'catalog', kind, value: query });
    return {
      items: [{ cardId: `${kind}-1` }],
      pagination: { page: query.page, perPage: query.perPage, total: 1, totalPages: 1 },
      updatedAt: '2026-07-26T18:05:44Z',
      source: 'api.kolodahearthstone.com',
      ...(kind === 'coins' ? { generatedBy: new Array(44).fill(null), related: new Array(3).fill(null) } : {}),
    };
  },
  loadDetail: async (kind, cardId) => {
    calls.push({ method: 'detail', kind, value: cardId });
    return cardId === 'missing' ? null : { cardId, kind, sounds: [{ type: 'Start' }] };
  },
}, {
  fetchMedia: async (url) => {
    mediaCalls.push(url);
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'content-length': '3',
        etag: '"upstream-media"',
      },
    });
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
    source: 'api.kolodahearthstone.com',
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

  const mediaUrl = 'https://hearthstone.wiki.gg/images/Arachnid_Kerrigan_full.jpg';
  const media = await fetch(`${baseUrl}/media?url=${encodeURIComponent(mediaUrl)}`);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'image/jpeg');
  assert.equal(media.headers.get('content-length'), '3');
  assert.match(media.headers.get('cache-control') ?? '', /stale-while-revalidate/);
  assert.equal(media.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.deepEqual([...new Uint8Array(await media.arrayBuffer())], [1, 2, 3]);
  assert.deepEqual(mediaCalls, [mediaUrl]);

  const rejectedMedia = await fetch(`${baseUrl}/media?url=${encodeURIComponent('https://evil.example/full.jpg')}`);
  assert.equal(rejectedMedia.status, 400);
  assert.deepEqual(mediaCalls, [mediaUrl], 'rejected media hosts must never reach the network');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('cosmetics route tests passed');
