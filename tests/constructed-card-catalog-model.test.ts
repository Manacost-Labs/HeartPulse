import assert from 'node:assert/strict';
import {
  adjacentConstructedCardCatalogContexts,
  constructedCardCatalogUrl,
  EMPTY_CONSTRUCTED_CARD_FILTERS,
} from '../src/features/constructedCardCatalogModel';

const catalogUrl = constructedCardCatalogUrl({
  format: 'standard',
  period: '3d',
  rank: 'diamond_4_1',
  page: 2,
  perPage: 60,
  filters: {
    ...EMPTY_CONSTRUCTED_CARD_FILTERS,
    query: 'старое значение',
    class: 'MAGE',
    mechanic: 'Battlecry',
    sort: 'winrate',
    direction: 'desc',
  },
  query: '  Зиллиакс  ',
});
const catalogParams = new URL(catalogUrl, 'https://arena.hs-manacost.ru').searchParams;

assert.equal(catalogParams.get('format'), 'standard');
assert.equal(catalogParams.get('period'), '3d');
assert.equal(catalogParams.get('rank'), 'diamond_4_1');
assert.equal(catalogParams.get('page'), '2');
assert.equal(catalogParams.get('perPage'), '60');
assert.equal(catalogParams.get('sort'), 'winrate');
assert.equal(catalogParams.get('direction'), 'desc');
assert.equal(catalogParams.get('query'), 'Зиллиакс');
assert.equal(catalogParams.get('class'), 'MAGE');
assert.equal(catalogParams.get('mechanic'), 'Battlecry');
assert.equal(catalogParams.has('set'), false, 'empty filters must stay out of the request');

const commonContexts = adjacentConstructedCardCatalogContexts({
  format: 'standard',
  period: '1d',
  rank: 'legend',
});
assert.deepEqual(commonContexts, [
  { format: 'standard', period: '3d', rank: 'legend' },
  { format: 'standard', period: '1d', rank: 'diamond_4_1' },
  { format: 'wild', period: '1d', rank: 'legend' },
]);
assert.ok(commonContexts.length <= 3, 'background warming must remain bounded');

const boundaryContexts = adjacentConstructedCardCatalogContexts({
  format: 'wild',
  period: 'patch',
  rank: 'platinum',
});
assert.deepEqual(boundaryContexts, [
  { format: 'wild', period: '14d', rank: 'platinum' },
  { format: 'wild', period: 'patch', rank: 'diamond' },
  { format: 'standard', period: 'patch', rank: 'platinum' },
]);

console.log('constructed-card catalog model contracts passed');
