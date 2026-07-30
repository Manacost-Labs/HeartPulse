export type PublicCardStatisticsFormat = 'standard' | 'wild';
export type PublicCardStatisticsPeriod = '1d' | '3d' | '7d' | '14d' | 'patch';
export type PublicCardStatisticsRank = 'legend' | 'diamond_4_1' | 'diamond' | 'platinum';

type JsonRecord = Record<string, unknown>;

export type PublicCardStatisticsMetrics = {
  deckPopularityPercent: number | null;
  deckWinratePercent: number | null;
  averageCopies: number | null;
  timesPlayed: number | null;
  winrateWhenPlayedPercent: number | null;
  winrateWhenDrawnPercent: number | null;
  keepPercentage: number | null;
  openingHandWinratePercent: number | null;
  averageTurnsInHand: number | null;
  averageTurnPlayed: number | null;
};

export type PublicCardStatisticsItem = {
  cardId: string;
  metrics: PublicCardStatisticsMetrics;
};

export type PublicCardStatisticsHistoryPoint = {
  recordedAt: string;
  metrics: PublicCardStatisticsMetrics;
};

export type PublicCardStatisticsCollection = {
  cards: JsonRecord[];
  updatedAt: string | null;
  datasetVersion: string;
  dataStatus: 'fresh' | 'stale';
  cacheSource: 'fresh' | 'LKG';
  period?: {
    patch?: string | null;
  };
};

export type PublicCardStatisticsSource = {
  loadCards: (
    format: PublicCardStatisticsFormat,
    period: PublicCardStatisticsPeriod,
    rank: PublicCardStatisticsRank,
  ) => Promise<PublicCardStatisticsCollection>;
  loadCardHistory: (
    format: PublicCardStatisticsFormat,
    cardId: string,
    period: PublicCardStatisticsPeriod,
    rank: PublicCardStatisticsRank,
    days: number,
  ) => Promise<JsonRecord[]>;
};

type StatisticsSlice = {
  format: PublicCardStatisticsFormat;
  period: PublicCardStatisticsPeriod;
  rank: PublicCardStatisticsRank;
};

type StatisticsMeta = {
  format: PublicCardStatisticsFormat;
  period: {
    id: PublicCardStatisticsPeriod;
    timeRange: string | null;
    patch: string | null;
  };
  rank: {
    id: PublicCardStatisticsRank;
    rankRange: string;
  };
  updatedAt: string | null;
  datasetVersion: string;
  dataStatus: 'fresh' | 'stale';
};

export type PublicCardStatisticsListResult = {
  data: PublicCardStatisticsItem[];
  pagination: {
    limit: number;
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  meta: StatisticsMeta;
  cacheSource: 'fresh' | 'LKG';
};

export type PublicCardStatisticsDetailResult = {
  data: PublicCardStatisticsItem;
  meta: StatisticsMeta;
  cacheSource: 'fresh' | 'LKG';
};

export type PublicCardStatisticsHistoryResult = {
  data: PublicCardStatisticsHistoryPoint[];
  meta: StatisticsMeta & { days: number };
  cacheSource: 'fresh' | 'LKG';
};

export class PublicCardStatisticsQueryError extends Error {
  constructor() {
    super('Card statistics query is invalid');
    this.name = 'PublicCardStatisticsQueryError';
  }
}

const CARD_ID_PATTERN = /^[A-Za-z0-9_]{2,80}$/;
const FORMATS = new Set<PublicCardStatisticsFormat>(['standard', 'wild']);
const PERIODS = new Set<PublicCardStatisticsPeriod>(['1d', '3d', '7d', '14d', 'patch']);
const RANKS = new Set<PublicCardStatisticsRank>(['legend', 'diamond_4_1', 'diamond', 'platinum']);
const PERIOD_TIME_RANGES: Record<PublicCardStatisticsPeriod, string | null> = {
  '1d': 'LAST_1_DAY',
  '3d': 'LAST_3_DAYS',
  '7d': 'LAST_7_DAYS',
  '14d': 'LAST_14_DAYS',
  patch: null,
};
const RANK_RANGES: Record<PublicCardStatisticsRank, string> = {
  legend: 'LEGEND',
  diamond_4_1: 'DIAMOND_FOUR_THROUGH_DIAMOND_ONE',
  diamond: 'DIAMOND',
  platinum: 'PLATINUM',
};
const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 500;
const DEFAULT_HISTORY_DAYS = 90;
const MIN_HISTORY_DAYS = 7;
const MAX_HISTORY_DAYS = 365;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function scalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string') throw new PublicCardStatisticsQueryError();
  return value.trim();
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  const normalized = scalar(value).toLocaleLowerCase('en-US') as T;
  if (!normalized) return fallback;
  if (!allowed.has(normalized)) throw new PublicCardStatisticsQueryError();
  return normalized;
}

