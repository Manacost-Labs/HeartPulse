import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFirstPaintJson } from '../apps/public-web/lib/publicFirstPaintRead';
import { loadStandardMetaTeaserSeed, standardMetaTeaserPath } from '../apps/public-web/lib/publicStandardMetaTeaserData';
import { publicArchetypeCatalog } from '../apps/public-web/lib/publicArchetypeCatalogTeaserData';
import { cosmeticsCatalogSeed, cosmeticsCatalogSeedRequest } from '../apps/public-web/lib/publicCosmeticsCatalogData';
import { publicFunDecksPreview } from '../apps/public-web/lib/publicFunDecksPreviewData';

// Server reads that put anonymous public data into the first paint. They must
// answer exactly the request the page makes, carry no paid data, and give up
// (null) instead of holding or failing the document.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

// readFirstPaintJson: JSON on success, null on a failure, an error status or the deadline.
assert.deepEqual(await readFirstPaintJson(async () => json({ ok: 1 }), Date.now() + 1000), { ok: 1 });
assert.equal(await readFirstPaintJson(async () => json({ error: 'x' }, 502), Date.now() + 1000), null);
assert.equal(await readFirstPaintJson(async () => { throw new Error('ECONNREFUSED'); }, Date.now() + 1000), null);
assert.equal(await readFirstPaintJson(() => { throw new Error('Invalid legacy origin'); }, Date.now() + 1000), null);
assert.equal(await readFirstPaintJson(async () => new Response('not json'), Date.now() + 1000), null);
const started = Date.now();
assert.equal(await readFirstPaintJson(() => new Promise(() => {}), Date.now() + 60), null);
assert.ok(Date.now() - started < 1000, 'a stalled Express read is abandoned at the deadline');
assert.equal(await readFirstPaintJson(async () => json({ ok: 1 }), Date.now() - 1), null);

// Meta: the guest's slice, resolved to the current period like the page does.
const metaItem = (index: number) => ({
  id: `a${index}`, slug: `a-${index}`, archetype: `Archetype ${index}`, archetypeLabel: `Архетип ${index}`,
  translated: true, classKey: 'mage', winrate: 51.2, popularity: 4.1, games: 1200 + index,
  turns: 8.2, durationMinutes: 7.5, climbingSpeed: 1.1,
});
const metaPayload = (period: string, items = [metaItem(1), metaItem(2), metaItem(3)]) => ({
  format: 'standard', formatLabel: 'Стандарт', rank: 'diamond_legend', rankLabel: 'Алмаз — Легенда', period,
  availablePeriods: ['past_day', 'past_3_days', 'patch_36.6.3'], currentPeriod: 'patch_36.6.3',
  currentPatchPeriod: 'patch_36.6.3', coin: 'any_player', minGames: 100, source: 'hsguru', sourceUrl: '',
  translationSource: '', updatedAt: '2026-10-03T10:00:00.000Z', items,
});
assert.equal(standardMetaTeaserPath(null),
  '/api/standard-meta/teaser?format=standard&rank=diamond_legend&coin=any_player&min_games=100');
const metaReads: string[] = [];
const metaSeed = await loadStandardMetaTeaserSeed(async path => {
  metaReads.push(path);
  return metaPayload(new URL(path, 'http://x').searchParams.get('period') ?? 'past_day');
});
assert.deepEqual(metaReads, [standardMetaTeaserPath(null), standardMetaTeaserPath('patch_36.6.3')]);
assert.equal(metaSeed?.period, 'patch_36.6.3');
assert.equal(metaSeed?.data.period, 'patch_36.6.3');
assert.equal(metaSeed?.data.items.length, 3);
const oneRead: string[] = [];
await loadStandardMetaTeaserSeed(async path => { oneRead.push(path); return metaPayload('patch_36.6.3'); });
assert.equal(oneRead.length, 1, 'no second read when Express already answered the current period');
assert.equal(await loadStandardMetaTeaserSeed(async () => null), null);
assert.equal(await loadStandardMetaTeaserSeed(async () => ({ items: 'broken' })), null);
assert.equal(await loadStandardMetaTeaserSeed(async () => metaPayload('patch_36.6.3',
  [metaItem(1), metaItem(2), metaItem(3), metaItem(4)])), null, 'more than the top three is not a teaser');

// Archetypes: whitelisted catalog without builds (deck codes are paid data).
const catalogRaw = {
  format: 'wild', formatLabel: 'Вольный', patch: '36.6.3', minimumGames: 50, updatedAt: null,
  coverage: { secret: 'PRIVATE_COVERAGE' }, account: 'PRIVATE_ACCOUNT',
  items: [{
    slug: 'thief-priest', archetype: 'Thief Priest', archetypeLabel: 'Воровской Жрец', translated: true,
    classKey: 'priest', format: 'wild', games: 31959, winrate: 58.3, popularity: 13.5, turns: 7.9,
    durationMinutes: 8, climbingSpeed: 1.24, deckCount: 4, sourceUrl: 'https://www.hsguru.com/meta',
    builds: [{ deckCode: 'PRIVATE_DECK' }], extra: 'PRIVATE_ITEM',
  }],
};
const catalog = publicArchetypeCatalog(catalogRaw, 'wild');
assert.equal(catalog?.items[0].archetypeLabel, 'Воровской Жрец');
assert.deepEqual(catalog?.items[0].builds, []);
assert.deepEqual(catalog?.coverage, {});
assert.equal(JSON.stringify(catalog).includes('PRIVATE_'), false);
assert.equal(publicArchetypeCatalog(catalogRaw, 'standard'), null, 'a catalog of another format is not the seed');
assert.equal(publicArchetypeCatalog({ ...catalogRaw, items: [{ ...catalogRaw.items[0], games: -1 }] }, 'wild'), null);
assert.equal(publicArchetypeCatalog({ ...catalogRaw, items: [{ ...catalogRaw.items[0], slug: '../x' }] }, 'wild'), null);
assert.equal(publicArchetypeCatalog(null, 'wild'), null);

