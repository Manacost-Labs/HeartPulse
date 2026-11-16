import { createDefaultCatalogCache } from '../apps/public-web/lib/publicCatalogCache.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicCardSeed } from '../apps/public-web/lib/publicCardSeed';
import { publicCatalogSeed } from '../apps/public-web/lib/publicCatalogSeed';
import { markStaleCatalog, STALE_CATALOG_WARNING } from '../apps/public-web/lib/defaultCatalogStore';
import { lastGoodCardProjection, rememberCardProjection } from '../apps/public-web/lib/cardLastGood';
const seed = publicCardSeed({ card: { id: 'CARD_1', name: '<script>test</script>', image: 'https://hearthpulse.net/arena-logo-icon.webp', stats: { private: 53 } }, account: 'PRIVATE_ACCOUNT', decks: ['PRIVATE_DECK'] }, 'CARD_1');
assert.equal(seed.card_id, 'CARD_1');
assert.equal(seed.images.card, '/arena-logo-icon.webp');
assert.equal(seed.stats, null);
assert.doesNotMatch(JSON.stringify(seed), /PRIVATE_|"private"/);
assert.throws(() => publicCardSeed({ card: { id: 'OTHER_CARD', name: 'Карта' } }, 'CARD_1'), /Invalid/);
assert.throws(() => publicCardSeed({ card: { id: 'CARD_1', name: {} } }, 'CARD_1'), /Invalid/);
console.log('public SSR input allowlisting passed');

const catalog = {
  format: 'wild', rank: 'legend', period: { id: '1d', label: 'Последний день', patch: null, timeRange: 'LAST_1_DAY' },
  cards: [{ card_id: 'CARD_1', name: { ru: 'Карта' }, class: 'MAGE', card_type: { slug: 'MINION' }, images: { card: '/arena-logo-icon.webp', crop: '/card-format-standard.webp', tile: 'https://api.kolodahearthstone.com/uploads/card-tiles/constructed_card/CARD_1.png', horizontal: 'https://api.kolodahearthstone.com/uploads/horizontal-art/constructed_card/CARD_1.webp' }, mechanics: ['BATTLECRY'], stats: { deckWinrate: 53 }, decks: ['PRIVATE_DECK'] }],
  facets: { classes: ['MAGE'], sets: ['CORE'], mechanics: ['BATTLECRY'], types: ['MINION'], rarities: ['COMMON'] },
  pagination: { page: 1, perPage: 60, total: 1, totalPages: 1 },
  statsAccess: true, account: 'PRIVATE_ACCOUNT', datasetVersion: 'fixture', dataStatus: 'fresh',
};
const publicCatalog = publicCatalogSeed(catalog, 'wild');
assert.equal(publicCatalog.statsAccess, false);
assert.equal(publicCatalog.cards[0].stats, null);
assert.equal(publicCatalog.cards[0].card_id, 'CARD_1');
assert.equal(publicCatalog.cards[0].images.crop, '/card-format-standard.webp', 'SSR table thumbnails preserve the public crop');
assert.deepEqual(publicCatalog.cards[0].mechanics, ['BATTLECRY']);
assert.doesNotMatch(JSON.stringify(publicCatalog), /PRIVATE_|deckWinrate/);
assert.throws(() => publicCatalogSeed({ ...catalog, format: 'standard' }, 'wild'), /Invalid/);
assert.throws(() => publicCatalogSeed({ ...catalog, cards: [{}] }, 'wild'), /Invalid/);
assert.throws(() => publicCatalogSeed({ ...catalog, pagination: { ...catalog.pagination, total: -1 } }, 'wild'), /Invalid/);
assert.throws(() => publicCatalogSeed({ ...catalog, dataStatus: 'unavailable' }, 'wild'), /Invalid/);
assert.equal(publicCatalogSeed({ ...catalog, cards: [], pagination: { ...catalog.pagination, total: 0 } }, 'wild').cards.length, 0, 'empty search results are valid');

assert.equal(publicCatalog.cards[0].images.tile, catalog.cards[0].images.tile);
assert.equal(publicCatalog.cards[0].images.horizontal, catalog.cards[0].images.horizontal);


let time = 0;
let reads = 0;
let fail = false;
const load = createDefaultCatalogCache(async format => {
  reads++;
  if (fail) throw new Error('catalog unavailable');
  return { format, generation: reads };
}, () => time);

const concurrent = await Promise.all([load('standard'), load('standard')]);
assert.equal(reads, 1, 'overlapping anonymous default reads share one request');
assert.deepEqual(concurrent[0], concurrent[1]);
assert.equal((await load('standard')).generation, 1, 'another page visit reuses the valid public seed');
assert.equal((await load('wild')).format, 'wild', 'formats never share their seed');
assert.equal(reads, 2);
time = 30_001;
fail = true;
assert.equal((await load('standard')).generation, 1, 'an outage serves the last good catalog instead of failing the page');
assert.equal(reads, 3);
assert.equal((await load('standard')).generation, 1, 'right after a failure the source is not hammered again');
assert.equal(reads, 3);
time = 36_000;
fail = false;
assert.equal((await load('standard')).generation, 4, 'the source is retried after the backoff and its answer replaces the last good one');
time = 36_000 + 6 * 60 * 60 * 1000 + 60_000;
fail = true;
await assert.rejects(load('standard'), (error: Error) => error.name === 'CatalogUnavailableError', 'a catalog older than the stale limit is not served');
assert.equal((await Promise.allSettled([load('wild')]))[0].status, 'rejected', 'wild has its own last good copy, also too old now');
console.log('Default public catalog cache passed');

