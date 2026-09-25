import assert from 'node:assert/strict';
import { cosmeticsCatalogRequest, cosmeticsDetailPath, cosmeticsListing } from '../src/modules/cosmetics/public';

for (const [path, kind, heading] of [
  ['/cosmetics', 'heroes', 'Скины героев'],
  ['/cosmetics/heroes', 'heroes', 'Скины героев'],
  ['/cosmetics/coins', 'coins', 'Косметические монеты'],
  ['/cosmetics/pets', 'pets', 'Питомцы'],
] as const) {
  const listing = cosmeticsListing(path);
  assert.equal(listing?.kind, kind);
  assert.equal(listing?.pathname, `${path}/`);
  assert.equal(listing?.heading, heading);
}

assert.equal(cosmeticsListing('/cosmetics/unknown'), null);
assert.equal(cosmeticsListing('/cosmetics/heroes/unexpected'), null);
assert.equal(cosmeticsDetailPath('heroes', 'HERO_QA_001'), '/cosmetics/heroes/HERO_QA_001/');
assert.equal(cosmeticsDetailPath('coins', 'COIN_QA_001'), '/cosmetics/coins/COIN_QA_001/');
assert.equal(cosmeticsDetailPath('pets', 'PET_QA_001'), '/cosmetics/pets/PET_QA_001/');
assert.equal(cosmeticsDetailPath('unknown', 'HERO_QA_001'), null);
assert.equal(cosmeticsDetailPath('heroes', 'bad%2Fid'), null);
assert.equal(cosmeticsDetailPath('heroes', 'x'.repeat(101)), null);
assert.deepEqual(cosmeticsCatalogRequest('heroes', 'маг', {
  classSlug: 'mage', rarity: 'full', category: 'event',
}, 2), {
  query: 'search=%D0%BC%D0%B0%D0%B3&class=mage&rarity=full&category=event&page=2',
  url: '/api/cosmetics/heroes?search=%D0%BC%D0%B0%D0%B3&class=mage&rarity=full&category=event&page=2',
});
assert.deepEqual(cosmeticsCatalogRequest('coins', 'ignored', {
  classSlug: 'mage', rarity: 'full', category: 'event',
}, 1), { query: '', url: '/api/cosmetics/coins' });

console.log('Next cosmetics listing contracts passed');
