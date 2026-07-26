import assert from 'node:assert/strict';
import {
  buildCoinCatalog,
  buildPetFamilies,
  createCosmeticsDataService,
  normalizeCosmeticMediaUrl,
  normalizeHeroSkinSummary,
  sortCosmeticsNewestFirst,
} from '../server/cosmeticsRoutes.js';

const rawSkin = {
  card_id: 'HERO_11ai',
  dbf: 120228,
  name: { en: 'Arachnid Kerrigan' },
  class: { slug: 'deathknight', name_ru: 'Рыцарь смерти' },
  rarity: { slug: 'mythic', name_ru: 'Мифический' },
  categories: [
    { slug: 'mythic_skins', name_ru: 'Мифические скины' },
    { slug: '2500_runestone_skins', name_ru: '2500 рунических камней' },
  ],
  images: {
    static: '/uploads/hero-skins/static/HERO_11ai.png',
    animated: 'https://hearthstone.wiki.gg/images/HERO_11ai.webm?rev=1',
  },
  gallery: [{ file_url: 'https://example.test/full.jpg' }],
  sounds: [{ file_url: 'https://example.test/voice.wav' }],
  release_date: '2025-02-18',
  created_at: '2026-07-25 10:15:00',
  updated_at: '2026-07-26 18:05:44',
};

assert.equal(
  normalizeCosmeticMediaUrl('/uploads/hero-skins/static/HERO_11ai.png'),
  'https://db.kolodahs.ru/uploads/hero-skins/static/HERO_11ai.png',
);
assert.equal(normalizeCosmeticMediaUrl('javascript:alert(1)'), null);
assert.equal(normalizeCosmeticMediaUrl('https://evil.example/image.png'), null);

const skin = normalizeHeroSkinSummary(rawSkin, new Map([['HERO_11ai', 'Керриган-арахнид']]));
assert.deepEqual(skin, {
  cardId: 'HERO_11ai',
  dbf: 120228,
  name: { ru: 'Керриган-арахнид', en: 'Arachnid Kerrigan' },
  class: { slug: 'deathknight', nameRu: 'Рыцарь смерти' },
  rarity: { slug: 'mythic', nameRu: 'Мифический' },
  categorySlugs: ['mythic_skins', '2500_runestone_skins'],
  images: {
    static: 'https://db.kolodahs.ru/uploads/hero-skins/static/HERO_11ai.png',
    animated: 'https://hearthstone.wiki.gg/images/HERO_11ai.webm?rev=1',
  },
  releaseDate: '2025-02-18',
  sourceAddedAt: '2026-07-25 10:15:00',
  updatedAt: '2026-07-26 18:05:44',
});
assert.equal('gallery' in skin, false, 'list summary must not include gallery');
assert.equal('sounds' in skin, false, 'list summary must not include sounds');

const localizedRarity = normalizeHeroSkinSummary({
  ...rawSkin,
  rarity: { slug: 'full', name_ru: 'Full' },
});
assert.equal(localizedRarity.rarity.nameRu, 'Полный', 'rarity labels must be localized consistently');

const relationSet = {
  generated_by_cards: [
    { card_id: 'A', dbf: 1, name_ru: 'Генератор', name_en: 'Generator' },
    { card_id: 'B', dbf: 2, name_ru: 'Кошель', name_en: 'Pouch' },
  ],
  related_cards: [
    { card_id: 'C', dbf: 3, name_ru: 'Связанная карта', name_en: 'Related Card' },
  ],
};
const coinCatalog = buildCoinCatalog([
  {
    card_id: 'COIN_A',
    dbf: 100,
    release_date: '2025-03-01',
    created_at: '2026-07-24 10:00:00',
    name: { coin_en: 'Alpha Coin', card_ru: 'Монетка' },
    text: { ru: 'Получите ману.' },
    images: { card: 'https://art.hearthstonejson.com/a.png', crop: 'https://art.hearthstonejson.com/a-crop.png' },
    ...relationSet,
  },
  {
    card_id: 'COIN_B',
    dbf: 101,
    release_date: '2026-03-01',
    created_at: '2026-07-23 10:00:00',
    name: { coin_en: 'Beta Coin', card_ru: 'Монетка' },
    text: { ru: 'Получите ману.' },
    images: { card: 'https://art.hearthstonejson.com/b.png', crop: 'https://art.hearthstonejson.com/b-crop.png' },
    ...relationSet,
  },
]);
assert.equal(coinCatalog.items.length, 2);
assert.equal(coinCatalog.generatedBy.length, 2);
assert.equal(coinCatalog.related.length, 1);
assert.deepEqual(
  coinCatalog.items.map(item => item.cardId),
  ['COIN_B', 'COIN_A'],
  'coins must be ordered by in-game release date, newest first',
);
assert.equal('generatedBy' in coinCatalog.items[0], false, 'relations must not be duplicated inside each coin');

