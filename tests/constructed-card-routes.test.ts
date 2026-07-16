import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  completeConstructedCatalog,
  constructedDecksContainingCard,
  constructedCardCoverage,
  constructedCardFacetCounts,
  createConstructedCardRouter,
  enrichConstructedCardPatches,
  enrichConstructedCardPools,
  enrichConstructedRelatedCards,
  mergeConstructedCardRows,
  queryConstructedCards,
  translateConstructedArchetype,
  validateConstructedCardStatsDataset,
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
assert.equal(
  mergeConstructedCardRows(catalogCards, [{ id: 'CARD_1', dbfId: 1, deck_popularity: '137%', deck_winrate: '54%' }])[0].stats.deckPopularity,
  null,
  'out-of-range percentages must never reach the card UI',
);
assert.doesNotThrow(() => validateConstructedCardStatsDataset([
  { id: 'CARD_1', deck_popularity: '23.28%' },
  { id: 'CARD_2', deck_popularity: '12.5%' },
]));
assert.throws(
  () => validateConstructedCardStatsDataset(Array.from({ length: 10 }, (_, index) => ({ id: `BAD_${index}`, deck_popularity: `${97 + index / 10}%` }))),
  /implausible popularity values/,
  'a systemic 97–100% popularity cascade must be rejected as a malformed snapshot',
);
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

const detailWithRelated = enrichConstructedRelatedCards({
  wiki: { related_cards: [{}, { card_id: 'CARD_1' }, { card_id: 'CARD_1' }, { name: 'Внешняя карта', url: 'https://example.test/card' }] },
}, catalogCards);
assert.equal(detailWithRelated.wiki.related_cards.length, 2, 'empty and duplicate related-card placeholders must be removed');
assert.equal(detailWithRelated.wiki.related_cards[0].name.ru, 'Альфа');
assert.equal(detailWithRelated.wiki.related_cards[0].image_url, 'alpha.png');
assert.equal(detailWithRelated.wiki.related_cards[1].name.en, 'Внешняя карта');

const decodedDecks = constructedDecksContainingCard([{
  id: 754,
  source_id: 'vicious_syndicate_radars',
  title: 'No Hand Hunter',
  archetype: 'Face Hunter',
  class: 'Hunter',
  format: 'Standard',
  deck_code: 'AAECAR8EmacHmqcHm6cHxbEHDamfBKqfBKj9Bq+SB4WVB86bB+6fB5CnB5inB7TAB7nAB7vAB97EBwAA',
  updated_at: '2026-07-16T12:26:18.643563+00:00',
}], { dbf: 119705 }, 'standard');
assert.equal(decodedDecks.length, 1, 'a card must be matched through its decoded deckstring DBF id');
assert.equal(decodedDecks[0].id, '754');
assert.equal(decodedDecks[0].archetype, 'Face Hunter');
assert.equal(translateConstructedArchetype('Even Warlock', { 'even warlock': 'Чётный Чернокнижник' }), 'Чётный Чернокнижник');
assert.equal(translateConstructedArchetype('XL Even Warlock', { 'even warlock': 'Чётный Чернокнижник' }), 'Чётный Чернокнижник');
assert.equal(translateConstructedArchetype('Pain Warlock', {}), 'Пейнлок');
assert.equal(translateConstructedArchetype('Renathal Big Warlock', {}), 'Ренатал Биг Чернокнижник');
assert.equal(constructedDecksContainingCard([{ ...decodedDecks[0], deck_code: decodedDecks[0].deckCode, format: 'Wild' }], { dbf: 119705 }, 'standard').length, 0);

const detailWithPatches = enrichConstructedCardPatches({
  wiki: {
    patch_changes: [{
      heading: 'Card changes',
      entries: [
        { date: '2024-09-10', patch: 'Patch 30.4.0.206605', items: ['Changed.'] },
        { date: '2019-08-01', patch: 'Patch 15.0.0.32708', items: ['Added.'] },
      ],
    }],
  },
}, [{
  version: '30.4.0.206605',
  title: 'Обновление 30.4 уже в игре',
  source_url: 'https://hs-manacost.ru/obnovlenie-30-4/',
  published_at: '2024-09-10T20:00:09',
  summary: 'Русское описание обновления.',
}]);
assert.equal(detailWithPatches.wiki.patch_changes[0].entries[0].manacost_title, 'Обновление 30.4 уже в игре');
assert.equal(detailWithPatches.wiki.patch_changes[0].entries[0].manacost_url, 'https://hs-manacost.ru/obnovlenie-30-4/');
assert.equal(detailWithPatches.wiki.patch_changes[0].entries[0].manacost_summary, 'Русское описание обновления.');
assert.equal(detailWithPatches.wiki.patch_changes[0].entries[1].manacost_title, undefined);

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
    return card ? { ...card, wiki: { patch_changes: [] }, decks: cardId === 'CARD_1' ? decodedDecks : [] } : null;
  },
  createDeckPreview: async deck => ({ hash: `preview-${deck.id}`, state: 'done', ready: true, imageUrl: 'https://api.blizzcore.ru/static/generated/test.jpg', error: null }),
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

  const preview = await fetch(`${origin}/CARD_1/decks/754/preview?format=standard`, { method: 'POST', headers: adminHeaders });
  assert.equal(preview.status, 200);
  assert.equal((await preview.json() as any).preview.imageUrl, 'https://api.blizzcore.ru/static/generated/test.jpg');
  const unknownPreview = await fetch(`${origin}/CARD_1/decks/999/preview?format=standard`, { method: 'POST', headers: adminHeaders });
  assert.equal(unknownPreview.status, 404, 'the preview route must only render a deck re-resolved for the card');

  const invalidCard = await fetch(`${origin}/!?format=standard`, { headers: adminHeaders });
  assert.equal(invalidCard.status, 400);
  const missing = await fetch(`${origin}/UNKNOWN?format=standard`, { headers: adminHeaders });
  assert.equal(missing.status, 404);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('constructed cards admin router contract tests passed');
