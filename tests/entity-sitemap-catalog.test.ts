import assert from 'node:assert/strict';
import {
  projectBattlegroundHeroSitemapCatalog,
  projectBattlegroundLibrarySitemapCatalog,
  projectConstructedCardSitemapCatalog,
  projectStandardCardSitemapCatalog,
  renderSitemapIndex,
  renderSitemapUrlset,
} from '../server/entitySitemapRoutes.js';

const publicCard = {
  card_id: 'CARD_1',
  dbf: 101,
  name: { ru: 'Дракон & рыцарь', en: 'Dragon & Knight' },
  text: { ru: 'Боевой клич: получает +1/+1.' },
  flavor: { ru: 'Публичный художественный текст.' },
  card_set: 'CORE',
  card_type: { slug: 'MINION', name_ru: 'Существо' },
  class: 'MAGE',
  rarity: 'LEGENDARY',
  mana_cost: 5,
  attack: 5,
  health: 5,
  artist: 'Тестовый художник',
  images: { card: 'https://cdn.example.test/CARD_1.png' },
  stats: { deckWinrate: 99.99 },
  decks: [{ deckCode: 'QA_PRIVATE_DECK_CODE' }],
  subscriptionPayload: 'QA_PRIVATE_SUBSCRIPTION',
};

const cards = [
  publicCard,
  {
    ...publicCard,
    card_id: 'CARD_2',
    dbf: 102,
    name: { ru: 'Вторая карта', en: 'Second Card' },
  },
  {
    ...publicCard,
    card_id: 'PENDING_1',
    name: { ru: 'Ожидает каталог', en: 'Pending catalog' },
    catalogPending: true,
  },
];

const projected = projectStandardCardSitemapCatalog(cards, 'https://arena.hs-manacost.ru');
assert.deepEqual(projected.map(entry => entry.key), ['CARD_1', 'CARD_2']);
assert.deepEqual(projected.map(entry => entry.location), [
  'https://arena.hs-manacost.ru/standard/cards/standard/CARD_1/',
  'https://arena.hs-manacost.ru/standard/cards/standard/CARD_2/',
]);
assert.ok(projected.every(entry => /^[a-f0-9]{64}$/.test(entry.semanticHash)));

const wildProjected = projectConstructedCardSitemapCatalog(
  [{ ...publicCard, card_id: 'WILD_ONLY_1', dbf: 202, name: { ru: 'Только Вольный', en: 'Wild Only' } }],
  'wild',
  'https://arena.hs-manacost.ru',
);
assert.deepEqual(wildProjected.map(entry => entry.location), [
  'https://arena.hs-manacost.ru/standard/cards/wild/WILD_ONLY_1/',
]);

const battlegroundMinions = projectBattlegroundLibrarySitemapCatalog([
  {
    dbf: 98582,
    card_id: 'BG26_146',
    name: { ru: 'Баюбот', en: 'Lullabot' },
    text: { ru: 'В конце вашего хода получает +1/+1.' },
    card_type: { slug: 'minion', name_ru: 'Существо' },
    in_pool: true,
    images: { card: 'https://api.kolodahearthstone.com/uploads/cards/BG26_146.png' },
  },
  {
    dbf: 100001,
    card_id: 'BG_ARCHIVE_1',
    name: { ru: 'Архивный дракон', en: 'Archived Dragon' },
    card_type: { slug: 'minion', name_ru: 'Существо' },
    in_pool: false,
    images: { card: 'https://api.kolodahearthstone.com/uploads/cards/BG_ARCHIVE_1.png' },
  },
], 'minion', 'https://arena.hs-manacost.ru');
assert.deepEqual(battlegroundMinions.map(entry => entry.location), [
  'https://arena.hs-manacost.ru/library/minions/%D0%B0%D1%80%D1%85%D0%B8%D0%B2%D0%BD%D1%8B%D0%B9-%D0%B4%D1%80%D0%B0%D0%BA%D0%BE%D0%BD-100001/',
  'https://arena.hs-manacost.ru/library/minions/%D0%B1%D0%B0%D1%8E%D0%B1%D0%BE%D1%82-98582/',
]);

const battlegroundSpells = projectBattlegroundLibrarySitemapCatalog([{
  dbf: 105752,
  card_id: 'BG28_897',
  name: { ru: 'Банан в меню', en: 'Tavern Dish Banana' },
  text: { ru: 'Дает существу +1/+1.' },
  card_type: { slug: 'spell', name_ru: 'Заклинание' },
  in_pool: true,
  images: { card: 'https://api.kolodahearthstone.com/uploads/cards/BG28_897.png' },
}], 'spell', 'https://arena.hs-manacost.ru');
assert.deepEqual(battlegroundSpells.map(entry => entry.location), [
  'https://arena.hs-manacost.ru/library/spells/%D0%B1%D0%B0%D0%BD%D0%B0%D0%BD-%D0%B2-%D0%BC%D0%B5%D0%BD%D1%8E-105752/',
]);

const battlegroundHeroes = projectBattlegroundHeroSitemapCatalog([{
  dbfId: 132608,
  id: 'BG36_HERO_105',
  hero: 'Повелитель кошмаров Ксавий',
  image: 'https://hearthstone.wiki.gg/images/BG36_HERO_105.png',
  hero_power: { card: { name: 'Сила кошмара', text: 'Пассивная сила.' } },
}], 'https://arena.hs-manacost.ru');
assert.deepEqual(battlegroundHeroes.map(entry => entry.location), [
  'https://arena.hs-manacost.ru/heroes/132608/',
]);
assert.ok([...wildProjected, ...battlegroundMinions, ...battlegroundSpells, ...battlegroundHeroes]
  .every(entry => /^[a-f0-9]{64}$/.test(entry.semanticHash)));

