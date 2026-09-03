import assert from 'node:assert/strict';
import {
  createEntitySitemapLoaders,
  createEntitySitemapRuntimeOptions,
  excludeStandardCardsFromWildCatalog,
  loadBattlegroundHeroSitemapRows,
  loadBattlegroundLibrarySitemapRows,
} from '../server/entitySitemapSources.js';

const requests: string[] = [];
const payloads = new Map<string, unknown>([
  ['http://127.0.0.1:3108/api/bg/library/cards?card_type=minion&in_pool=1', {
    data: [{ dbf: 1, name: { ru: 'Активное существо' }, card_type: { slug: 'minion' }, in_pool: true }],
  }],
  ['http://127.0.0.1:3108/api/bg/library/cards?card_type=minion&in_pool=0', {
    data: [{ dbf: 2, name: { ru: 'Архивное существо' }, card_type: { slug: 'minion' }, in_pool: false }],
  }],
  ['http://127.0.0.1:3108/api/bg/heroes', {
    ok: true,
    heroes: [{ dbfId: 10, hero: 'Одиночный герой' }],
  }],
  ['http://127.0.0.1:3108/api/bg/heroes?mode=duos', {
    ok: true,
    heroes: [
      { dbfId: 10, hero: 'Дубликат из Duos' },
      { dbfId: 11, hero: 'Герой Duos' },
    ],
  }],
]);
const fetchImpl = (async (input: string | URL | Request) => {
  const url = String(input);
  requests.push(url);
  const payload = payloads.get(url);
  return payload
    ? new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
    : new Response('missing', { status: 404 });
}) as typeof fetch;

const minions = await loadBattlegroundLibrarySitemapRows('minion', { fetchImpl, timeoutMs: 100 });
assert.deepEqual(minions.map((row: any) => row.dbf), [1, 2]);
assert.deepEqual(requests.slice(0, 2).sort(), [
  'http://127.0.0.1:3108/api/bg/library/cards?card_type=minion&in_pool=0',
  'http://127.0.0.1:3108/api/bg/library/cards?card_type=minion&in_pool=1',
]);

const heroes = await loadBattlegroundHeroSitemapRows({ fetchImpl, timeoutMs: 100 });
assert.deepEqual(heroes.map((row: any) => [row.dbfId, row.hero]), [
  [10, 'Одиночный герой'],
  [11, 'Герой Duos'],
], 'solo must remain authoritative when the same hero is also present in Duos');

const standard = [{ card_id: 'SHARED_1' }, { card_id: 'STANDARD_ONLY_1' }];
const wild = [{ card_id: 'SHARED_1' }, { card_id: 'WILD_ONLY_1' }, { card_id: 'WILD_ONLY_2' }];
assert.deepEqual(
  excludeStandardCardsFromWildCatalog(standard, wild).map((row: any) => row.card_id),
  ['WILD_ONLY_1', 'WILD_ONLY_2'],
);

const constructedCalls: string[] = [];
const loaders = createEntitySitemapLoaders(async format => {
  constructedCalls.push(format);
  return { cards: format === 'standard' ? standard : wild };
});
assert.deepEqual(await loaders.loadStandardCards(), standard);
assert.deepEqual(
  (await loaders.loadWildCards()).map((row: any) => row.card_id),
  ['WILD_ONLY_1', 'WILD_ONLY_2'],
);
assert.deepEqual(constructedCalls, ['standard', 'standard', 'wild']);

const runtimeOptions = createEntitySitemapRuntimeOptions(async () => ({ cards: [] }), {
  SITEMAP_WILD_MIN_CARDS: '700',
  SITEMAP_BG_MIN_HEROES: '90',
});
assert.equal(runtimeOptions.minimumStandardCardCount, 500);
assert.equal(runtimeOptions.minimumWildCardCount, 700);
assert.equal(runtimeOptions.minimumBattlegroundHeroCount, 90);

await assert.rejects(
  () => loadBattlegroundLibrarySitemapRows('spell', { fetchImpl, timeoutMs: 100 }),
  /HTTP 404|catalog/i,
  'an unavailable catalog must fail closed instead of publishing an empty segment',
);

console.log('entity sitemap source contracts passed');
