import assert from 'node:assert/strict';
import {
  distinctCatalogIdentity,
  libraryCardSearchTerms,
  visibleEnglishLibraryName,
} from '../src/features/bgLibraryCatalogModel';

const baseGift = {
  card_id: 'BG36_MidGameEffect_000t28',
  dbf: 132553,
  name: { ru: 'Боевые шрамы', en: 'Battle Scars' },
  text: { ru: 'Русский текст', en: 'English rules text' },
};
const upgradedGift = {
  ...baseGift,
  card_id: 'BG36_MidGameEffect_000t28t',
  dbf: 133476,
};

assert.notEqual(
  distinctCatalogIdentity('dark_gift', baseGift),
  distinctCatalogIdentity('dark_gift', upgradedGift),
  'Dark Gifts with the same name must remain separate Blizzard catalog records',
);
assert.equal(distinctCatalogIdentity('minion', baseGift), null, 'other card families retain their existing dedupe rules');

const terms = libraryCardSearchTerms(baseGift, baseGift.name.ru).map(value => value.toLowerCase());
assert.ok(terms.includes('battle scars'), 'English card name must be searchable');
assert.ok(terms.includes('english rules text'), 'English card text must be searchable');
assert.equal(visibleEnglishLibraryName(baseGift, baseGift.name.ru), 'Battle Scars');
assert.equal(
  visibleEnglishLibraryName({ ...baseGift, name: { ru: 'Same name', en: 'Same name' } }, 'Same name'),
  null,
  'duplicate localized labels should not be rendered twice',
);

console.log('BG library catalog model assertions passed');