test('without a last good catalog an outage is a CatalogUnavailableError, not a raw failure', async () => {
  const cold = createDefaultCatalogCache<string>(async () => { throw new Error('connection refused'); });
  await assert.rejects(cold('standard'), (error: Error) => error.name === 'CatalogUnavailableError');
  await assert.rejects(cold('standard'), (error: Error) => error.name === 'CatalogUnavailableError');
});

test('with no last good catalog a recovered source is used at once', async () => {
  let up = false;
  const recover = createDefaultCatalogCache<string>(async () => { if (!up) throw new Error('down'); return 'fresh'; });
  await assert.rejects(recover('standard'), /temporarily unavailable/);
  up = true;
  assert.equal(await recover('standard'), 'fresh');
});

test('a stalled source gives way to the last good catalog after two seconds, not ten', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let time = 0;
  let calls = 0;
  let signal: AbortSignal | undefined;
  const recover = createDefaultCatalogCache<string>((_format, requestSignal) => {
    calls++;
    signal = requestSignal;
    return calls === 1 ? Promise.resolve('good') : new Promise<string>(() => {});
  }, () => time);
  assert.equal(await recover('standard'), 'good');
  time = 31_000;
  const first = recover('standard');
  const second = recover('standard');
  let settled = 0;
  const done = Promise.all([first, second]).then(values => { settled++; return values; });
  await Promise.resolve();
  context.mock.timers.tick(1_999);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, 0, 'the source still has its two seconds');
  context.mock.timers.tick(1);
  assert.deepEqual(await done, ['good', 'good'], 'every waiter gets the last good catalog at the two-second deadline');
  assert.equal(calls, 2, 'waiters share one read');
  assert.equal(signal?.aborted, false, 'the slow read goes on in the background');
  context.mock.timers.tick(8_000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signal?.aborted, true, 'but it is stopped at its hard deadline');
});

test('a stalled source with no last good catalog is unavailable after two seconds', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const cold = createDefaultCatalogCache<string>(() => new Promise<string>(() => {}));
  const outcome = assert.rejects(cold('standard'), (error: Error) => error.name === 'CatalogUnavailableError');
  await Promise.resolve();
  context.mock.timers.tick(2_000);
  await outcome;
});

test('a slow but live source costs one 503, then the late answer serves the next visit', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  let finish: ((value: string) => void) | undefined;
  const recover = createDefaultCatalogCache<string>(() => {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  });
  const first = assert.rejects(recover('standard'), (error: Error) => error.name === 'CatalogUnavailableError');
  const second = assert.rejects(recover('standard'), (error: Error) => error.name === 'CatalogUnavailableError');
  await Promise.resolve();
  context.mock.timers.tick(2_000);
  await Promise.all([first, second]);
  assert.equal(calls, 1, 'a visit during a slow read joins it instead of starting another');
  finish?.('late but good');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await recover('standard'), 'late but good', 'the late answer warmed the cache');
  assert.equal(calls, 1);
});

test('an outage shows the last good catalog as stale with a warning, and the stored copy stays fresh', async () => {
  let time = 0;
  let up = true;
  const recover = createDefaultCatalogCache(async () => {
    if (!up) throw new Error('down');
    return publicCatalog;
  }, () => time, markStaleCatalog);
  const fresh = await recover('wild');
  assert.equal(fresh.dataStatus, 'fresh');
  assert.equal(fresh.warning, null);
  up = false;
  time = 31_000;
  const fallback = await recover('wild');
  assert.equal(fallback.dataStatus, 'stale', 'the visitor is told the catalog is old, as the Express route does');
  assert.equal(fallback.warning, STALE_CATALOG_WARNING);
  assert.equal(fallback.statsAccess, false, 'the stale projection stays anonymous');
  assert.notEqual(fallback, publicCatalog, 'a new projection, not the stored object');
  assert.equal(publicCatalog.dataStatus, 'fresh', 'the original good copy is not mutated');
  assert.equal(publicCatalog.warning, null);
  up = true;
  time = 40_000;
  assert.equal((await recover('wild')).dataStatus, 'fresh', 'a recovered source is shown as fresh again');
  assert.equal(markStaleCatalog({ ...publicCatalog, warning: 'Источник: своё предупреждение' }).warning, 'Источник: своё предупреждение',
    'a warning that Express already set is kept');
});

test('the last good card projection is returned as stored and never altered by its readers', () => {
  const projection = { card: { id: 'CARD_LKG', name: 'Карта' }, classCode: 'MAGE', dbf: 1 };
  const before = JSON.stringify(projection);
  rememberCardProjection('standard', 'CARD_LKG', projection);
  const seed = publicCardSeed(lastGoodCardProjection('standard', 'CARD_LKG'), 'CARD_LKG');
  assert.equal(seed.name.ru, 'Карта');
  assert.equal(JSON.stringify(projection), before);
  assert.equal(Object.hasOwn(seed, 'dataStatus'), false, 'a card seed carries only static facts, so it has no freshness to mark');
});
