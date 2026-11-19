import assert from 'node:assert/strict';
import fc from 'fast-check';
import { isIndexableArchetype } from '../shared/constructedArchetypeIndexing.js';
import { assertProperty } from './helpers/propertyRuns.js';
import {
  createEntitySitemapLoaders,
  createEntitySitemapRuntimeOptions,
  excludeStandardCardsFromWildCatalog,
  loadBattlegroundHeroSitemapRows,
  loadBattlegroundLibrarySitemapRows,
  selectIndexableArchetypeRows,
} from '../server/entitySitemapSources.js';

const ratedRow = (dbfId: number, name: string, avg: number, eightPlaces: boolean) => ({
  dbfId, hero: name, tier: 'A', avg_placement: avg, pick_rate: '4.5%',
  ...(eightPlaces ? { placement_distribution: [20, 15, 14, 13, 12, 11, 8, 7] } : {}),
});

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
    heroes: [{ dbfId: 10, hero: 'Одиночный герой' }, { dbfId: 13, hero: 'Полный Solo' }],
  }],
  // Open ranking (base range) the hero pages and the hero segment are judged on: heroes 10 and 12 are rated in
  // both modes (10 facts: the page's threshold), hero 11 only in Duos (5 facts, the page is noindex).
  ['http://127.0.0.1:3108/api/bg/heroes?mode=solo&mmr=TOP_50_PERCENT', {
    ok: true, heroes: [ratedRow(10, 'Одиночный герой', 4.1, true), ratedRow(12, 'Герой Duos 2', 4.4, true),
      // Rated in solo only, with every field filled: more than ten facts, still not indexable (both modes are required).
      { ...ratedRow(13, 'Полный Solo', 3.9, true), games: 9000, best_composition: { name: 'Нежить' },
        key_minions_top3: [{ name: 'А' }, { name: 'Б' }, { name: 'В' }], hero_power: { card: { name: 'Сила' } } }],
  }],
  ['http://127.0.0.1:3108/api/bg/heroes?mode=duos&mmr=TOP_50_PERCENT', {
    ok: true,
    heroes: [ratedRow(10, 'Одиночный герой', 4.0, false), ratedRow(11, 'Герой Duos', 4.2, false), ratedRow(12, 'Герой Duos 2', 4.5, false)],
  }],
  ['http://127.0.0.1:3108/api/bg/heroes?mode=duos', {
    ok: true,
    heroes: [
      { dbfId: 10, hero: 'Дубликат из Duos' },
      { dbfId: 11, hero: 'Герой Duos' },
      { dbfId: 12, hero: 'Герой Duos 2' },
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
  [12, 'Герой Duos 2'],
], 'solo must remain authoritative for a hero in both modes; a hero below the indexing threshold (Duos only) stays out');

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
  SITEMAP_STANDARD_MIN_CARDS: 'not-a-number',
  SITEMAP_WILD_MIN_CARDS: '700',
  SITEMAP_BG_MIN_SPELLS: '50001',
  SITEMAP_BG_MIN_HEROES: '90',
});
assert.equal(runtimeOptions.minimumStandardCardCount, 500);
assert.equal(runtimeOptions.minimumWildCardCount, 700);
assert.equal(runtimeOptions.minimumBattlegroundSpellCount, 50);
assert.equal(runtimeOptions.minimumBattlegroundHeroCount, 90);

await assert.rejects(
  () => loadBattlegroundLibrarySitemapRows('spell', { fetchImpl, timeoutMs: 100 }),
  /HTTP 404|catalog/i,
  'an unavailable catalog must fail closed instead of publishing an empty segment',
);

// Archetypes: the sitemap lists what the archetype page of the same catalog marks `index`.
const archetype = (slug: string, overrides: Record<string, unknown> = {}) => ({
  slug,
  archetype: slug,
  archetypeLabel: slug,
  format: 'standard',
  games: 5_000,
  winrate: 51.5,
  popularity: 2.5,
  deckCount: 3,
  builds: [],
  ...overrides,
});
const archetypeCatalog = {
  format: 'standard',
  period: 'black_empire_ban',
  updatedAt: '2026-10-29T11:00:03.937811+00:00',
  items: [
    archetype('strong-paladin'),
    archetype('weak-priest', { games: 999 }),
    archetype('wild-zoo', { format: 'wild' }),
    archetype('buildless-druid', { deckCount: 0 }),
    archetype('unplayed-rogue', { popularity: 0 }),
    archetype('border-mage', { games: 1_000 }),
    archetype('Not A Slug'),
    archetype('weak-first', { games: 10 }),
    archetype('weak-first', { games: 90_000 }),
    archetype('strong-first'),
    archetype('strong-first', { games: 90_000 }),
  ],
};
const selected = selectIndexableArchetypeRows([archetypeCatalog]);
assert.deepEqual(selected.map((row: any) => row.item.slug), ['strong-paladin', 'border-mage', 'strong-first'],
  'strong archetypes only: weak, Wild, buildless, unplayed, malformed and shadowed duplicates stay out');
assert.deepEqual(selected.map((row: any) => row.item.games), [5_000, 1_000, 5_000],
  'the first row of a slug is the one the page serves');
