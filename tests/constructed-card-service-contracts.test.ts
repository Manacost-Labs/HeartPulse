import assert from 'node:assert/strict';
import {
  ConstructedCardCatalogUnavailableError,
  ConstructedCardDetailUnavailableError,
  ConstructedCardHistoryStore,
  ConstructedCardUpstreamError,
  type ConstructedCardCatalogHealth,
  type ConstructedCardCollection,
  type ConstructedCardDataService,
  type ConstructedCardDeck,
  type ConstructedCardDetailResult,
  type ConstructedCardFormat,
  type ConstructedCardHistoryPoint,
  type ConstructedCardPeriod,
  type ConstructedCardPeriodDescriptor,
  type ConstructedCardRank,
  type ConstructedCardRankDescriptor,
} from '../server/modules/constructedCards/public.js';
import { ConstructedCardHistoryStore as LegacyConstructedCardHistoryStore } from '../server/constructedCardHistoryStore.js';

const format: ConstructedCardFormat = 'standard';
const period: ConstructedCardPeriod = '7d';
const rank: ConstructedCardRank = 'legend';

const periodDescriptor: ConstructedCardPeriodDescriptor = {
  id: period,
  label: 'Последние 7 дней',
  timeRange: 'LAST_7_DAYS',
  patch: null,
};
const rankDescriptor: ConstructedCardRankDescriptor = {
  id: rank,
  label: 'Легенда',
  rankRange: 'LEGEND',
};
const historyPoint: ConstructedCardHistoryPoint = {
  recordedAt: '2026-08-18T00:00:00.000Z',
  deckPopularity: 10.5,
  deckWinrate: 53.2,
  averageCopies: 1.4,
  timesPlayed: 120,
  winrateWhenPlayed: 55.1,
  winrateWhenDrawn: 52.8,
  keepPercentage: 40.2,
  openingHandWinrate: 51.7,
  averageTurnsInHand: 2.1,
  averageTurnPlayed: 4.3,
};
const collection: ConstructedCardCollection = {
  cards: [{ card_id: 'CARD_1' }],
  updatedAt: '2026-08-18T00:00:00.000Z',
  sourceUrl: 'https://example.test/catalog.json',
  cacheSource: 'fresh',
  dataStatus: 'fresh',
  partial: false,
  datasetVersion: 'catalog-v1',
  catalogVerifiedAt: '2026-08-18T00:00:00.000Z',
  catalogPublishedAt: '2026-08-18T00:00:00.000Z',
  period: periodDescriptor,
  rank: rankDescriptor,
};
const detail: ConstructedCardDetailResult = {
  card: collection.cards[0],
  cacheSource: 'fresh',
  dataStatus: 'fresh',
  partial: false,
  warning: null,
  datasetVersion: collection.datasetVersion,
  period: periodDescriptor,
  rank: rankDescriptor,
};
const health: ConstructedCardCatalogHealth = {
  format,
  state: 'fresh',
  dataStatus: 'fresh',
  cacheSource: 'fresh',
  verifiedAt: collection.catalogVerifiedAt,
  publishedAt: collection.catalogPublishedAt,
  records: collection.cards.length,
  datasetVersion: collection.datasetVersion,
  warning: null,
};
const deck: ConstructedCardDeck = {
  id: 'deck-1',
  title: 'Contract deck',
  archetype: null,
  archetypeLabel: 'Другая колода',
  className: 'MAGE',
  deckCode: 'AAECAf0EAA==',
  source: null,
  sourceUrl: null,
  winrate: null,
  score: null,
  updatedAt: null,
};

const service = {
  loadCards: async (
    _format: ConstructedCardFormat,
    _period?: ConstructedCardPeriod,
    _rank?: ConstructedCardRank,
  ) => collection,
  loadCardDetail: async (
    _format: ConstructedCardFormat,
    _cardId: string,
    _period?: ConstructedCardPeriod,
    _statsFormat?: ConstructedCardFormat,
    _rank?: ConstructedCardRank,
  ) => detail,
  loadCardHistory: async (
    _format: ConstructedCardFormat,
    _cardId: string,
    _period?: ConstructedCardPeriod,
    _rank?: ConstructedCardRank,
    _days?: number,
  ) => [historyPoint],
  getCatalogHealth: (_format: ConstructedCardFormat) => health,
} satisfies ConstructedCardDataService;

// @ts-expect-error Constructed-card contracts reject unsupported formats.
const unsupportedFormat: ConstructedCardFormat = 'classic';
// @ts-expect-error Constructed-card contracts reject unsupported periods.
const unsupportedPeriod: ConstructedCardPeriod = '30d';
// @ts-expect-error Constructed-card contracts reject unsupported rank slices.
const unsupportedRank: ConstructedCardRank = 'bronze';

assert.equal(typeof ConstructedCardHistoryStore, 'function');
assert.equal(LegacyConstructedCardHistoryStore, ConstructedCardHistoryStore);
assert.equal((await service.loadCards(format, period, rank)).cards[0]?.card_id, 'CARD_1');
assert.equal((await service.loadCardDetail(format, 'CARD_1'))?.card.card_id, 'CARD_1');
assert.deepEqual(await service.loadCardHistory(format, 'CARD_1'), [historyPoint]);
assert.equal(service.getCatalogHealth(format), health);
assert.equal(deck.id, 'deck-1');

const upstream = new ConstructedCardUpstreamError('upstream failed', 503);
assert.equal(upstream.name, 'ConstructedCardUpstreamError');
assert.equal(upstream.status, 503);
assert.equal(new ConstructedCardUpstreamError('invalid status', 503.5).status, null);

const catalogUnavailable = new ConstructedCardCatalogUnavailableError();
assert.equal(catalogUnavailable.name, 'ConstructedCardCatalogUnavailableError');
assert.equal(catalogUnavailable.retryAfterSeconds, 60);

const detailUnavailable = new ConstructedCardDetailUnavailableError();
assert.equal(detailUnavailable.name, 'ConstructedCardDetailUnavailableError');
assert.equal(detailUnavailable.retryAfterSeconds, 60);

void unsupportedFormat;
void unsupportedPeriod;
void unsupportedRank;

console.log('constructed-card service and history contracts passed');
