import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFirstPaintJson } from '../apps/public-web/lib/publicFirstPaintRead';
import { CatalogUnavailableError, PublicDataMissingError, createDefaultCatalogCache } from '../apps/public-web/lib/publicCatalogCache';
import { loadStandardMetaTeaserSeed, standardMetaPublicPath } from '../apps/public-web/lib/publicStandardMetaTeaserData';
import { publicArchetypeCatalog } from '../apps/public-web/lib/publicArchetypeCatalogTeaserData';
import { cosmeticsCatalogSeed, cosmeticsCatalogSeedRequest } from '../apps/public-web/lib/publicCosmeticsCatalogData';
import { publicFunDecksPreview } from '../apps/public-web/lib/publicFunDecksPreviewData';
import { createPatchNotesReader } from '../apps/public-web/lib/publicPatchNotesData';

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
let expiredRequests = 0;
await readFirstPaintJson(async () => { expiredRequests++; return json({ ok: 1 }); }, Date.now() - 1);
assert.equal(expiredRequests, 0, 'an exhausted shared budget must not start another request');
let abandonedSignal: AbortSignal | undefined;
await readFirstPaintJson(signal => {
  abandonedSignal = signal;
  return new Promise(() => {});
}, Date.now() + 30);
assert.equal(abandonedSignal?.aborted, true, 'the deadline must cancel outstanding request work');
let bodyAborted = false;
const stalledBody = await readFirstPaintJson(async signal => new Response(new ReadableStream({
  start(body) {
    body.enqueue(new TextEncoder().encode('{"pending":'));
    signal.addEventListener('abort', () => {
      bodyAborted = true;
      body.error(signal.reason);
    }, { once: true });
  },
})), Date.now() + 30);
assert.equal(stalledBody, null);
assert.equal(bodyAborted, true, 'the deadline covers a stalled JSON body, not only response headers');

// Meta: the guest's slice, resolved to the current period like the page does.
const metaItem = (index: number) => ({
  id: `a${index}`, slug: `a-${index}`, archetype: `Archetype ${index}`, archetypeLabel: `Архетип ${index}`,
  translated: true, classKey: 'mage', winrate: 51.2, popularity: 4.1, games: 1200 + index,
  turns: null, durationMinutes: null, climbingSpeed: null,
});
const metaPayload = (period: string, items = [metaItem(1), metaItem(2), metaItem(3)]) => ({
  format: 'standard', formatLabel: 'Стандарт', rank: 'diamond_legend', rankLabel: 'Алмаз — Легенда', period,
  availablePeriods: ['past_day', 'past_3_days', 'patch_36.6.3'], currentPeriod: 'patch_36.6.3',
  currentPatchPeriod: 'patch_36.6.3', coin: 'any_player', minGames: 100, source: 'hsguru', sourceUrl: '',
  translationSource: '', updatedAt: '2026-10-03T10:00:00.000Z', items,
});
assert.equal(standardMetaPublicPath(), '/api/standard-meta/public?format=standard');
const metaReads: string[] = [];
const metaSeed = await loadStandardMetaTeaserSeed(async path => {
  metaReads.push(path);
  return metaPayload('patch_36.6.3');
});
assert.deepEqual(metaReads, [standardMetaPublicPath()], 'one read of the open slice');
assert.equal(metaSeed?.period, 'patch_36.6.3');
assert.equal(metaSeed?.data.items.length, 3);
const wholeSlice = await loadStandardMetaTeaserSeed(async () => metaPayload('patch_36.6.3',
  [metaItem(1), metaItem(2), metaItem(3), metaItem(4), metaItem(5)]));
assert.equal(wholeSlice?.data.items.length, 5, 'every row of the open slice reaches the page');
assert.equal(await loadStandardMetaTeaserSeed(async () => null), null);
assert.equal(await loadStandardMetaTeaserSeed(async () => ({ items: 'broken' })), null);
assert.equal(await loadStandardMetaTeaserSeed(async () => metaPayload('patch_36.6.3', [])), null, 'an empty slice is not seeded');
// A row that brings a paid column is not an open row: the page is left to the browser.
assert.equal(await loadStandardMetaTeaserSeed(async () => metaPayload('patch_36.6.3',
  [{ ...metaItem(1), turns: 7.7 }])), null, 'a paid column is never printed into the HTML');