assert.throws(
  () => projectBattlegroundLibrarySitemapCatalog([
    {
      dbf: 98582,
      name: { ru: 'Баюбот' },
      card_type: { slug: 'minion' },
      in_pool: true,
    },
    {
      dbf: 98582,
      name: { ru: 'Конфликтующий Баюбот' },
      card_type: { slug: 'minion' },
      in_pool: false,
    },
  ], 'minion', 'https://arena.hs-manacost.ru'),
  /duplicate|conflict/i,
  'active/archive DBF collisions must reject the whole segment',
);

assert.throws(
  () => projectBattlegroundHeroSitemapCatalog([
    { dbfId: 132608, hero: 'Ксавий' },
    { dbfId: 132608, hero: 'Другой герой' },
  ], 'https://arena.hs-manacost.ru'),
  /duplicate|conflict/i,
  'conflicting hero identities must reject the whole segment',
);

assert.throws(
  () => projectStandardCardSitemapCatalog([
    publicCard,
    { ...publicCard, card_id: 'bad-id!', name: { ru: 'Некорректная', en: 'Invalid' } },
  ], 'https://arena.hs-manacost.ru'),
  /invalid/i,
  'a non-pending invalid source row must reject the whole candidate',
);
assert.throws(
  () => projectStandardCardSitemapCatalog([
    publicCard,
    { ...publicCard, card_id: 'DUPLICATE_1', dbf: 201, name: { ru: 'Дубликат один', en: 'Duplicate one' } },
    { ...publicCard, card_id: 'DUPLICATE_1', dbf: 201, name: { ru: 'Дубликат два', en: 'Duplicate two' } },
  ], 'https://arena.hs-manacost.ru'),
  /duplicate/i,
  'duplicate canonical IDs must reject the whole candidate',
);
assert.throws(
  () => projectStandardCardSitemapCatalog([
    publicCard,
    { ...publicCard, card_id: 'ALIAS_1', name: { ru: 'Псевдоним', en: 'Alias' } },
  ], 'https://arena.hs-manacost.ru'),
  /alias|dbf/i,
  'two canonical IDs for one DBF entity must reject the whole candidate',
);
assert.throws(
  () => projectStandardCardSitemapCatalog([{
    ...publicCard,
    card_id: 'EMPTY_NAME_1',
    name: { ru: '   ', en: '' },
  }], 'https://arena.hs-manacost.ru'),
  /invalid/i,
  'an entity without a public card name must fail closed',
);

const privateOnlyChange = projectStandardCardSitemapCatalog([{
  ...publicCard,
  stats: { deckWinrate: 1.23, privateSentinel: 'CHANGED_PRIVATE_VALUE' },
  decks: [{ deckCode: 'CHANGED_PRIVATE_DECK' }],
  subscriptionPayload: 'CHANGED_PRIVATE_SUBSCRIPTION',
}], 'https://arena.hs-manacost.ru');
assert.equal(privateOnlyChange[0]?.semanticHash, projected[0]?.semanticHash,
  'identity and paywall-only fields must not influence the public semantic hash');

const publicChange = projectStandardCardSitemapCatalog([{
  ...publicCard,
  text: { ru: 'Боевой клич: получает +2/+2.' },
}], 'https://arena.hs-manacost.ru');
assert.notEqual(publicChange[0]?.semanticHash, projected[0]?.semanticHash,
  'a public SSR projection change must change the semantic hash');

const urlset = renderSitemapUrlset([
  { location: 'https://arena.hs-manacost.ru/example/?a=1&b=2' },
  { location: 'https://arena.hs-manacost.ru/changed/', lastmod: '2026-07-21' },
]);
assert.match(urlset, /<loc>https:\/\/arena\.hs-manacost\.ru\/example\/\?a=1&amp;b=2<\/loc>/);
assert.match(urlset, /<lastmod>2026-07-21<\/lastmod>/);
assert.doesNotMatch(urlset, /<changefreq>|<priority>/);

const index = renderSitemapIndex([
  'https://arena.hs-manacost.ru/sitemaps/static.xml',
  'https://arena.hs-manacost.ru/sitemaps/standard-cards.xml',
  'https://arena.hs-manacost.ru/sitemaps/wild-cards.xml',
  'https://arena.hs-manacost.ru/sitemaps/battleground-minions.xml',
  'https://arena.hs-manacost.ru/sitemaps/battleground-spells.xml',
  'https://arena.hs-manacost.ru/sitemaps/battleground-heroes.xml',
]);
assert.match(index, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
assert.equal([...index.matchAll(/<loc>/g)].length, 6);

assert.throws(
  () => renderSitemapUrlset(Array.from({ length: 50_001 }, (_, index) => ({
    location: `https://arena.hs-manacost.ru/card/${index}/`,
  }))),
  /50,000|50000/i,
);
assert.throws(
  () => renderSitemapUrlset([{ location: `https://arena.hs-manacost.ru/${'a'.repeat(2_000)}/` }], { maxBytes: 512 }),
  /bytes|size/i,
);

console.log('entity sitemap catalog and XML contracts passed');