function positiveInteger(value: unknown, fallback: number, maximum: number, minimum = 1): number {
  const normalized = scalar(value);
  if (!normalized) return fallback;
  if (!/^[1-9]\d{0,3}$/.test(normalized)) throw new PublicCardStatisticsQueryError();
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new PublicCardStatisticsQueryError();
  }
  return parsed;
}

function parseSlice(query: Record<string, unknown>): StatisticsSlice {
  return {
    format: enumValue(query.format, FORMATS, 'standard'),
    period: enumValue(query.period, PERIODS, '1d'),
    rank: enumValue(query.rank, RANKS, 'legend'),
  };
}

function cardId(value: unknown): string {
  const normalized = scalar(value).toUpperCase();
  if (!CARD_ID_PATTERN.test(normalized)) throw new PublicCardStatisticsQueryError();
  return normalized;
}

function finite(value: unknown, options?: { minimum?: number; maximum?: number; integer?: boolean }): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (options?.integer && !Number.isSafeInteger(parsed)) return null;
  if (options?.minimum !== undefined && parsed < options.minimum) return null;
  if (options?.maximum !== undefined && parsed > options.maximum) return null;
  return parsed;
}

function percent(value: unknown): number | null {
  return finite(value, { minimum: 0, maximum: 100 });
}

function metrics(value: unknown): PublicCardStatisticsMetrics {
  const source = record(value);
  return {
    deckPopularityPercent: percent(source.deckPopularity),
    deckWinratePercent: percent(source.deckWinrate),
    averageCopies: finite(source.averageCopies, { minimum: 0 }),
    timesPlayed: finite(source.timesPlayed, { minimum: 0, integer: true }),
    winrateWhenPlayedPercent: percent(source.winrateWhenPlayed),
    winrateWhenDrawnPercent: percent(source.winrateWhenDrawn),
    keepPercentage: percent(source.keepPercentage),
    openingHandWinratePercent: percent(source.openingHandWinrate),
    averageTurnsInHand: finite(source.averageTurnsInHand, { minimum: 0 }),
    averageTurnPlayed: finite(source.averageTurnPlayed, { minimum: 0 }),
  };
}

/** Copies only the documented aggregate fields from a provider-backed card. */
export function serializePublicCardStatistics(value: unknown): PublicCardStatisticsItem {
  const source = record(value);
  return {
    cardId: cardId(source.card_id),
    metrics: metrics(source.stats),
  };
}

/** Copies one persisted aggregate point without provider-specific additions. */
export function serializePublicCardStatisticsHistoryPoint(
  value: unknown,
): PublicCardStatisticsHistoryPoint {
  const source = record(value);
  const timestamp = Date.parse(String(source.recordedAt ?? ''));
  if (!Number.isFinite(timestamp)) throw new PublicCardStatisticsQueryError();
  return {
    recordedAt: new Date(timestamp).toISOString(),
    metrics: metrics(source),
  };
}

