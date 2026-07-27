import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  completeConstructedCatalog,
  constructedDecksContainingCard,
  constructedCardCoverage,
  constructedCardFacets,
  constructedCardFacetCounts,
  createConstructedCardDataService,
  createConstructedCardRouter,
  enrichConstructedCardPatches,
  enrichConstructedCardPools,
  enrichConstructedRelatedCards,
  mergeConstructedCardRows,
  MIN_RELIABLE_CONSTRUCTED_CARD_GAMES,
  queryConstructedCards,
  translateConstructedArchetype,
  validateConstructedCardStatsDataset,
  redactConstructedCardStatistics,
  type ConstructedCardRouterDependencies,
} from '../server/constructedCardRoutes.js';

const catalogCards = [
  {
    card_id: 'CARD_1', dbf: 1, name: { ru: 'Альфа', en: 'Alpha' }, card_set: 'SET_A',
    card_type: { slug: 'MINION', name_ru: 'Существо' }, class: 'MAGE', multi_class: [], rarity: 'COMMON',
    mana_cost: 2, attack: 3, health: 4, minion_type: 'BEAST', spell_school: null,
    mechanics: ['BATTLECRY'], referenced_tags: [], images: { card: 'alpha.png' },
  },
  {
    card_id: 'CARD_2', dbf: 2, name: { ru: 'Бета', en: 'Beta' }, card_set: 'SET_B',
    card_type: { slug: 'SPELL', name_ru: 'Заклинание' }, class: 'WARRIOR', multi_class: [5], rarity: 'RARE',
    mana_cost: 5, attack: null, health: null, minion_type: null, spell_school: 'FIRE',
    mechanics: [], referenced_tags: [5, 'TAUNT'], images: { card: 'beta.png' },
  },
];
const mergedCards = mergeConstructedCardRows(catalogCards, [{
  id: 'CARD_1', dbfId: 1, deck_popularity: '12.5%', deck_winrate: '54.3%', times_played: 240,
  winrate_when_played: '57.2%', winrate_when_drawn: '55.1%', keep_percentage: '43.2%', opening_hand_winrate: '52.4%',
}]);

assert.equal(mergedCards[0].stats.deckPopularity, 12.5);
assert.equal(mergedCards[0].stats.deckWinrate, 54.3);
const lowSampleCards = mergeConstructedCardRows(catalogCards, [
  {
    id: 'CARD_1', dbfId: 1, deck_popularity: '0.1%', deck_winrate: '100%', times_played: 3,
    winrate_when_played: '100%', winrate_when_drawn: '100%', keep_percentage: '100%', opening_hand_winrate: '100%',
  },
  { id: 'CARD_2', dbfId: 2, deck_popularity: '2%', deck_winrate: '57%', times_played: MIN_RELIABLE_CONSTRUCTED_CARD_GAMES },
]);
assert.equal(lowSampleCards[0].stats.timesPlayed, 3, 'small samples must remain visible as context');
assert.equal(lowSampleCards[0].stats.deckWinrate, null, 'small-sample deck winrates must not be presented as reliable percentages');
assert.equal(lowSampleCards[0].stats.winrateWhenPlayed, null);
assert.equal(lowSampleCards[0].stats.winrateWhenDrawn, null);
assert.equal(lowSampleCards[0].stats.keepPercentage, null);
assert.equal(lowSampleCards[0].stats.openingHandWinrate, null);
assert.deepEqual(
  queryConstructedCards(lowSampleCards, { sort: 'winrate', direction: 'desc' }).map(card => card.card_id),
  ['CARD_2', 'CARD_1'],
  'unreliable 100% rows must sort after cards with a sufficient sample',
);
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
const serviceStateDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-routes-'));
const degradedService = createConstructedCardDataService({
  fetchJson: async url => url.includes('/constructed-cards')
    ? { data: catalogCards, pagination: { page: 1, total: catalogCards.length, total_pages: 1 } }
    : { view: { cards: Array.from({ length: 10 }, (_, index) => ({ id: `BAD_${index}`, deck_popularity: '99%' })) } },
  catalogBaseUrl: 'https://db.example.test/api/v1',
  statsDatasetByFormat: { standard: 'standard-stats', wild: 'wild-stats' },
  statsBaseUrl: 'https://stats.example.test',
  stateDirectory: serviceStateDirectory,
  minimumCatalogCardsByFormat: { standard: 1, wild: 1 },
});
const degradedCollection = await degradedService.loadCards('standard');
assert.equal(degradedCollection.cards.length, catalogCards.length, 'a malformed statistics snapshot must not hide the card catalog');
assert.ok(degradedCollection.cards.every(card => card.stats === null), 'malformed statistics must be removed instead of reaching the UI');
assert.match(degradedCollection.warning || '', /Статистика карт временно недоступна/,
  'public warnings must be actionable Russian copy without upstream exception details');