assert.ok(selected.every(row => row.updatedAt === archetypeCatalog.updatedAt && row.period === 'black_empire_ban'));
for (const broken of [[{ ...archetypeCatalog, format: 'wild' }], [{ ...archetypeCatalog, items: null }], [null], [], null]) {
  assert.throws(() => selectIndexableArchetypeRows(broken as any), /invalid/i,
    'a catalog of another format or without rows fails closed');
}
assert.deepEqual(selectIndexableArchetypeRows([{ ...archetypeCatalog, items: [] }]), []);

// The page reads a slug from the first window that lists it (patch, then Bans), so a slug is judged there only.
const patchWindow = { ...archetypeCatalog, period: 'patch_37.0.2', updatedAt: '2026-11-14T08:00:00+00:00',
  items: [archetype('patch-only'), archetype('patch-thin', { games: 40 }), archetype('strong-paladin', { games: 200 })] };
const banWindow = { ...archetypeCatalog, items: [archetype('patch-thin'), archetype('strong-paladin'), archetype('bans-only')] };
const windowed = selectIndexableArchetypeRows([patchWindow, banWindow]);
assert.deepEqual(windowed.map((row: any) => row.item.slug), ['patch-only', 'bans-only'],
  'a slug the patch window lists thin is not rescued by the Bans window');
assert.deepEqual(windowed.map(row => row.period), ['patch_37.0.2', 'black_empire_ban']);

const archetypeRequests: string[] = [];
const archetypeOptions = createEntitySitemapRuntimeOptions(async () => ({ cards: [] }), {
  SITEMAP_ARCHETYPES_MIN: '12',
}, undefined, {
  loadCatalogs: async format => {
    archetypeRequests.push(format);
    return [archetypeCatalog];
  },
});
assert.equal(archetypeOptions.minimumArchetypeCount, 12);
assert.deepEqual((await archetypeOptions.loadArchetypes()).map((row: any) => row.item.slug),
  ['strong-paladin', 'border-mage', 'strong-first']);
assert.deepEqual(archetypeRequests, ['standard'], 'only the Standard catalog is read, Wild never');
for (const value of [undefined, 'many', '0', '50001']) {
  assert.equal(
    createEntitySitemapRuntimeOptions(async () => ({ cards: [] }), { SITEMAP_ARCHETYPES_MIN: value }, undefined, {
      loadCatalogs: async () => [archetypeCatalog],
    }).minimumArchetypeCount,
    30,
    `a floor of ${String(value)} falls back to 30`,
  );
}
assert.equal('loadArchetypes' in createEntitySitemapRuntimeOptions(async () => ({ cards: [] }), {}), false,
  'without a catalog the segment is not part of the sitemap');
await assert.rejects(
  () => createEntitySitemapRuntimeOptions(async () => ({ cards: [] }), {}, undefined, {
    loadCatalogs: async () => { throw new Error('catalog down'); },
  }).loadArchetypes(),
  /catalog down/,
  'a failed catalog read fails the refresh, which falls back to the last known good segment',
);

// Property: whatever the catalog holds, the list is the pages the shared rule marks indexable.
const archetypeItem = fc.record({
  slug: fc.constantFrom('a-deck', 'b-deck', 'c-deck', 'd-deck', 'e-deck', 'Bad Slug', ''),
  format: fc.constantFrom('standard', 'wild', 'twist'),
  games: fc.oneof(fc.integer({ min: 0, max: 3_000 }), fc.constant(Number.NaN), fc.constant(null)),
  deckCount: fc.oneof(fc.integer({ min: 0, max: 4 }), fc.constant(null)),
  popularity: fc.oneof(fc.double({ min: 0, max: 20, noNaN: true }), fc.constant(null)),
});
assertProperty(fc.property(fc.array(archetypeItem, { maxLength: 30 }), items => {
  const rows = selectIndexableArchetypeRows([{ ...archetypeCatalog, items }]);
  const slugs = rows.map((row: any) => row.item.slug);
  assert.equal(new Set(slugs).size, slugs.length, 'a slug is listed once');
  for (const row of rows as any[]) {
    assert.equal(row.item.format, 'standard', 'Wild never enters');
    assert.ok(isIndexableArchetype(row.item), 'every listed page passes the shared rule');
    assert.ok(items.includes(row.item), 'rows are catalog rows, not copies');
    const firstOfSlug = items.find(item => item.slug === row.item.slug);
    assert.equal(row.item, firstOfSlug, 'the page serves the first row of a slug');
  }
  for (const item of items) {
    const validSlug = item.slug.endsWith('-deck');
    const firstOfSlug = items.find(candidate => candidate.slug === item.slug) === item;
    if (validSlug && firstOfSlug && isIndexableArchetype(item as any)) {
      assert.ok(rows.some((row: any) => row.item === item), `${item.slug} passes the rule and must be listed`);
    }
  }
  const listedInCatalogOrder = items.filter(item => rows.some((row: any) => row.item === item));
  assert.deepEqual(rows.map((row: any) => row.item), listedInCatalogOrder);
}));

console.log('entity sitemap source contracts passed');
