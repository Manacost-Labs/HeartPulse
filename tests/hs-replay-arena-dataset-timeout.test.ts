import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import type { AddressInfo } from 'node:net';
import { fetchHsReplayArenaDataset, parseHsReplayArenaDataset } from '../server/modules/arena/public.js';
import { createWinrateRouter } from '../server/winrateRoutes.js';
import { createClassMatchupRouter } from '../server/classMatchupRoutes.js';
import { DEFAULT_HS_DATA_API_ORIGIN, hsDataApiOrigin } from '../server/hsDataApiOrigin.js';

// A stalled upstream: never answers, only rejects once the caller's signal aborts.
// AbortSignal.timeout() is unref'd, so the socket a real fetch would hold is
// stood in for by a ref'd timer that keeps the process alive until the abort.
const hangingFetch = ((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  const socket = setTimeout(() => reject(new Error('deadline was not applied')), 5_000);
  init?.signal?.addEventListener('abort', () => {
    clearTimeout(socket);
    reject(init.signal?.reason);
  }, { once: true });
})) as typeof fetch;
const stalledSource = { url: 'https://hs-data.example.test/datasets/hsreplay_arena', timeoutMs: 30, fetchImpl: hangingFetch };

assert.equal(hsDataApiOrigin({}), DEFAULT_HS_DATA_API_ORIGIN);
assert.equal(hsDataApiOrigin({ HS_DATA_API_BASE_URL: 'http://127.0.0.1:3108/' }), 'http://127.0.0.1:3108');

assert.throws(() => parseHsReplayArenaDataset(null), /not an object/);
assert.throws(() => parseHsReplayArenaDataset([]), /not an object/);
assert.deepEqual(parseHsReplayArenaDataset({
  fetched_at: '2026-10-27T08:00:00.000Z',
  data: { structured: { classes: [{ class: 'mage' }], matchups: 'broken' } },
}), {
  classes: [{ class: 'mage' }],
  matchups: [],
  classesUpdatedAt: '2026-10-27T08:00:00.000Z',
  matchupsUpdatedAt: '2026-10-27T08:00:00.000Z',
});
assert.deepEqual(parseHsReplayArenaDataset({
  structured: { matchups: [{ class_a: 'mage' }] },
  data: { updated_at: '2026-10-26T00:00:00.000Z', fetched_at: '2026-10-25T00:00:00.000Z' },
}), {
  classes: [],
  matchups: [{ class_a: 'mage' }],
  classesUpdatedAt: '2026-10-26T00:00:00.000Z',
  matchupsUpdatedAt: '2026-10-25T00:00:00.000Z',
});

const startedAt = Date.now();
await assert.rejects(fetchHsReplayArenaDataset(stalledSource), (error: unknown) => (
  error instanceof Error && error.name === 'TimeoutError'
));
assert.ok(Date.now() - startedAt < 2_000, 'a stalled upstream must be abandoned at the deadline');

const allow: RequestHandler = (_request, _response, next) => next();
const app = express();
const snapshot = { classes: [{ id: 'mage', winrate: 51 }], updatedAt: '2026-10-26T00:00:00.000Z', source: 'cached' };
app.use('/api', createWinrateRouter({
  accessGuard: allow,
  cache: new Map(),
  redisKey: source => `winrates:${source}`,
  redisGet: async () => null,
  redisSet: async () => undefined,
  fetchSource: () => fetchHsReplayArenaDataset(stalledSource),
  loadSnapshot: () => ({ data: snapshot, etag: '"snapshot"' }),
  memoryTtlMs: 1_000,
  redisTtlSeconds: 60,
}));
const matchupCache = {
  current: { data: { matchups: [{ classAId: 'mage', classBId: 'rogue', winrate: 50 }] }, etag: '"m"', expiresAt: 0 },
};
app.use('/api', createClassMatchupRouter({
  accessGuard: allow,
  cache: matchupCache,
  redisKey: 'class-matchups',
  redisGet: async () => null,
  redisSet: async () => undefined,
  fetchMatchups: () => fetchHsReplayArenaDataset(stalledSource),
  memoryTtlMs: 1_000,
  redisTtlSeconds: 60,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

try {
  const winrates = await fetch(`${origin}/winrates?source=hsreplay`);
  assert.equal(winrates.status, 200, 'an upstream timeout must fall back to the snapshot');
  const winratesBody = await winrates.json() as Record<string, unknown>;
  assert.equal(winratesBody.warning, 'fallback');
  assert.deepEqual(winratesBody.classes, snapshot.classes);

  const matchups = await fetch(`${origin}/class-matchups`);
  assert.equal(matchups.status, 200, 'an upstream timeout must fall back to the stale cache');
  const matchupsBody = await matchups.json() as Record<string, unknown>;
  assert.equal(matchupsBody.warning, 'stale');
  assert.deepEqual(matchupsBody.matchups, matchupCache.current.data.matchups);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('hs-replay arena dataset timeout tests passed');
