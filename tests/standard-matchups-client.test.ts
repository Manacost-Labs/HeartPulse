import assert from 'node:assert/strict';
import { createStandardMatchupsClient } from '../src/modules/standardMatchups/model/client';

const dataset = {
  format: 'standard', formatLabel: 'Стандарт', rank: 'legend', rankLabel: 'Легенда',
  source: 'hsguru', updatedAt: '2026-09-25T00:00:00Z',
  columns: [{ name: 'Control Warrior', popularity: '5%' }],
  rows: [{ archetype: 'Tempo Mage', winrate: 53.2,
    cells: [{ opponent: 'Control Warrior', winrate: 51.4 }] }],
};
const entries = new Map<string, string>();
const storage = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => { entries.set(key, value); },
  removeItem: (key: string) => { entries.delete(key); },
};
let clock = Date.parse('2026-09-25T00:00:00Z');
let response = () => Promise.resolve(Response.json(dataset, { headers: { ETag: '"first"' } }));
const calls: Array<{ url: string; options?: RequestInit }> = [];
const client = createStandardMatchupsClient({ storage, now: () => clock,
  request: (url, options) => { calls.push({ url: String(url), options }); return response(); },
});
const load = (account = 'reader-1', format: 'standard' | 'wild' = 'standard') => client.load(account, format);

assert.equal((await load('')).status, 'error');
assert.equal(calls.length, 0, 'anonymous visitors never request protected matchups');
assert.equal((await load()).status, 'ready');
assert.equal(calls[0].url, '/api/standard/matchups?format=standard');
assert.equal(entries.size, 1);
let cacheShown = false;
response = () => Promise.resolve(new Response(null, { status: 304 }));
assert.equal((await client.load('reader-1', 'standard', { onCache: () => { cacheShown = true; } })).status, 'ready');
assert.equal(cacheShown, true);
assert.equal((calls.at(-1)?.options?.headers as Record<string, string>)['If-None-Match'], '"first"');
response = () => Promise.resolve(new Response(null, { status: 403 }));
assert.equal((await load()).status, 'denied');
assert.equal(entries.size, 0, 'access denial clears the account cache');
response = () => Promise.resolve(Response.json({ ...dataset, format: 'wild' }));
assert.equal((await load()).status, 'error', 'wrong-format responses are rejected');
response = () => Promise.resolve(Response.json({ ...dataset, rows: [{ archetype: 'broken', cells: 'invalid' }] }));
assert.equal((await load()).status, 'error', 'malformed matrices are rejected');
response = () => Promise.resolve(Response.json(dataset));
assert.equal((await load()).status, 'ready');
response = () => Promise.reject(new Error('offline'));
assert.equal((await load()).status, 'stale');
assert.equal((await load('reader-2')).status, 'error', 'another account cannot see cached values');
clock += 6 * 60 * 60 * 1000 + 1;
assert.equal((await load()).status, 'error', 'expired cache cannot hide an outage');
let attempts = 0;
response = () => Promise.resolve(++attempts === 1
  ? new Response(null, { status: 304 }) : Response.json(dataset));
assert.equal((await load()).status, 'ready');
assert.equal(attempts, 2, 'orphan 304 retries unconditionally');
response = () => Promise.resolve(Response.json({ ...dataset, format: 'wild', formatLabel: 'Вольный' }));
assert.equal((await load('reader-1', 'wild')).status, 'ready');
assert.equal(entries.size, 2, 'formats keep separate cache entries');
console.log('Standard matchup client access, cache and validation contract passed');
