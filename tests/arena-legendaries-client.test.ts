import assert from 'node:assert/strict';
import { createArenaLegendariesClient } from '../src/modules/arenaLegendaries/model/client';

const dataset = {
  groups: [{ keyCard: { cardId: 'KEY', name: 'Первая легендарка' },
    cards: [{ cardId: 'PAIR', name: 'Спутник' }], winRate: 54.3, classKey: 'mage' }],
  updatedAt: '2026-09-24T12:00:00Z', source: 'hsreplay.net',
};
const entries = new Map<string, string>();
const storage = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => { entries.set(key, value); },
  removeItem: (key: string) => { entries.delete(key); },
};
let clock = Date.parse('2026-09-24T12:00:00Z');
let response = () => Promise.resolve(Response.json(dataset, { headers: { ETag: '"one"' } }));
const calls: Array<{ url: string; options?: RequestInit }> = [];
const client = createArenaLegendariesClient({ storage, now: () => clock,
  request: (url, options) => { calls.push({ url: String(url), options }); return response(); },
});
const load = (account = 'user-1', source: 'hsreplay' | 'firestone' = 'hsreplay') =>
  client.load(account, source);

assert.equal((await load('')).status, 'error');
assert.equal(calls.length, 0, 'anonymous visitors never request protected groups');
assert.equal((await load()).status, 'ready');
assert.match(calls[0].url, /^\/api\/legendaries\?source=hsreplay&v=ru_cards_v4$/);
assert.equal(entries.size, 1);
let cacheShown = false;
response = () => Promise.resolve(new Response(null, { status: 304 }));
assert.equal((await client.load('user-1', 'hsreplay', { onCache: () => { cacheShown = true; } })).status, 'ready');
assert.equal(cacheShown, true);
assert.equal((calls.at(-1)?.options?.headers as Record<string, string>)['If-None-Match'], '"one"');
response = () => Promise.resolve(new Response(null, { status: 403 }));
assert.equal((await load()).status, 'denied');
assert.equal(entries.size, 0, 'access denial clears protected cache');
response = () => Promise.resolve(Response.json({ ...dataset, source: 'initial' }));
assert.equal((await load()).status, 'error', 'synthetic state is rejected');
response = () => Promise.resolve(Response.json({ ...dataset, groups: [{ keyCard: {}, cards: [] }] }));
assert.equal((await load()).status, 'error', 'malformed groups are rejected');
response = () => Promise.resolve(Response.json(dataset));
assert.equal((await load()).status, 'ready');
response = () => Promise.reject(new Error('offline'));
assert.equal((await load()).status, 'stale', 'fresh account cache survives a temporary outage');
assert.equal((await load('user-2')).status, 'error', 'another account cannot use the first account cache');
clock += 6 * 60 * 60 * 1000 + 1;
assert.equal((await load()).status, 'error', 'expired cache cannot mask an outage');
let attempts = 0;
response = () => Promise.resolve(++attempts === 1
  ? new Response(null, { status: 304 }) : Response.json(dataset));
assert.equal((await load()).status, 'ready');
assert.equal(attempts, 2, 'orphan 304 retries without conditional cache');
response = () => Promise.resolve(Response.json({ ...dataset, source: 'firestoneapp.com' }));
assert.equal((await load('user-1', 'firestone')).status, 'ready');
assert.match(calls.at(-1)?.url ?? '', /source=firestone/);
assert.equal(entries.size, 2, 'each source owns a separate account cache entry');
console.log('Arena legendary client access, cache and refresh contract passed');