const sampledSeed = await loadStandardMetaTeaserSeed(async () => ({
  ...metaPayload('patch_36.6.3'), totalGames: 4_500, deckCodes: ['PAID'],
}));
assert.equal(sampledSeed?.data.totalGames, 4_500);
assert.deepEqual(Object.keys(sampledSeed?.data ?? {}).filter(key => !(key in metaPayload('patch_36.6.3'))), ['totalGames']);
assert.equal(metaSeed?.data.totalGames, undefined, 'a slice without the total stays without it');
for (const totalGames of [-1, 4_500.5, '4500']) {
  assert.equal(await loadStandardMetaTeaserSeed(async () => ({ ...metaPayload('patch_36.6.3'), totalGames })), null,
    `a total of ${JSON.stringify(totalGames)} is not a count of games`);
}

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
// The catalog heading names its HSGuru period; a value that is not one is dropped, not rendered.
assert.equal(catalog?.period, null);
assert.equal(publicArchetypeCatalog({ ...catalogRaw, period: 'black_empire_ban' }, 'wild')?.period, 'black_empire_ban');
assert.equal(publicArchetypeCatalog({ ...catalogRaw, period: '<script>' }, 'wild')?.period, null);

// Cosmetics: the server builds the very URL the grid requests.
assert.equal(cosmeticsCatalogSeedRequest('heroes', '').url, '/api/cosmetics/heroes');
assert.equal(cosmeticsCatalogSeedRequest('heroes', 'class=mage&page=2&utm_source=x').url,
  '/api/cosmetics/heroes?class=mage&page=2');
assert.equal(cosmeticsCatalogSeedRequest('heroes', 'search=Jaina&rarity=legendary').url,
  '/api/cosmetics/heroes?search=Jaina&rarity=legendary');
assert.equal(cosmeticsCatalogSeedRequest('coins', 'class=mage').url, '/api/cosmetics/coins',
  'only hero listings filter');
const heroItem = {
  cardId: 'HERO_01cg', dbf: 2826, name: { ru: 'Нетопырь Денатрий', en: 'Batty Denathrius' },
  class: { slug: 'demonhunter', nameRu: 'Охотник на демонов' }, rarity: { slug: 'legendary', nameRu: 'Легендарные' },
  categorySlugs: ['money'], images: { static: '/api/public-resource/db/uploads/hero-skins/static/HERO_01cg.png', animated: null },
  internal: 'PRIVATE_FIELD',
};
const cosmeticsPayload = {
  items: [heroItem], pagination: { page: 1, perPage: 48, total: 1, totalPages: 1 },
  updatedAt: null, source: 'HearthstoneJSON', debug: 'PRIVATE_FIELD',
};
const heroSeed = cosmeticsCatalogSeed('heroes', '/api/cosmetics/heroes', cosmeticsPayload);
assert.equal(heroSeed?.requestUrl, '/api/cosmetics/heroes');
assert.equal(heroSeed?.payload.items.length, 1);
assert.equal(JSON.stringify(heroSeed).includes('PRIVATE_'), false, 'only the fields the grid renders are serialized');
// One malformed item would crash the server render: the page falls back to the browser fetch instead.
for (const broken of [{ ...heroItem, name: null }, { ...heroItem, images: undefined }, { ...heroItem, cardId: '../x' }, 'HERO']) {
  assert.equal(cosmeticsCatalogSeed('heroes', '/api/cosmetics/heroes', { ...cosmeticsPayload, items: [heroItem, broken] }), null,
    `malformed item ${JSON.stringify(broken)?.slice(0, 40)}`);
}
assert.equal(cosmeticsCatalogSeed('heroes', '/api/cosmetics/heroes', { ...cosmeticsPayload, pagination: { page: 0 } }), null);
assert.equal(cosmeticsCatalogSeed('heroes', '/api/cosmetics/heroes', { error: 'upstream' }), null);
const coinSeed = cosmeticsCatalogSeed('coins', '/api/cosmetics/coins', {
  ...cosmeticsPayload, items: [{ cardId: 'COIN1', dbf: 1, name: { ru: 'Монетка', en: 'The Coin' }, textRu: null, images: { card: null, crop: null } }],
  generatedBy: [{ cardId: 'CS2_001', dbf: 2, name: { ru: 'Карта', en: null } }], related: [],
});
assert.equal(coinSeed?.payload.generatedBy?.[0].cardId, 'CS2_001');
assert.equal(cosmeticsCatalogSeed('pets', '/api/cosmetics/pets', { ...cosmeticsPayload,
  items: [{ petId: 1, name: 'Семейство', variants: [{ cardId: 'PET1', dbf: null, variantId: 1, name: 'Питомец', level: 1, images: {} }] }] })
  ?.payload.items.length, 1);
