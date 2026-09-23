import assert from 'node:assert/strict';
import { catalogLocation, catalogLocationUrl } from '../src/modules/constructedCards/model/catalogLocation';
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

const location = catalogLocation('wild', '?query=Зиллиакс&class=MAGE&set=CORE&mana=10&attack=3&health=5&mechanic=Battlecry&type=MINION&rarity=LEGENDARY&sort=mana&direction=desc&page=3&perPage=120&view=table&period=7d&rank=diamond');
assert.equal(location.format, 'wild');
assert.equal(location.page, 3);
assert.equal(location.perPage, 120);
assert.equal(location.view, 'table');
assert.equal(location.filters.query, 'Зиллиакс');
assert.equal(location.filters.class, 'MAGE');
const sharedUrl = new URL(catalogLocationUrl('/standard/cards/wild/', location, '?utm_source=guide&format=standard'), 'https://hearthpulse.net');
assert.deepEqual(catalogLocation('wild', sharedUrl.search), location, 'every catalog control survives sharing and reload');
assert.equal(sharedUrl.searchParams.get('utm_source'), 'guide');
assert.equal(sharedUrl.searchParams.has('format'), false, 'format belongs to the path');
const invalid = catalogLocation('standard', '?page=Infinity&perPage=99999&view=bad&sort=bad&direction=bad&period=bad&rank=bad');
assert.equal(invalid.page, 1);
assert.equal(invalid.perPage, 60);
assert.equal(invalid.view, 'gallery');
assert.equal(invalid.filters.sort, 'set');
assert.equal(invalid.filters.direction, 'asc');
assert.equal(invalid.period, '1d');
assert.equal(invalid.rank, 'legend');
assert.equal(catalogLocation('standard', '?page=-2').page, 1);
assert.equal(catalogLocation('standard', '?page=2.5').page, 1);
assert.equal(catalogLocation('standard', `?query=${'a'.repeat(500)}`).filters.query.length, 120);
const resetUrl = new URL(catalogLocationUrl('/standard/cards/', catalogLocation('standard', ''), sharedUrl.search), 'https://hearthpulse.net');
for (const key of ['query', 'class', 'set', 'page', 'perPage', 'view', 'period', 'rank', 'sort']) assert.equal(resetUrl.searchParams.has(key), false, `reset removes ${key}`);
