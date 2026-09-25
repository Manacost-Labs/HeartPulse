import assert from 'node:assert/strict';
import { cosmeticsCatalogRequest, cosmeticsListing } from '../src/modules/cosmetics/public';

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
