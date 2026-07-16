import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  completeConstructedCatalog,
  constructedCardCoverage,
  constructedCardFacetCounts,
  createConstructedCardRouter,
  enrichConstructedCardPools,
  mergeConstructedCardRows,
  queryConstructedCards,
  type ConstructedCardRouterDependencies,
} from '../server/constructedCardRoutes.js';

const catalogCards = [
  {
    card_id: 'CARD_1', dbf: 1, name: { ru: 'Альфа', en: 'Alpha' }, card_set: 'SET_A',
    card_type: { slug: 'MINION', name_ru: 'Существо' }, class: 'MAGE', multi_class: [], rarity: 'COMMON',
    mana_cost: 2, attack: 3, health: 4, mechanics: ['BATTLECRY'], referenced_tags: [], images: { card: 'alpha.png' },
  },
  {
    card_id: 'CARD_2', dbf: 2, name: { ru: 'Бета', en: 'Beta' }, card_set: 'SET_B',
    card_type: { slug: 'SPELL', name_ru: 'Заклинание' }, class: 'WARRIOR', multi_class: [5], rarity: 'RARE',
    mana_cost: 5, attack: null, health: null, mechanics: [], referenced_tags: [5, 'TAUNT'], images: { card: 'beta.png' },
  },
];
const mergedCards = mergeConstructedCardRows(catalogCards, [{
  id: 'CARD_1', dbfId: 1, deck_popularity: '12.5%', deck_winrate: '54.3%', times_played: 240,
  winrate_when_played: '57.2%', winrate_when_drawn: '55.1%', keep_percentage: '43.2%', opening_hand_winrate: '52.4%',
}]);

assert.equal(mergedCards[0].stats.deckPopularity, 12.5);
assert.equal(mergedCards[0].stats.deckWinrate, 54.3);
assert.equal(mergedCards[1].stats, null, 'catalog cards without Legend statistics must remain in the library');
const pendingCatalogCard = mergeConstructedCardRows(catalogCards, [{
  id: 'CARD_3', dbfId: 3, name: 'Гамма', type: 'SPELL', rarity: 'EPIC', cardClass: 'PRIEST', cost: 3,
  deck_popularity: '1.2%', times_played: 42,
}]).find(card => card.card_id === 'CARD_3');
assert.equal(pendingCatalogCard?.catalogPending, true, 'a fresh HSReplay card must survive catalog synchronization lag');
assert.equal(pendingCatalogCard?.stats.deckPopularity, 1.2);
assert.equal(
  mergeConstructedCardRows(catalogCards, [
    { id: 'CARD_1', dbfId: 1, deck_popularity: '2%' },
    { id: 'CARD_1', dbfId: 1, deck_popularity: '3%' },
  ]).length,
  2,
  'duplicate statistics rows must not create duplicate catalog cards',
);
assert.deepEqual(queryConstructedCards(mergedCards, { class: 'mage', mechanic: 'battlecry' }).map(card => card.card_id), ['CARD_1']);
assert.deepEqual(queryConstructedCards(mergedCards, { sort: 'mana', direction: 'desc' }).map(card => card.card_id), ['CARD_2', 'CARD_1']);
assert.deepEqual(constructedCardCoverage(mergedCards), { totalCards: 2, cardsWithStats: 1, cardsWithoutStats: 1, totalSets: 2 });
assert.deepEqual(constructedCardFacetCounts(mergedCards).sets, [{ value: 'SET_A', count: 1 }, { value: 'SET_B', count: 1 }]);
assert.deepEqual(constructedCardFacetCounts(mergedCards).classes, [{ value: 'MAGE', count: 1 }, { value: 'WARRIOR', count: 1 }]);
assert.deepEqual(constructedCardFacetCounts(mergedCards).mechanics, [{ value: 'BATTLECRY', count: 1 }, { value: 'TAUNT', count: 1 }]);
assert.equal(completeConstructedCatalog([{ data: catalogCards, pagination: { total: 2 } }]).length, 2);
assert.throws(
  () => completeConstructedCatalog([{ data: catalogCards.slice(0, 1), pagination: { total: 2 } }]),
  /received 1 of 2 cards/,
);
const detailWithPools = enrichConstructedCardPools({
  card_id: 'FIR_959',
  wiki: {
    generated_card_pools: [{
      pool: 'Fire spells',
      card_ids: ['CARD_1', 'TOKEN_1'],
      cards: [
        { card_id: 'CARD_1', title: 'Alpha', image_url: 'wiki-alpha.png' },
        { card_id: 'TOKEN_1', title: 'Generated token', image_url: 'token.png', url: 'https://example.test/token' },
      ],
    }],
  },
}, catalogCards);
assert.equal(detailWithPools.wiki.generated_card_pools[0].cards[0].name.ru, 'Альфа');
assert.equal(detailWithPools.wiki.generated_card_pools[0].cards[0].image_url, 'alpha.png');
assert.equal(detailWithPools.wiki.generated_card_pools[0].cards[0].can_open, true);
assert.equal(detailWithPools.wiki.generated_card_pools[0].cards[1].name.en, 'Generated token');
assert.equal(detailWithPools.wiki.generated_card_pools[0].cards[1].can_open, false);

