import assert from 'node:assert/strict';
import { createArenaTierListClient } from '../src/modules/arenaTierList/model/client';
import { companionIdsFromLegendaries, loadArenaCompanionIds } from '../src/modules/arenaTierList/model/companionIds';

const now = Date.parse('2026-09-24T12:00:00Z');
const dataset = {
  sections: [{ id: 'mage', name: 'Маг', color: '#123456', textDark: false,
    tiers: [{ tier: 'S', label: 'Лучшие', description: '', cards: [{
      name: 'Карта', score: 95, rarity: 'common', cardId: 'CARD_1', classKey: 'mage',
    }, {
      name: 'Карта без оценки', score: null, rarity: 'common', cardId: 'CARD_2', classKey: 'mage',
    }] }], totalCards: 2 }],
  cards: { CARD_1: { imageHa: 'https://example.test/card.png', imageRu: null },
    CARD_2: { imageHa: 'https://example.test/card2.png', imageRu: null } },
  updatedAt: new Date(now).toISOString(), source: 'hsreplay.net',
};
const entries = new Map<string, string>();
const storage = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => { entries.set(key, value); },
  removeItem: (key: string) => { entries.delete(key); },
};
let clock = now;
let calls: Array<{ url: string; options?: RequestInit }> = [];
let response = () => Promise.resolve(Response.json(dataset, { headers: { ETag: '"one"' } }));
const client = createArenaTierListClient({ storage, now: () => clock,
  request: (url, options) => { calls.push({ url: String(url), options }); return response(); },
});
const load = (account = 'user-1', source: 'hsreplay' | 'firestone' = 'hsreplay', bust = false) =>
  client.load(account, source, { bust });

assert.equal((await load('')).status, 'error');
assert.equal(calls.length, 0, 'missing account must never call the protected API');
assert.equal((await load()).status, 'ready');
assert.match(calls[0].url, /^\/api\/tierlist\?source=hsreplay&v=ru_cards_v3$/);
assert.equal(entries.size, 1);
let cached = false;
response = () => Promise.resolve(new Response(null, { status: 304 }));
assert.equal((await client.load('user-1', 'hsreplay', { onCache: () => { cached = true; } })).status, 'ready');
assert.equal(cached, true);
assert.equal((calls.at(-1)?.options?.headers as Record<string, string>)['If-None-Match'], '"one"');
response = () => Promise.reject(new Error('offline'));
const offline = await load();
assert.equal(offline.status, 'stale');
assert.equal(offline.data?.warning, 'stale');
assert.equal((await load('other-user')).status, 'error', 'a different account cannot see cached subscriber data');
assert.equal((await load('user-1', 'firestone')).status, 'error', 'sources have separate caches');
response = () => Promise.resolve(new Response(null, { status: 403 }));
assert.equal((await load()).status, 'denied');
assert.equal(entries.size, 0, 'access revocation clears protected cache');
response = () => Promise.resolve(Response.json({ ...dataset, source: 'initial' }));
assert.equal((await load()).status, 'error', 'synthetic data must not enter the cache');
response = () => Promise.resolve(Response.json({ ...dataset, source: 'heartharena.com' }));
assert.equal((await load()).status, 'error', 'a different provider cannot enter the selected source cache');
response = () => Promise.resolve(Response.json({ ...dataset, sections: [{ id: 'mage', tiers: 'broken' }] }));
assert.equal((await load()).status, 'error', 'malformed sections must not enter the cache');
response = () => Promise.resolve(Response.json(dataset));
assert.equal((await load()).status, 'ready');
calls = [];
assert.equal((await load('user-1', 'hsreplay', true)).status, 'ready');
assert.match(calls[0].url, /&t=\d+$/);
assert.equal(calls[0].options?.cache, 'no-store');
clock += 60_001;
response = () => Promise.reject(new Error('offline'));
assert.equal((await load()).status, 'error', 'expired cache must not hide a failed refresh');
let attempts = 0;
response = () => Promise.resolve(++attempts === 1
  ? new Response(null, { status: 304 }) : Response.json(dataset));
assert.equal((await load()).status, 'ready');
assert.equal(attempts, 2, 'a 304 without a usable cache retries without a conditional header');
const legendaryGroups = { groups: [
  { keyCard: { cardId: 'KEY_A' }, cards: [{ cardId: 'KEY_A' }, { cardId: 'COMP_A' }] },
  { keyCard: { cardId: 'COMP_A' }, cards: [{ cardId: 'COMP_A' }, { cardId: 'COMP_B' }] },
] };
assert.deepEqual([...companionIdsFromLegendaries(legendaryGroups)], ['COMP_B']);
assert.deepEqual([...companionIdsFromLegendaries({ groups: 'invalid' })], []);
const protectedCompanions = await loadArenaCompanionIds(() => Promise.resolve(new Response(null, { status: 403 })));
assert.deepEqual([...protectedCompanions], [], 'protected data never falls back to a public companion list');
const loadedCompanions = await loadArenaCompanionIds(() => Promise.resolve(Response.json(legendaryGroups)));
assert.deepEqual([...loadedCompanions], ['COMP_B']);
console.log('Arena tier-list client access, cache and refresh contract passed');
