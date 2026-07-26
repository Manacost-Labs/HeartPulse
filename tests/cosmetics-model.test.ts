import assert from 'node:assert/strict';
import {
  buildCoinCatalog,
  buildPetFamilies,
  normalizeCosmeticMediaUrl,
  normalizeHeroSkinSummary,
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
  updatedAt: '2026-07-26 18:05:44',
});
assert.equal('gallery' in skin, false, 'list summary must not include gallery');
assert.equal('sounds' in skin, false, 'list summary must not include sounds');

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
    name: { coin_en: 'Alpha Coin', card_ru: 'Монетка' },
    text: { ru: 'Получите ману.' },
    images: { card: 'https://art.hearthstonejson.com/a.png', crop: 'https://art.hearthstonejson.com/a-crop.png' },
    ...relationSet,
  },
  {
    card_id: 'COIN_B',
    dbf: 101,
    name: { coin_en: 'Beta Coin', card_ru: 'Монетка' },
    text: { ru: 'Получите ману.' },
    images: { card: 'https://art.hearthstonejson.com/b.png', crop: 'https://art.hearthstonejson.com/b-crop.png' },
    ...relationSet,
  },
]);
assert.equal(coinCatalog.items.length, 2);
assert.equal(coinCatalog.generatedBy.length, 2);
assert.equal(coinCatalog.related.length, 1);
assert.equal('generatedBy' in coinCatalog.items[0], false, 'relations must not be duplicated inside each coin');

const pets = buildPetFamilies([
  {
    card_id: 'PET_3_2',
    dbf: 122618,
    pet: { id: 3, name: 'King Krush' },
    variant: { id: 6, name: 'Devilsaur Krush', level: 2 },
    images: { card: '/uploads/pets/cards/PET_3_2.png', end_screen_background: 'https://hearthstone.wiki.gg/end.png' },
  },
  {
    card_id: 'PET_3_1',
    dbf: 122617,
    pet: { id: 3, name: 'King Krush' },
    variant: { id: 5, name: 'Classic Krush', level: 1 },
    images: { card: '/uploads/pets/cards/PET_3_1.png', end_screen_background: 'https://hearthstone.wiki.gg/end.png' },
  },
]);
assert.equal(pets.length, 1);
assert.equal(pets[0].petId, 3);
assert.deepEqual(pets[0].variants.map(variant => variant.name), ['Classic Krush', 'Devilsaur Krush']);
assert.equal(pets[0].variants[0].images.card, 'https://db.kolodahs.ru/uploads/pets/cards/PET_3_1.png');
assert.equal('endScreen' in pets[0].variants[0].images, false, 'catalog must defer the End Screen to detail');

console.log('cosmetics model tests passed');