const calls: string[] = [];
const adminGuard: RequestHandler = (request, response, next) => {
  if (request.headers['x-test-admin'] !== 'yes') return response.status(403).json({ error: 'admin only' });
  next();
};
const dependencies: ConstructedCardRouterDependencies = {
  adminGuard,
  loadCards: async format => {
    calls.push(`list:${format}`);
    return { cards: mergedCards, updatedAt: '2026-07-16T05:03:02.000Z', sourceUrl: 'https://hsreplay.net/cards/' };
  },
  loadCardDetail: async (format, cardId) => {
    calls.push(`detail:${format}:${cardId}`);
    const card = mergedCards.find(item => item.card_id === cardId);
    return card ? { ...card, wiki: { patch_changes: [] } } : null;
  },
  setPrivateNoStore: response => {
    response.set('Cache-Control', 'no-store');
    response.vary('Cookie');
  },
  getMechanicTranslations: () => ({ BATTLECRY: 'Боевой клич' }),
};

const app = express();
app.use('/api', createConstructedCardRouter(dependencies));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}/api/admin/constructed-cards`;
const adminHeaders = { 'X-Test-Admin': 'yes' };

try {
  const denied = await fetch(origin);
  assert.equal(denied.status, 403);
  assert.deepEqual(calls, []);

  const invalidFormat = await fetch(`${origin}?format=classic`, { headers: adminHeaders });
  assert.equal(invalidFormat.status, 400);
  assert.equal(invalidFormat.headers.get('cache-control'), 'no-store');

  const list = await fetch(`${origin}?format=standard&class=MAGE&perPage=20`, { headers: adminHeaders });
  assert.equal(list.status, 200);
  const listPayload = await list.json() as any;
  assert.equal(listPayload.rank, 'legend');
  assert.equal(listPayload.cards.length, 1);
  assert.equal(listPayload.cards[0].card_id, 'CARD_1');
  assert.equal(listPayload.pagination.total, 1);
  assert.ok(listPayload.facets.classes.includes('WARRIOR'));
  assert.equal(listPayload.coverage.totalCards, 2);
  assert.deepEqual(listPayload.mechanicTranslations, { BATTLECRY: 'Боевой клич' });
  assert.deepEqual(listPayload.facetCounts.sets, [{ value: 'SET_A', count: 1 }, { value: 'SET_B', count: 1 }]);

  const detail = await fetch(`${origin}/CARD_1?format=wild`, { headers: adminHeaders });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json() as any).card.name.ru, 'Альфа');

  const invalidCard = await fetch(`${origin}/!?format=standard`, { headers: adminHeaders });
  assert.equal(invalidCard.status, 400);
  const missing = await fetch(`${origin}/UNKNOWN?format=standard`, { headers: adminHeaders });
  assert.equal(missing.status, 404);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('constructed cards admin router contract tests passed');