assert.equal(cosmeticsCatalogSeed('pets', '/api/cosmetics/pets', { ...cosmeticsPayload, items: [{ petId: 1, name: 'x' }] }), null);

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
assert.deepEqual(funPreview?.decks.map(deck => deck.deckCode), ['CODE_2', 'CODE_4', 'CODE_3', 'CODE_1', 'CODE_5'],
  'the selection is open: every deck, in the order the page shows (the newest first)');
assert.deepEqual(funPreview?.stats, { total: 5, standard: 3, wild: 2 });
assert.equal(JSON.stringify(funPreview).includes('PRIVATE_'), false, 'a field outside the allowlist never enters the server HTML');
{
  // The card list the API decodes reaches the page; a list that is not whole is dropped and the deck stays.
  const cards = [{ id: 'CARD_ONE', name: 'Карта', cost: 2, count: 2, hasPage: true }, { id: 'TIME_609t1', name: 'Рейнджер-капитан Алерия', cost: 3, count: 1, hasPage: false }, { id: null, name: null, cost: null, count: 1, hasPage: false }];
  const withCards = publicFunDecksPreview({ ...funRaw, decks: [{ ...funDeck(2, '2026-10-02'), cards: cards.map(card => ({ ...card, secret: 'PRIVATE_CARD' })) }] })?.decks[0];
  assert.deepEqual(withCards?.cards, cards);
  assert.equal(JSON.stringify(withCards).includes('PRIVATE_'), false);
  // One line with an id the allowlist refuses (`/OG_211`, `../x`) keeps its name and count, without a link; the other lines stay.
  const odd = publicFunDecksPreview({ ...funRaw, decks: [{ ...funDeck(2, '2026-10-02'), cards: [
    { id: 'CARD_ONE', name: 'Карта', cost: 2, count: 2, hasPage: true },
    { id: '/OG_211', name: 'Зов лесов', cost: 8, count: 2, hasPage: false },
    { id: '../x', name: 'Чужая', cost: 1, count: 1, hasPage: true }] }] })?.decks[0].cards;
  assert.deepEqual(odd, [{ id: 'CARD_ONE', name: 'Карта', cost: 2, count: 2, hasPage: true },
    { id: null, name: 'Зов лесов', cost: 8, count: 2, hasPage: false }, { id: null, name: 'Чужая', cost: 1, count: 1, hasPage: false }]);
  assert.equal(publicFunDecksPreview({ ...funRaw, decks: [{ ...funDeck(2, '2026-10-02'), cards: [{ id: 'CARD_ONE', name: 'Карта', cost: 1, count: 0, hasPage: true }] }] })?.decks[0].cards, undefined, 'a line without a count is not a list');
  assert.equal(publicFunDecksPreview({ ...funRaw, decks: [funDeck(2, '2026-10-02')] })?.decks[0].cards, undefined);
}
{
  // The interval, the source title and the Russian archetype name reach the guest's first view; a response without them gives nulls.
  const newer = publicFunDecksPreview({ ...funRaw, decks: [{ ...funDeck(2, '2026-10-02'), winRateCiLow: 41.5, winRateCiHigh: 67.2, variants: 1,
    sourceTitle: 'STD Deck 2', nearestArchetypeLabel: 'Вихлепых Друид', why: ['Концепт'], tags: ['concept'] }] })?.decks[0];
  assert.deepEqual([newer?.winRateCiLow, newer?.winRateCiHigh, newer?.variants, newer?.sourceTitle, newer?.nearestArchetypeLabel],
    [41.5, 67.2, 1, 'STD Deck 2', 'Вихлепых Друид']);
  assert.deepEqual([newer?.why, newer?.tags], [['Концепт'], ['concept']], 'the reasons and the filter tags reach the guest\'s first view');
  // `kind` and `pinned` reach the guest's first view; a response without them is a brew, not pinned.
  const flagged = publicFunDecksPreview({ ...funRaw, decks: [{ ...funDeck(2, '2026-10-02'), kind: 'off_meta', pinned: true }] })?.decks[0];
  assert.deepEqual([flagged?.kind, flagged?.pinned], ['off_meta', true]);
  assert.deepEqual([funPreview?.decks[0].kind, funPreview?.decks[0].pinned], ['brew', undefined]);
  assert.equal(publicFunDecksPreview({ ...funRaw, decks: [{ ...funDeck(2, '2026-10-02'), kind: 'hacked', pinned: 'yes' }] })?.decks[0].kind, 'brew');
  const older = funPreview?.decks[0];
  assert.deepEqual([older?.winRateCiLow, older?.winRateCiHigh, older?.variants, older?.sourceTitle, older?.nearestArchetypeLabel],
    [null, null, null, null, null]);
  assert.deepEqual([older?.why, older?.tags], [[], []]);
  assert.equal(publicFunDecksPreview({ ...funRaw, decks: [{ ...funDeck(2, '2026-10-02'), winRateCiLow: '41.5' }] }), null,
    'a response with a malformed number is not a selection');
}
assert.equal(publicFunDecksPreview({ ...funRaw, decks: [{ ...funDeck(1, '2026-10-03') }] })?.decks[0].url, null,
  'only https source links are kept');
