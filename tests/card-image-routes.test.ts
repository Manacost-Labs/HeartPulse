import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import express from 'express';
import {
  createCardImageRouter,
  normalizeCardImageId,
  type CardImageResult,
  type CardImageRouterDependencies,
} from '../server/cardImageRoutes.js';

const ensured: Array<{ cardId: string; variant: string }> = [];
const opened: string[] = [];
const errors: Array<{ scope: string; error: unknown }> = [];
let image: CardImageResult = { path: '/safe/card.webp', source: 'blizzard' };
let ensureFails = false;

const dependencies: CardImageRouterDependencies = {
  ensureImage: async (cardId, variant) => {
    ensured.push({ cardId, variant });
    if (ensureFails) throw new Error('filesystem secret');
    return image;
  },
  isAllowedPath: path => path.startsWith('/safe/'),
  statFile: () => ({ mtimeMs: 1_234, size: 4 }),
  openStream: path => {
    opened.push(path);
    return Readable.from(Buffer.from('webp'));
  },
  onError: (scope, error) => errors.push({ scope, error }),
};

function startApp(overrides: Partial<CardImageRouterDependencies> = {}) {
  const app = express();
  app.use('/api', createCardImageRouter({ ...dependencies, ...overrides }));
  return app.listen(0, '127.0.0.1');
}

const server = startApp();
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api`;

async function get(path: string, headers: Record<string, string> = {}) {
  return fetch(`${origin}${path}`, { headers });
}

try {
  assert.equal(normalizeCardImageId(' EX1_001 '), 'EX1_001');
  assert.equal(normalizeCardImageId('../secret'), null);
  assert.equal(normalizeCardImageId('x'.repeat(81)), null);

  for (const path of [
    '/card-image/..%2Fsecret/thumb.webp',
    '/card-image/EX1_001/large.webp',
    `/card-image/${'x'.repeat(81)}/thumb.webp`,
  ]) {
    const invalid = await get(path);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await invalid.json(), { error: 'Invalid card image request' });
  }
  assert.deepEqual(ensured, []);

  const success = await get('/card-image/EX1_001/thumb.webp');
  assert.equal(success.status, 200);
  assert.equal(success.headers.get('content-type'), 'image/webp');
  assert.equal(success.headers.get('content-length'), '4');
  assert.equal(success.headers.get('x-card-image-source'), 'blizzard');
  assert.match(success.headers.get('cache-control') || '', /immutable/);
  assert.equal(Buffer.from(await success.arrayBuffer()).toString(), 'webp');
  assert.deepEqual(ensured.at(-1), { cardId: 'EX1_001', variant: 'thumb' });

  const etag = success.headers.get('etag');
  assert.ok(etag);
  const notModified = await get('/card-image/EX1_001/full.webp', { 'If-None-Match': etag });
  assert.equal(notModified.status, 304);
  assert.equal(opened.length, 1);

  const tile = await get('/card-image/EX1_001/tile.webp');
  assert.equal(tile.status, 200);
  assert.deepEqual(ensured.at(-1), { cardId: 'EX1_001', variant: 'tile' });

  image = { path: '/safe/fallback.webp', source: 'fallback' };
  const fallback = await get('/card-image/123/full.webp');
  assert.equal(fallback.status, 200);
  assert.equal(fallback.headers.get('x-card-image-source'), 'fallback');
  assert.match(fallback.headers.get('cache-control') || '', /immutable/);

  image = { path: '/safe/placeholder.webp', source: 'placeholder' };
  const placeholder = await get('/card-image/123/thumb.webp');
  assert.equal(placeholder.status, 200);
  assert.equal(placeholder.headers.get('x-card-image-source'), 'placeholder');
  assert.match(placeholder.headers.get('cache-control') || '', /max-age=300/);

  image = { path: '/etc/passwd', source: 'placeholder' };
  const escaped = await get('/card-image/EX1_001/thumb.webp');
  assert.equal(escaped.status, 502);
  assert.equal(escaped.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await escaped.json(), { error: 'Card image unavailable' });

  ensureFails = true;
  const unavailable = await get('/card-image/EX1_001/thumb.webp');
  assert.equal(unavailable.status, 502);
  assert.equal(unavailable.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await unavailable.json(), { error: 'Card image unavailable' });
  assert.ok(errors.some(entry => entry.scope === 'resolve'));
  assert.equal(JSON.stringify(await unavailable.json().catch(() => null)), 'null');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('card image router contract tests passed');
