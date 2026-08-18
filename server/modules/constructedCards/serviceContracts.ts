type JsonRecord = Record<string, any>;

export type ConstructedCardFormat = 'standard' | 'wild';
export type ConstructedCardPeriod = '1d' | '3d' | '7d' | '14d' | 'patch';
export type ConstructedCardRank = 'legend' | 'diamond_4_1' | 'diamond' | 'platinum';

export type ConstructedCardPeriodDescriptor = {
  id: ConstructedCardPeriod;
  label: string;
  timeRange: string | null;
  patch: string | null;
};

export type ConstructedCardRankDescriptor = {
  id: ConstructedCardRank;
  label: string;
  rankRange: string;
};

export type ConstructedCardHistoryPoint = {
  recordedAt: string;
  deckPopularity: number | null;
  deckWinrate: number | null;
  averageCopies: number | null;
  timesPlayed: number | null;
  winrateWhenPlayed: number | null;
  winrateWhenDrawn: number | null;
  keepPercentage: number | null;
  openingHandWinrate: number | null;
  averageTurnsInHand: number | null;
  averageTurnPlayed: number | null;
};

export type ConstructedCardCollection = {
  cards: JsonRecord[];
  updatedAt: string | null;
  sourceUrl: string;
  warning?: string | null;
  cacheSource: 'fresh' | 'LKG';
  dataStatus: 'fresh' | 'stale';
  partial: false;
  datasetVersion: string;
  catalogVerifiedAt: string;
  catalogPublishedAt: string;
  period?: ConstructedCardPeriodDescriptor;
  rank?: ConstructedCardRankDescriptor;
};

export type ConstructedCardDetailResult = {
  card: JsonRecord;
  cacheSource: 'fresh' | 'LKG';
  dataStatus: 'fresh' | 'stale';
  partial: boolean;
  warning: string | null;
  datasetVersion: string;
  period?: ConstructedCardPeriodDescriptor;
  rank?: ConstructedCardRankDescriptor;
};

export type ConstructedCardCatalogHealth = {
  format: ConstructedCardFormat;
  state: 'fresh' | 'stale' | 'expired' | 'missing';
  dataStatus: 'fresh' | 'stale' | 'unavailable';
  cacheSource: 'fresh' | 'LKG' | null;
  verifiedAt: string | null;
  publishedAt: string | null;
  records: number;
  datasetVersion: string | null;
  warning: string | null;
};

export type ConstructedCardDataService = {
  loadCards: (
    format: ConstructedCardFormat,
    period?: ConstructedCardPeriod,
    rank?: ConstructedCardRank,
  ) => Promise<ConstructedCardCollection>;
  loadCardDetail: (
    format: ConstructedCardFormat,
    cardId: string,
    period?: ConstructedCardPeriod,
    statsFormat?: ConstructedCardFormat,
    rank?: ConstructedCardRank,
  ) => Promise<ConstructedCardDetailResult | null>;
  loadCardHistory: (
    format: ConstructedCardFormat,
    cardId: string,
    period?: ConstructedCardPeriod,
    rank?: ConstructedCardRank,
    days?: number,
  ) => Promise<ConstructedCardHistoryPoint[]>;
  getCatalogHealth: (format: ConstructedCardFormat) => ConstructedCardCatalogHealth;
  invalidate?: () => void;
};

export type ConstructedCardDeck = {
  id: string;
  title: string;
  archetype: string | null;
  archetypeLabel: string;
  className: string | null;
  deckCode: string;
  source: string | null;
  sourceUrl: string | null;
  winrate: number | null;
  score: string | null;
  updatedAt: string | null;
};

export class ConstructedCardUpstreamError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConstructedCardUpstreamError';
    this.status = Number.isInteger(status) ? status : null;
  }
}

export class ConstructedCardCatalogUnavailableError extends Error {
  readonly retryAfterSeconds = 60;

  constructor(message = 'Constructed card catalog is unavailable', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConstructedCardCatalogUnavailableError';
  }
}

export class ConstructedCardDetailUnavailableError extends Error {
  readonly retryAfterSeconds = 60;

  constructor(message = 'Constructed card detail could not be authoritatively resolved', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConstructedCardDetailUnavailableError';
  }
}