assert.equal(publicFunDecksPreview({ ...funRaw, stats: { total: -1, standard: 0, wild: 0 } }), null);
assert.equal(publicFunDecksPreview({ error: 'upstream' }), null);

// Patch notes: the last good copy is served at once and refreshed behind it,
// so a slow Express never ships the page without the patch once it was read.
{
  const patch = (version: string) => ({ version, title: `Патч ${version}`, entries: [] });
  let clock = 0;
  let mode: 'ok' | 'stall' | 'fail' | 'damaged' = 'ok';
  const reads: string[] = [];
  const stalled: (() => void)[] = [];
  const load = createPatchNotesReader({
    now: () => clock, freshMs: 1000, refreshBudgetMs: 5000, maxEntries: 3,
    request: async path => {
      reads.push(path);
      if (mode === 'fail') return json({ error: 'upstream' }, 502);
      const version = path.split('/').pop() ?? '';
      const body = version === 'recent' ? { patches: [patch('37.0.2'), patch('37.0.0')] } : patch(version);
      if (mode === 'stall') await new Promise<void>(resolve => { stalled.push(resolve); });
      return json(mode === 'damaged' ? { patches: [patch('37.0.2'), { version: 5 }] } : body);
    },
  });
  const deadline = () => Date.now() + 200;
  const versions = async (version: string | null) => (await load(version, deadline())).patches?.map(item => item.version) ?? null;

  // A cold read that misses the deadline is null, but keeps going and fills the cache.
  mode = 'stall';
  assert.deepEqual(await load(null, Date.now() + 20), { patches: null });
  mode = 'ok';
  for (const resume of stalled) resume();
  await new Promise(resolve => setTimeout(resolve, 20));
  reads.length = 0;
  assert.deepEqual(await versions(null), ['37.0.2', '37.0.0'], 'the page shows the two newest patches');
  assert.deepEqual(reads, [], 'a fresh copy needs no Express read');

  // Stale: served at once while one refresh runs; a failed refresh keeps the last good copy.
  clock = 5000;
  mode = 'fail';
  reads.length = 0;
  assert.deepEqual((await load(null, Date.now() - 1)).patches?.map(item => item.version), ['37.0.2', '37.0.0'],
    'a stale copy ignores the spent budget');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(reads, ['/api/patch-notes/recent']);
  assert.deepEqual(await versions(null), ['37.0.2', '37.0.0']);

  // Unknown or damaged answers are not kept; known versions are bounded, least recently served first.
  assert.equal(await versions('9.9.9'), null);
  mode = 'damaged';
  assert.equal(await versions('8.8.8'), null, 'a version answer without its fields is not a patch');
  mode = 'ok';
  for (const version of ['1.0.0', '2.0.0', '3.0.0', '4.0.0']) await versions(version);
  reads.length = 0;
  clock = 5500;
  await versions('3.0.0');
  assert.equal(reads.includes('/api/patch-notes/3.0.0'), false, 'a cached version is served from memory');
  await versions('1.0.0');
  assert.ok(reads.includes('/api/patch-notes/1.0.0'), 'the oldest version was dropped at the bound');
}