const periodUrls: string[] = [];
const periodService = createConstructedCardDataService({
  fetchJson: async url => {
    periodUrls.push(url);
    if (url.includes('/constructed-cards')) {
      return { data: catalogCards, pagination: { page: 1, total: catalogCards.length, total_pages: 1 } };
    }
    return {
      fetched_at: '2026-07-27T10:00:00.000Z',
      view: { cards: [], time_range: 'LAST_7_DAYS' },
    };
  },
  catalogBaseUrl: 'https://db.example.test/api/v1',
  statsDatasetByFormat: {
    standard: { '7d': 'standard-legend-7d' },
    wild: { '7d': 'wild-legend-7d' },
  },
  statsBaseUrl: 'https://stats.example.test',
  stateDirectory: serviceStateDirectory,
  minimumCatalogCardsByFormat: { standard: 1, wild: 1 },
});
const sevenDayCollection = await periodService.loadCards('standard', '7d');
assert.ok(periodUrls.includes('https://stats.example.test/standard-legend-7d'));
assert.equal(sevenDayCollection.period?.id, '7d');
assert.equal(sevenDayCollection.period?.timeRange, 'LAST_7_DAYS');
const historyService = createConstructedCardDataService({
  fetchJson: async url => url.includes('/constructed-cards')
    ? { data: catalogCards, pagination: { page: 1, total: catalogCards.length, total_pages: 1 } }
    : {
        fetched_at: '2026-07-27T10:00:00.000Z',
        view: {
          cards: [{
            id: 'CARD_1',
            dbfId: 1,
            deck_popularity: '12.5%',
            deck_winrate: '54.3%',
            times_played: 240,
          }],
          time_range: 'LAST_1_DAY',
        },
      },
  catalogBaseUrl: 'https://db.example.test/api/v1',
  statsDatasetByFormat: { standard: 'standard-legend-1d', wild: 'wild-legend-1d' },
  statsBaseUrl: 'https://stats.example.test',
  stateDirectory: serviceStateDirectory,
  minimumCatalogCardsByFormat: { standard: 1, wild: 1 },
  now: () => Date.parse('2026-07-27T12:00:00.000Z'),
});
await historyService.loadCards('standard', '1d');
assert.deepEqual(
  (await historyService.loadCardHistory('standard', 'CARD_1', '1d', 30)).map(point => point.recordedAt),
  ['2026-07-27T10:00:00.000Z'],
  'a validated upstream refresh must be persisted for the history chart',
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
assert.deepEqual(
  queryConstructedCards([
    catalogCards[0],
    catalogCards[1],
    { ...catalogCards[0], card_id: 'CARD_NEUTRAL', dbf: 3, class: 'NEUTRAL' },
  ], { deckClass: 'mage' }).map(card => card.card_id),
  ['CARD_1', 'CARD_NEUTRAL'],
  'a deck-class catalog must contain selected-class and neutral cards but exclude other classes',
);
assert.deepEqual(queryConstructedCards(mergedCards, { minionType: 'beast' }).map(card => card.card_id), ['CARD_1']);
assert.deepEqual(queryConstructedCards(mergedCards, { spellSchool: 'fire' }).map(card => card.card_id), ['CARD_2']);
assert.deepEqual(
  queryConstructedCards([{ ...catalogCards[0], mana_cost: 10 }, { ...catalogCards[1], mana_cost: 12 }], { mana: '10+' })
    .map(card => card.card_id),
  ['CARD_1', 'CARD_2'],
);
assert.deepEqual(queryConstructedCards(mergedCards, { sort: 'mana', direction: 'desc' }).map(card => card.card_id), ['CARD_2', 'CARD_1']);
assert.deepEqual(
  queryConstructedCards([
    { ...catalogCards[0], card_id: 'NEW', card_set: 'ESCAPEFROM_VIOLET_HOLD' },
    { ...catalogCards[1], card_id: 'OLD', card_set: 'TITANS' },
  ], {}).map(card => card.card_id),
  ['NEW', 'OLD'],
  'the default library order must start with the latest released expansion',
);
assert.equal(redactConstructedCardStatistics({ stats: mergedCards[0].stats, decks: [{ winrate: 55, score: '10-5', deckCode: 'AAE' }] }).stats, null);
assert.deepEqual(constructedCardCoverage(mergedCards), { totalCards: 2, cardsWithStats: 1, cardsWithoutStats: 1, totalSets: 2 });
assert.deepEqual(constructedCardFacetCounts(mergedCards).sets, [{ value: 'SET_A', count: 1 }, { value: 'SET_B', count: 1 }]);
assert.deepEqual(constructedCardFacetCounts(mergedCards).classes, [{ value: 'MAGE', count: 1 }, { value: 'WARRIOR', count: 1 }]);
assert.deepEqual(constructedCardFacetCounts(mergedCards).mechanics, [{ value: 'BATTLECRY', count: 1 }, { value: 'TAUNT', count: 1 }]);
assert.deepEqual(constructedCardFacetCounts(mergedCards).minionTypes, [{ value: 'BEAST', count: 1 }]);
assert.deepEqual(constructedCardFacetCounts(mergedCards).spellSchools, [{ value: 'FIRE', count: 1 }]);
assert.deepEqual(constructedCardFacets(mergedCards).minionTypes, ['BEAST']);
assert.deepEqual(constructedCardFacets(mergedCards).spellSchools, ['FIRE']);
assert.deepEqual(
  constructedCardFacetCounts([{ ...catalogCards[0], mechanics: ['BATTLECRY', 'TRIGGER_VISUAL', 'ImmuneToSpellpower'] }]).mechanics,
  [{ value: 'BATTLECRY', count: 1 }],
  'internal engine and VFX tags must not appear as public mechanics filters',
);
assert.equal(completeConstructedCatalog([{ data: catalogCards, pagination: { page: 1, total: 2, total_pages: 1 } }]).length, 2);
assert.throws(
  () => completeConstructedCatalog([{ data: catalogCards.slice(0, 1), pagination: { page: 1, total: 2, total_pages: 1 } }]),
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
  canAccessStats: request => request.headers['x-test-stats'] === 'yes' || request.headers['x-test-admin'] === 'yes',
  loadCards: async (format, period) => {
    calls.push(`list:${format}:${period}`);
    return {
      cards: mergedCards,
      updatedAt: '2026-07-16T05:03:02.000Z',
      sourceUrl: 'https://hsreplay.net/cards/',
      cacheSource: 'fresh',
      dataStatus: 'fresh',
      partial: false,
      datasetVersion: `ccc1-sha256:${'1'.repeat(64)}`,
      catalogVerifiedAt: '2026-07-16T05:03:02.000Z',
      catalogPublishedAt: '2026-07-16T05:03:02.000Z',
      period: {
        id: period ?? '1d',
        label: period === '7d' ? 'Последние 7 дней' : period === 'patch' ? 'Патч 36.0.3' : 'Последний день',
        timeRange: period === 'patch' ? null : 'LAST_1_DAY',
        patch: period === 'patch' ? '36.0.3' : null,
      },
    };
  },
  loadCardDetail: async (format, cardId, period) => {
    calls.push(`detail:${format}:${cardId}:${period}`);
    const card = mergedCards.find(item => item.card_id === cardId);
    return card ? {
      card: { ...card, wiki: { patch_changes: [] }, decks: cardId === 'CARD_1' ? decodedDecks : [] },
      cacheSource: 'fresh',
      dataStatus: 'fresh',
      partial: false,
      warning: null,
      datasetVersion: `ccc1-sha256:${'1'.repeat(64)}`,
      period: {
        id: period ?? '1d',
        label: period === 'patch' ? 'Патч 36.0.3' : 'Последний день',
        timeRange: period === 'patch' ? null : 'LAST_1_DAY',
        patch: period === 'patch' ? '36.0.3' : null,
      },
    } : null;
  },
  loadCardHistory: async (format, cardId, period, days) => {
    calls.push(`history:${format}:${cardId}:${period}:${days}`);
    return cardId === 'CARD_1' ? [{
      recordedAt: '2026-07-16T05:03:02.000Z',
      deckPopularity: 12.5,
      deckWinrate: 54.3,
      averageCopies: 1.4,
      timesPlayed: 240,
      winrateWhenPlayed: 57.2,
      winrateWhenDrawn: 55.1,
      keepPercentage: 43.2,
      openingHandWinrate: 52.4,
      averageTurnsInHand: 2.8,
      averageTurnPlayed: 4.1,
    }] : [];
  },
  getCatalogHealth: format => ({
    format,
    state: 'fresh',
    dataStatus: 'fresh',
    cacheSource: 'fresh',
    verifiedAt: '2026-07-16T05:03:02.000Z',
    publishedAt: '2026-07-16T05:03:02.000Z',
    records: mergedCards.length,
    datasetVersion: `ccc1-sha256:${'1'.repeat(64)}`,
    warning: null,
  }),
  createDeckPreview: async deck => ({ hash: `preview-${deck.id}`, state: 'done', ready: true, imageUrl: 'https://api.blizzcore.ru/static/generated/test.jpg', error: null }),
  setPrivateNoStore: response => {
    response.set('Cache-Control', 'no-store');
    response.vary('Cookie');
  },
  getMechanicTranslations: () => ({ BATTLECRY: 'Боевой клич' }),
  getMechanicTranslationOverrides: () => ({ BATTLECRY: 'Редакторский боевой клич' }),
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
const publicOrigin = `http://127.0.0.1:${address.port}/api/constructed-cards`;
const adminHeaders = { 'X-Test-Admin': 'yes' };

try {
  const denied = await fetch(origin);
  assert.equal(denied.status, 403);
  assert.deepEqual(calls, []);

  const publicList = await fetch(`${publicOrigin}?format=standard&perPage=20`);
  assert.equal(publicList.status, 200, 'the released card library must be public');
  const publicListPayload = await publicList.json() as any;
  assert.equal(publicListPayload.cards.length, 2);
  assert.equal(publicListPayload.period.id, '1d');
  assert.equal(publicListPayload.period.label, 'Последний день');
  assert.equal(publicListPayload.statsAccess, false);
  assert.equal(publicListPayload.cards[0].stats, null, 'guests must not receive blurred statistics in API JSON');

  const sevenDayList = await fetch(`${publicOrigin}?format=standard&period=7d&perPage=20`);
  assert.equal(sevenDayList.status, 200);
  const sevenDayListPayload = await sevenDayList.json() as any;
  assert.equal(sevenDayListPayload.period.id, '7d');
  assert.equal(sevenDayListPayload.period.label, 'Последние 7 дней');
  assert.ok(calls.includes('list:standard:7d'));

  const invalidPeriod = await fetch(`${publicOrigin}?format=standard&period=month`);
  assert.equal(invalidPeriod.status, 400);
  assert.equal((await invalidPeriod.json() as any).error, 'Неизвестный период статистики');

  const protectedSort = await fetch(`${publicOrigin}?format=standard&perPage=20&sort=popularity&direction=desc`);
  assert.equal((await protectedSort.json() as any).cards[0].card_id, 'CARD_1', 'locked statistical sorting must fall back to release order');

  const entitledList = await fetch(`${publicOrigin}?format=standard&perPage=20&sort=popularity&direction=desc`, { headers: { 'X-Test-Stats': 'yes' } });
  const entitledListPayload = await entitledList.json() as any;
  assert.equal(entitledListPayload.statsAccess, true);
  assert.equal(entitledListPayload.cards[0].stats.deckPopularity, 12.5);

  const publicDetail = await fetch(`${publicOrigin}/CARD_1?format=standard`);
  const publicDetailPayload = await publicDetail.json() as any;
  assert.equal(publicDetailPayload.period.id, '1d');
  assert.equal(publicDetailPayload.statsAccess, false);
  assert.equal(publicDetailPayload.card.stats, null);
  assert.equal(publicDetailPayload.card.decks[0].winrate, null);
  assert.equal(publicDetailPayload.card.decks[0].score, null);
  const publicHistory = await fetch(`${publicOrigin}/CARD_1/history?format=standard&period=7d&days=30`);
  const publicHistoryPayload = await publicHistory.json() as any;
  assert.equal(publicHistoryPayload.statsAccess, false);
  assert.deepEqual(publicHistoryPayload.points, []);
  assert.ok(!calls.some(call => call.startsWith('history:')),
    'locked users must not trigger or receive persisted history reads');

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
  assert.deepEqual(listPayload.mechanicOverrides, { BATTLECRY: 'Редакторский боевой клич' });
  assert.deepEqual(listPayload.facetCounts.sets, [{ value: 'SET_A', count: 1 }, { value: 'SET_B', count: 1 }]);

  const detail = await fetch(`${origin}/CARD_1?format=wild&period=patch`, { headers: adminHeaders });
  assert.equal(detail.status, 200);
  const detailPayload = await detail.json() as any;
  assert.equal(detailPayload.period.id, 'patch');
  assert.ok(calls.includes('detail:wild:CARD_1:patch'));
  assert.equal(detailPayload.card.name.ru, 'Альфа');
  assert.deepEqual(detailPayload.mechanicTranslations, { BATTLECRY: 'Боевой клич' });
  assert.deepEqual(detailPayload.mechanicOverrides, { BATTLECRY: 'Редакторский боевой клич' });

  const history = await fetch(`${origin}/CARD_1/history?format=wild&period=patch&days=30`, { headers: adminHeaders });
  assert.equal(history.status, 200);
  const historyPayload = await history.json() as any;
  assert.equal(historyPayload.statsAccess, true);
  assert.equal(historyPayload.period.id, 'patch');
  assert.equal(historyPayload.days, 30);
  assert.equal(historyPayload.points[0].deckPopularity, 12.5);
  assert.ok(calls.includes('history:wild:CARD_1:patch:30'));

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
  rmSync(serviceStateDirectory, { recursive: true, force: true });
}

console.log('constructed cards public/admin router contract tests passed');