// Cosmetics: the server builds the very URL the grid requests.
assert.equal(cosmeticsCatalogSeedRequest('heroes', '').url, '/api/cosmetics/heroes');
assert.equal(cosmeticsCatalogSeedRequest('heroes', 'class=mage&page=2&utm_source=x').url,
  '/api/cosmetics/heroes?class=mage&page=2');
assert.equal(cosmeticsCatalogSeedRequest('heroes', 'search=Jaina&rarity=legendary').url,
  '/api/cosmetics/heroes?search=Jaina&rarity=legendary');
assert.equal(cosmeticsCatalogSeedRequest('coins', 'class=mage').url, '/api/cosmetics/coins',
  'only hero listings filter');
const cosmeticsPayload = {
  items: [{ cardId: 'HERO_01cg' }], pagination: { page: 1, perPage: 48, total: 1, totalPages: 1 },
  updatedAt: null, source: 'HearthstoneJSON',
};
assert.deepEqual(cosmeticsCatalogSeed('/api/cosmetics/heroes', cosmeticsPayload),
  { requestUrl: '/api/cosmetics/heroes', payload: cosmeticsPayload });
assert.equal(cosmeticsCatalogSeed('/api/cosmetics/heroes', { ...cosmeticsPayload, pagination: { page: 0 } }), null);
assert.equal(cosmeticsCatalogSeed('/api/cosmetics/heroes', { error: 'upstream' }), null);

// Fun decks: only the three newest free decks of the selection enter the page.
const funDeck = (index: number, firstSeenAt: string) => ({
  title: `Deck ${index}`, deckCode: `CODE_${index}`, format: index % 2 ? 'Wild' : 'Standard', className: 'mage',
  streamer: null, funScore: 0.7, maxMetaSimilarity: 0.3, nearestArchetype: null, winRate: 51, games: 100,
  reasons: ['combo'], url: index === 1 ? 'javascript:alert(1)' : 'https://www.hsguru.com/decks/1', firstSeenAt,
  lastSeenAt: null, secret: 'PRIVATE_FIELD',
});
const funRaw = {
  fetchedAt: '2026-10-03T10:00:00.000Z', stats: { total: 5, standard: 3, wild: 2 },
  methodology: { detectorVersion: 'v3', minFunScore: 0.55, maxMetaSimilarity: 0.42 },
  decks: [funDeck(1, '2026-09-01'), funDeck(2, '2026-10-02'), funDeck(3, '2026-09-20'), funDeck(4, '2026-10-01'),
    funDeck(5, '2026-08-01')],
};
const funPreview = publicFunDecksPreview(funRaw);
assert.deepEqual(funPreview?.decks.map(deck => deck.deckCode), ['CODE_2', 'CODE_4', 'CODE_3'],
  'the guest preview is the newest three, in the order the page shows');
assert.deepEqual(funPreview?.stats, { total: 5, standard: 3, wild: 2 });
assert.equal(JSON.stringify(funPreview).includes('CODE_1') || JSON.stringify(funPreview).includes('CODE_5'), false,
  'paid decks never enter the server HTML');
assert.equal(JSON.stringify(funPreview).includes('PRIVATE_'), false);
assert.equal(publicFunDecksPreview({ ...funRaw, decks: [{ ...funDeck(1, '2026-10-03') }] })?.decks[0].url, null,
  'only https source links are kept');
assert.equal(publicFunDecksPreview({ ...funRaw, stats: { total: -1, standard: 0, wild: 0 } }), null);
assert.equal(publicFunDecksPreview({ error: 'upstream' }), null);

// The loaders are server-only, anonymous (fetchPublicExpress) and bounded.
for (const loader of ['publicStandardMetaTeaser', 'publicArchetypeCatalogTeaser', 'publicCosmeticsCatalog',
  'publicFunDecksPreview']) {
  const source = readFileSync(new URL(`../apps/public-web/lib/${loader}.ts`, import.meta.url), 'utf8');
  assert.match(source, /^import 'server-only';/, `${loader} never reaches the browser bundle`);
  assert.match(source, /fetchPublicExpress\(/, `${loader} reads without viewer cookies`);
  assert.match(source, /readFirstPaintJson\(/, `${loader} gives up at the first-paint deadline`);
}

console.log('first-paint loader contracts passed');