// The last good store of the data pages: bounded in copies, size and age, never serving a removed page.
{
  let clock = 0;
  const now = () => clock;
  let down = false;
  const missing = new Set<string>();
  const sizes = new Map<string, number>();
  const options = { maxEntries: 3, maxBytes: 100, staleLimitMs: 1000, freshMs: 10, size: (value: unknown) => (value as string).length };
  const store = createDefaultCatalogCache<string>(async key => {
    if (missing.has(key)) throw new PublicDataMissingError();
    if (down) throw new Error('Express down');
    return 'x'.repeat(sizes.get(key) ?? 10);
  }, now, value => value, options);

  // Copies: the oldest idle one goes first, by count and by size.
  for (const key of ['a', 'b', 'c', 'd']) { await store(key); clock += 20; }
  down = true;
  await assert.rejects(store('a'), CatalogUnavailableError, 'the fourth copy pushed the oldest one out');
  assert.equal(await store('d'), 'x'.repeat(10), 'the newest copy is still there');
  down = false;
  sizes.set('big', 70);
  await store('big');
  clock += 20;
  down = true;
  assert.equal(await store('big'), 'x'.repeat(70));
  await assert.rejects(store('b'), CatalogUnavailableError, 'a big copy pushed out older ones to stay within the size bound');
  down = false;

  // Age: a copy older than the limit is not served in an outage.
  await store('d');
  clock += 5000;
  down = true;
  await assert.rejects(store('d'), CatalogUnavailableError, 'a copy past its age limit is not served');
  down = false;

  // A 404 is told as it is, stores nothing and drops the copy of that path.
  await store('gone');
  clock += 20;
  missing.add('gone');
  await assert.rejects(store('gone'), PublicDataMissingError);
  down = true;
  missing.delete('gone');
  await assert.rejects(store('gone'), CatalogUnavailableError, 'the removed page is not served from memory');
  down = false;
}

