import assert from 'node:assert/strict';
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
  cards: [{ card_id: 'CARD_1', name: { ru: 'Карта' }, class: 'MAGE', card_type: { slug: 'MINION' }, images: { card: '/arena-logo-icon.webp', crop: '/card-format-standard.webp' }, mechanics: ['BATTLECRY'], stats: { deckWinrate: 53 }, decks: ['PRIVATE_DECK'] }],
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
