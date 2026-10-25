import assert from 'node:assert/strict';
import { createStandardMatchupsClient } from '../src/modules/standardMatchups/model/client';
import { parseStandardMatchups } from '../src/modules/standardMatchups/model/state';
import { DEFAULT_STANDARD_MATCHUPS_SLICE, type StandardMatchupsSlice } from '../src/modules/standardMatchups/model/types';

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
const sliceOf = (patch: Partial<StandardMatchupsSlice> = {}) => ({ ...DEFAULT_STANDARD_MATCHUPS_SLICE, ...patch });
const load = (account = 'reader-1', format: 'standard' | 'wild' = 'standard') => client.load(account, sliceOf({ format }));

assert.equal((await load('')).status, 'error');
assert.equal(calls.length, 0, 'anonymous visitors never request protected matchups');
assert.equal((await load()).status, 'ready');
assert.equal(calls[0].url, '/api/standard/matchups?format=standard&rank=legend&min_games=25');
assert.equal(entries.size, 1);
let cacheShown = false;
response = () => Promise.resolve(new Response(null, { status: 304 }));
assert.equal((await client.load('reader-1', sliceOf(), { onCache: () => { cacheShown = true; } })).status, 'ready');
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
assert.equal(entries.size, 1, 'an account keeps one entry, the last slice read, so slices never fill the storage quota');
response = () => Promise.reject(new Error('offline'));
assert.equal((await load('reader-1', 'wild')).status, 'stale', 'the last slice is served while offline');
assert.equal((await load()).status, 'error', 'another slice is a cache miss, not stale data of the wrong slice');
response = () => Promise.resolve(Response.json({ ...dataset, rank: 'all', period: 'past_day', minGames: 100,
  available: { ranks: ['all'], periods: ['past_day'], currentPeriod: null, defaultPeriod: null, minGames: [100] },
  rows: [{ ...dataset.rows[0], games: 900, cells: [{ ...dataset.rows[0].cells[0], games: 150 }] }] }));
const ranked = await client.load('reader-1', sliceOf({ rank: 'all', period: 'past_day', minGames: 100 }));
assert.equal(ranked.status, 'ready');
assert.equal(calls.at(-1)?.url, '/api/standard/matchups?format=standard&rank=all&min_games=100&period=past_day');
assert.equal(ranked.data?.rows[0].cells[0].games, 150);
assert.equal(parseStandardMatchups({ ...dataset, rank: 'top_100' }, 'standard'), null, 'unknown ranks are rejected');
assert.equal(parseStandardMatchups({ ...dataset, rows: [{ ...dataset.rows[0], cells: [{ opponent: 'X', winrate: 50, games: -1 }] }] },
  'standard'), null, 'negative game counts are rejected');
const withClass = { ...dataset, columns: [{ ...dataset.columns[0], classKey: 'warrior' }],
  rows: [{ ...dataset.rows[0], classKey: null }] };
assert.ok(parseStandardMatchups(withClass, 'standard'), 'class keys are optional data');
assert.equal(parseStandardMatchups({ ...withClass, rows: [{ ...withClass.rows[0], classKey: '../admin' }] }, 'standard'),
  null, 'an unknown class key never reaches an icon URL');
console.log('Standard matchup client access, cache and validation contract passed');