// A 200 that is not the page's contract is a failed read: it neither stores nor replaces the last good copy.
{
  const { readPublicJson, publicCheckCount, CHECKS_MAX_ENTRIES } = await import('../apps/public-web/lib/firstPaintStore');
  const { funDecksCheck, homeSummaryCheck, homeArticlesCheck } = await import('../apps/public-web/lib/publicPayloadChecks');
  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  let clock = realNow();
  let answer: unknown = funRaw;
  Date.now = () => clock;
  globalThis.fetch = (async () => json(answer)) as typeof fetch;
  try {
    const path = '/api/fun-decks?contract-check';
    assert.deepEqual(await readPublicJson(path, true, funDecksCheck), funRaw);
    clock += 3000;
    answer = { error: 'upstream says 200' };
    const kept = await readPublicJson(path, true, funDecksCheck);
    assert.deepEqual(kept, funRaw, 'a 200 outside the contract keeps the last good copy');
    const other = '/api/fun-decks?contract-cold';
    await assert.rejects(readPublicJson(other, true, funDecksCheck), CatalogUnavailableError,
      'with no copy a contract-breaking 200 is an outage (503), not a page without data');
    // The home feeds: an error body, null or a bare array must not replace the copy either.
    const feeds = [
      ['/api/home/summary', homeSummaryCheck, { topClasses: [{ id: 'mage', name: 'Маг', winrate: 51.2 }] }],
      ['/api/articles', homeArticlesCheck, { articles: [{ id: 'a1', title: 'Статья' }], updatedAt: null }],
    ] as const;
    for (const [feedPath, check, good] of feeds) {
      answer = good;
      const first = await readPublicJson(feedPath, false, check);
      assert.deepEqual(first, good);
      for (const broken of [{ error: 'upstream' }, null, []]) {
        clock += 3000;
        answer = broken;
        assert.deepEqual(await readPublicJson(feedPath, false, check), good, `${feedPath}: ${JSON.stringify(broken)} keeps the copy`);
      }
    }
    // The check belongs to its request: unique paths pushing it out of the table while the answer is on the wire
    // must not let a late answer outside the contract become the copy.
    {
      let release: (() => void) | undefined;
      const slowPath = '/api/fun-decks?slow-a';
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        if (String(input).includes('slow-a')) {
          await new Promise<void>(resolve => { release = resolve; });
          return json({ error: 'late 200 outside the contract' });
        }
        return json(funRaw);
      }) as typeof fetch;
      const slow = readPublicJson(slowPath, true, funDecksCheck).then(() => 'stored', error => error);
      for (let tries = 0; !release && tries < 100; tries++) await new Promise(resolve => setTimeout(resolve, 5));
      assert.ok(release, 'the slow read is on the wire');
      for (let index = 0; index < CHECKS_MAX_ENTRIES + 20; index++) await readPublicJson(`/api/fun-decks?evict-${index}`, true, funDecksCheck);
      release();
      assert.ok(await slow instanceof CatalogUnavailableError, 'a late answer outside the contract is a failed read');
      globalThis.fetch = (async () => json({ error: 'down' }, 503)) as typeof fetch;
      clock += 3000;
      await assert.rejects(readPublicJson(slowPath, true, funDecksCheck), CatalogUnavailableError, 'it was not kept as a copy');
    }
    answer = funRaw;
    globalThis.fetch = (async () => json(answer)) as typeof fetch;
    // The check table is bounded: addresses with their own query or slug do not grow it for ever.
    answer = funRaw;
    for (let index = 0; index < CHECKS_MAX_ENTRIES + 50; index++) {
      await readPublicJson(`/api/fun-decks?q=probe-${index}`, true, funDecksCheck);
    }
    assert.ok(publicCheckCount() <= CHECKS_MAX_ENTRIES, `check table holds ${publicCheckCount()} entries, limit ${CHECKS_MAX_ENTRIES}`);
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
  }
}

// The loaders are server-only and read anonymously through `readFirstPaintJson`.
for (const loader of ['publicStandardMetaTeaser']) {
  const source = readFileSync(new URL(`../apps/public-web/lib/${loader}.ts`, import.meta.url), 'utf8');
  assert.match(source, /^import 'server-only';/, `${loader} never reaches the browser bundle`);
  assert.match(source, /fetchPublicExpress\(/, `${loader} reads without viewer cookies`);
  assert.match(source, /readFirstPaintJson\(/, `${loader} gives up at the first-paint deadline`);
}

console.log('first-paint loader contracts passed');