const pets = buildPetFamilies([
  {
    card_id: 'PET_3_2',
    dbf: 122618,
    pet: { id: 3, name: 'King Krush' },
    variant: { id: 6, name: 'Devilsaur Krush', level: 2 },
    release_date: '2025-07-01',
    created_at: '2026-07-20 10:00:00',
    images: { card: '/uploads/pets/cards/PET_3_2.png', end_screen_background: 'https://hearthstone.wiki.gg/end.png' },
  },
  {
    card_id: 'PET_3_1',
    dbf: 122617,
    pet: { id: 3, name: 'King Krush' },
    variant: { id: 5, name: 'Classic Krush', level: 1 },
    release_date: '2025-07-01',
    created_at: '2026-07-20 09:00:00',
    images: { card: '/uploads/pets/cards/PET_3_1.png', end_screen_background: 'https://hearthstone.wiki.gg/end.png' },
  },
  {
    card_id: 'PET_9_1',
    dbf: 125001,
    pet: { id: 9, name: 'New Pet' },
    variant: { id: 20, name: 'Newest Pet', level: 1 },
    release_date: '2026-06-30',
    created_at: '2026-07-21 10:00:00',
    images: { card: '/uploads/pets/cards/PET_9_1.png' },
  },
]);
assert.equal(pets.length, 2);
assert.deepEqual(pets.map(family => family.petId), [9, 3], 'pet families must show newest releases first');
assert.deepEqual(pets[1].variants.map(variant => variant.name), ['Classic Krush', 'Devilsaur Krush']);
assert.equal(pets[1].variants[0].images.card, 'https://db.kolodahs.ru/uploads/pets/cards/PET_3_1.png');
assert.equal('endScreen' in pets[1].variants[0].images, false, 'catalog must defer the End Screen to detail');

assert.deepEqual(
  sortCosmeticsNewestFirst([
    { cardId: 'NO_DATE_LOW', dbf: 1, releaseDate: null, sourceAddedAt: null },
    { cardId: 'ADDED_OLD', dbf: 2, releaseDate: null, sourceAddedAt: '2026-07-20 10:00:00' },
    { cardId: 'RELEASED_NEW', dbf: 3, releaseDate: '2026-06-30', sourceAddedAt: '2026-07-01 10:00:00' },
    { cardId: 'ADDED_NEW', dbf: 4, releaseDate: null, sourceAddedAt: '2026-07-21 10:00:00' },
  ]).map(item => item.cardId),
  ['RELEASED_NEW', 'ADDED_NEW', 'ADDED_OLD', 'NO_DATE_LOW'],
  'release date wins, then DB insertion date, then the stable identifier',
);

const missingService = createCosmeticsDataService({
  apiBaseUrl: 'https://db.kolodahs.ru/api/v1',
  localizedCardsUrl: 'https://example.test/cards.json',
  fetchJson: async () => {
    const error = new Error('missing') as Error & { status?: number };
    error.status = 404;
    throw error;
  },
});
assert.equal(
  await missingService.loadDetail('heroes', 'NOT_REAL'),
  null,
  'an authoritative upstream 404 must remain a missing entity rather than becoming an outage',
);

console.log('cosmetics model tests passed');
