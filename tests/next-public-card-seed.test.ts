import { createDefaultCatalogCache } from '../apps/public-web/lib/publicCatalogCache.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicCardSeed } from '../apps/public-web/lib/publicCardSeed';
import { publicCatalogSeed } from '../apps/public-web/lib/publicCatalogSeed';
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
await assert.rejects(load('standard'), /catalog unavailable/, 'expired data cannot hide an upstream outage');
fail = false;
assert.equal((await load('standard')).generation, 4, 'a failed read is retried, not cached');
assert.equal((await load('standard')).generation, 4);
console.log('Default public catalog cache passed');

test('a stalled default read expires for every waiter and the next request recovers', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  let signal: AbortSignal | undefined;
  let finishLate: ((value: string) => void) | undefined;
  const recover = createDefaultCatalogCache<string>((_format, requestSignal) => {
    calls++;
    signal = requestSignal;
    return calls === 1 ? new Promise(resolve => { finishLate = resolve; }) : Promise.resolve('fresh');
  });
  const first = recover('standard');
  const second = recover('standard');
  let settled = false;
  const rejected = Promise.all([assert.rejects(first, /timed out/), assert.rejects(second, /timed out/)])
    .then(() => { settled = true; });
  await Promise.resolve();
  context.mock.timers.tick(10_000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, true, 'a shared read must not leave every default catalog request pending forever');
  await rejected;
  assert.equal(calls, 1, 'waiters still share one read');
  assert.equal(signal?.aborted, true, 'the abandoned request must be cancelled');
  assert.equal(await recover('standard'), 'fresh');
  finishLate?.('obsolete');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await recover('standard'), 'fresh', 'late completion cannot replace the recovered cache');
});

test('a late failure from an expired read cannot evict its replacement', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let time = 0;
  let calls = 0;
  let rejectOld: ((error: Error) => void) | undefined;
  const recover = createDefaultCatalogCache<string>(() => {
    calls++;
    return calls === 1 ? new Promise((_resolve, reject) => { rejectOld = reject; }) : Promise.resolve('replacement');
  }, () => time);
  const oldRead = recover('standard');
  await Promise.resolve();
  time = 10_001;
  assert.equal(await recover('standard'), 'replacement');
  const rejected = assert.rejects(oldRead, /old request/);
  rejectOld?.(new Error('old request'));
  await rejected;
  assert.equal(await recover('standard'), 'replacement');
  assert.equal(calls, 2, 'the old failure must not delete the new completed entry');
});