function timestamp(value: unknown): string | null {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function boundedPatch(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized && /^[A-Za-z0-9_.-]{1,40}$/.test(normalized) ? normalized : null;
}

function meta(
  slice: StatisticsSlice,
  collection: PublicCardStatisticsCollection,
): StatisticsMeta {
  return {
    format: slice.format,
    period: {
      id: slice.period,
      timeRange: PERIOD_TIME_RANGES[slice.period],
      patch: slice.period === 'patch' ? boundedPatch(collection.period?.patch) : null,
    },
    rank: {
      id: slice.rank,
      rankRange: RANK_RANGES[slice.rank],
    },
    updatedAt: timestamp(collection.updatedAt),
    datasetVersion: String(collection.datasetVersion).slice(0, 160),
    dataStatus: collection.dataStatus,
  };
}

function encodeCursor(slice: StatisticsSlice, itemCardId: string): string {
  return Buffer.from([
    'v1',
    slice.format,
    slice.rank,
    slice.period,
    itemCardId,
  ].join(':')).toString('base64url');
}

function decodeCursor(value: unknown, slice: StatisticsSlice): string | null {
  const encoded = scalar(value);
  if (!encoded) return null;
  if (!/^[A-Za-z0-9_-]{8,240}$/.test(encoded)) throw new PublicCardStatisticsQueryError();
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  if (Buffer.from(decoded).toString('base64url') !== encoded) {
    throw new PublicCardStatisticsQueryError();
  }
  const [version, format, rank, period, cursorCardId, ...rest] = decoded.split(':');
  if (rest.length > 0
    || version !== 'v1'
    || format !== slice.format
    || rank !== slice.rank
    || period !== slice.period
    || !CARD_ID_PATTERN.test(cursorCardId ?? '')) {
    throw new PublicCardStatisticsQueryError();
  }
  return String(cursorCardId).toUpperCase();
}

function compareCardIds(left: string, right: string): number {
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
}

/**
 * Adapts the internal constructed-card snapshot to a stable, bounded public
 * statistics contract. It never performs one source request per card.
 */
export function createPublicCardStatistics(source: PublicCardStatisticsSource) {
  const cache = new Map<string, {
    datasetVersion: string;
    cards: PublicCardStatisticsItem[];
  }>();

  const load = async (slice: StatisticsSlice) => {
    const collection = await source.loadCards(slice.format, slice.period, slice.rank);
    const key = `${slice.format}:${slice.rank}:${slice.period}`;
    const cached = cache.get(key);
    if (cached?.datasetVersion === collection.datasetVersion) {
      return { collection, cards: cached.cards };
    }
    const cards = collection.cards
      .map(serializePublicCardStatistics)
      .sort((left, right) => compareCardIds(left.cardId, right.cardId));
    cache.set(key, { datasetVersion: collection.datasetVersion, cards });
    return { collection, cards };
  };

  return {
    async list(query: Record<string, unknown>): Promise<PublicCardStatisticsListResult> {
      const slice = parseSlice(query);
      const limit = positiveInteger(query.limit, DEFAULT_LIMIT, MAX_LIMIT);
      const cursor = decodeCursor(query.cursor, slice);
      const { collection, cards } = await load(slice);
      const start = cursor
        ? cards.findIndex(item => compareCardIds(item.cardId, cursor) > 0)
        : 0;
      const safeStart = start < 0 ? cards.length : start;
      const data = cards.slice(safeStart, safeStart + limit);
      const hasMore = safeStart + data.length < cards.length;
      return {
        data,
        pagination: {
          limit,
          total: cards.length,
          hasMore,
          nextCursor: hasMore && data.length > 0
            ? encodeCursor(slice, data[data.length - 1].cardId)
            : null,
        },
        meta: meta(slice, collection),
        cacheSource: collection.cacheSource,
      };
    },

    async detail(
      query: Record<string, unknown>,
      cardIdValue: unknown,
    ): Promise<PublicCardStatisticsDetailResult | null> {
      const slice = parseSlice(query);
      const requestedCardId = cardId(cardIdValue);
      const { collection, cards } = await load(slice);
      const item = cards.find(candidate => candidate.cardId === requestedCardId);
      return item ? {
        data: item,
        meta: meta(slice, collection),
        cacheSource: collection.cacheSource,
      } : null;
    },

    async history(
      query: Record<string, unknown>,
      cardIdValue: unknown,
    ): Promise<PublicCardStatisticsHistoryResult | null> {
      const slice = parseSlice(query);
      const requestedCardId = cardId(cardIdValue);
      const days = positiveInteger(
        query.days,
        DEFAULT_HISTORY_DAYS,
        MAX_HISTORY_DAYS,
        MIN_HISTORY_DAYS,
      );
      const { collection, cards } = await load(slice);
      if (!cards.some(candidate => candidate.cardId === requestedCardId)) return null;
      const points = await source.loadCardHistory(
        slice.format,
        requestedCardId,
        slice.period,
        slice.rank,
        days,
      );
      return {
        data: points
          .map(serializePublicCardStatisticsHistoryPoint)
          .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
          .slice(0, 1_000),
        meta: { ...meta(slice, collection), days },
        cacheSource: collection.cacheSource,
      };
    },
  };
}
