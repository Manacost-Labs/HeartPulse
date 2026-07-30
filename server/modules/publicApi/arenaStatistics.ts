import { createHash } from 'node:crypto';

type JsonRecord = Record<string, unknown>;

export type PublicArenaClassSource = 'hsreplay' | 'firestone';
export type PublicArenaCardSource = PublicArenaClassSource | 'heartharena';
export type PublicArenaLegendarySource = PublicArenaClassSource;

export type PublicArenaStatisticsSource = {
  loadClasses: (source: PublicArenaClassSource) => Promise<unknown>;
  loadCards: (source: PublicArenaCardSource) => Promise<unknown>;
  loadLegendaries: (source: PublicArenaLegendarySource) => Promise<unknown>;
  loadMatchups: (source: PublicArenaClassSource) => Promise<unknown>;
};

type ArenaEntity = 'classes' | 'cards' | 'legendaries' | 'matchups';

type VersionedDataset<T> = {
  data: T[];
  meta: {
    mode: 'arena';
    entity: ArenaEntity;
    source: string;
    updatedAt: string | null;
    datasetVersion: string;
    dataStatus: 'fresh' | 'stale';
    sample?: {
      dataPoints: number | null;
      timePeriod: string | null;
    };
  };
  cacheSource: 'fresh' | 'LKG';
};

const CLASS_SOURCES = new Set<PublicArenaClassSource>(['hsreplay', 'firestone']);
const CARD_SOURCES = new Set<PublicArenaCardSource>(['hsreplay', 'firestone', 'heartharena']);
const LEGENDARY_SOURCES = new Set<PublicArenaLegendarySource>(['hsreplay', 'firestone']);
const CLASS_IDS = new Set([
  'death-knight',
  'demon-hunter',
  'druid',
  'hunter',
  'mage',
  'paladin',
  'priest',
  'rogue',
  'shaman',
  'warlock',
  'warrior',
]);
const TIERS = new Set(['S', 'A', 'B', 'C', 'D', 'E', 'F', 'NO-DATA']);
const CARD_ID_PATTERN = /^[A-Za-z0-9_]{1,80}$/;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_MIN_GAMES = 100_000_000;
const FRESH_FOR_MS = 48 * 60 * 60 * 1000;

export class PublicArenaStatisticsQueryError extends Error {
  constructor() {
    super('Arena statistics query is invalid');
    this.name = 'PublicArenaStatisticsQueryError';
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function scalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string') throw new PublicArenaStatisticsQueryError();
  return value.trim();
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  const normalized = scalar(value).toLocaleLowerCase('en-US') as T;
  if (!normalized) return fallback;
  if (!allowed.has(normalized)) throw new PublicArenaStatisticsQueryError();
  return normalized;
}

function classIdValue(value: unknown): string | null {
  const normalized = scalar(value).toLocaleLowerCase('en-US');
  if (!normalized) return null;
  if (!CLASS_IDS.has(normalized)) throw new PublicArenaStatisticsQueryError();
  return normalized;
}

function tierValue(value: unknown): string | null {
  const normalized = scalar(value).toLocaleUpperCase('en-US');
  if (!normalized) return null;
  if (!TIERS.has(normalized)) throw new PublicArenaStatisticsQueryError();
  return normalized;
}

function integer(value: unknown, fallback: number, maximum: number, minimum = 0): number {
  const normalized = scalar(value);
  if (!normalized) return fallback;
  if (!/^\d{1,9}$/.test(normalized)) throw new PublicArenaStatisticsQueryError();
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new PublicArenaStatisticsQueryError();
  }
  return parsed;
}

function finite(
  value: unknown,
  options?: { minimum?: number; maximum?: number; integer?: boolean },
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value).replace('%', '').replace(',', '.').trim());
  if (!Number.isFinite(parsed)) return null;
  if (options?.integer && !Number.isSafeInteger(parsed)) return null;
  if (options?.minimum !== undefined && parsed < options.minimum) return null;
  if (options?.maximum !== undefined && parsed > options.maximum) return null;
  return parsed;
}

const percent = (value: unknown) => finite(value, { minimum: 0, maximum: 100 });
const count = (value: unknown) => finite(value, { minimum: 0, integer: true });

function text(value: unknown, maximum = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function timestamp(value: unknown): string | null {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function safeClassId(value: unknown): string | null {
  const normalized = text(value, 32).toLocaleLowerCase('en-US');
  return CLASS_IDS.has(normalized) ? normalized : null;
}

function safeTier(value: unknown): string | null {
  const normalized = text(value, 16).toLocaleUpperCase('en-US');
  return TIERS.has(normalized) ? normalized : null;
}

function safeCardId(value: unknown): string | null {
  const normalized = text(value, 80);
  return CARD_ID_PATTERN.test(normalized) ? normalized : null;
}

function dataStatus(updatedAt: string | null): 'fresh' | 'stale' {
  return updatedAt && Date.now() - Date.parse(updatedAt) <= FRESH_FOR_MS ? 'fresh' : 'stale';
}

function datasetVersion(
  entity: ArenaEntity,
  source: string,
  updatedAt: string | null,
  data: unknown[],
  sample?: VersionedDataset<unknown>['meta']['sample'],
): string {
  return `ds1-${createHash('sha256')
    .update(JSON.stringify({ entity, source, updatedAt, data, sample }))
    .digest('hex')
    .slice(0, 20)}`;
}

function versioned<T>(
  entity: ArenaEntity,
  source: string,
  updatedAt: string | null,
  data: T[],
  sample?: VersionedDataset<T>['meta']['sample'],
): VersionedDataset<T> {
  const status = dataStatus(updatedAt);
  return {
    data,
    meta: {
      mode: 'arena',
      entity,
      source,
      updatedAt,
      datasetVersion: datasetVersion(entity, source, updatedAt, data, sample),
      dataStatus: status,
      ...(sample ? { sample } : {}),
    },
    cacheSource: status === 'fresh' ? 'fresh' : 'LKG',
  };
}

function cursorFingerprint(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

function encodeCursor(version: string, fingerprint: string, offset: number): string {
  return Buffer.from(JSON.stringify({ v: 1, d: version, f: fingerprint, o: offset }))
    .toString('base64url');
}

function decodeCursor(
  value: unknown,
  version: string,
  fingerprint: string,
): number {
  const encoded = scalar(value);
  if (!encoded) return 0;
  if (!/^[A-Za-z0-9_-]{12,500}$/.test(encoded)) throw new PublicArenaStatisticsQueryError();
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    if (Buffer.from(decoded).toString('base64url') !== encoded) {
      throw new PublicArenaStatisticsQueryError();
    }
    const cursor = record(JSON.parse(decoded));
    const offset = Number(cursor.o);
    if (cursor.v !== 1
      || cursor.d !== version
      || cursor.f !== fingerprint
      || !Number.isSafeInteger(offset)
      || offset < 0) {
      throw new PublicArenaStatisticsQueryError();
    }
    return offset;
  } catch (error) {
    if (error instanceof PublicArenaStatisticsQueryError) throw error;
    throw new PublicArenaStatisticsQueryError();
  }
}

function paginate<T>(
  query: JsonRecord,
  result: VersionedDataset<T>,
  fingerprintParts: unknown[],
) {
  const limit = integer(query.limit, DEFAULT_LIMIT, MAX_LIMIT, 1);
  const fingerprint = cursorFingerprint(fingerprintParts);
  const offset = decodeCursor(query.cursor, result.meta.datasetVersion, fingerprint);
  const data = result.data.slice(offset, offset + limit);
  const nextOffset = offset + data.length;
  const hasMore = nextOffset < result.data.length;
  return {
    ...result,
    data,
    pagination: {
      limit,
      total: result.data.length,
      hasMore,
      nextCursor: hasMore
        ? encodeCursor(result.meta.datasetVersion, fingerprint, nextOffset)
        : null,
    },
  };
}

function serializeClass(value: unknown) {
  const source = record(value);
  const classId = safeClassId(source.id);
  const winratePercent = percent(source.winrate);
  const games = count(source.games);
  if (!classId || winratePercent === null || games === null) return null;
  const winsDistribution = (Array.isArray(source.winsDistribution)
    ? source.winsDistribution
    : [])
    .map((value) => {
      const distribution = record(value);
      const wins = count(distribution.wins);
      const distributionGames = count(distribution.games ?? distribution.total);
      if (wins === null || distributionGames === null) return null;
      return {
        wins,
        games: distributionGames,
        sharePercent: games > 0
          ? Math.round((distributionGames / games) * 10_000) / 100
          : null,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const matchups = (Array.isArray(source.matchups) ? source.matchups : [])
    .map((value) => {
      const matchup = record(value);
      const opponentClassId = safeClassId(matchup.opponentClassId);
      const matchupGames = count(matchup.games ?? matchup.totalGames);
      const matchupWins = count(matchup.wins ?? matchup.totalsWins);
      const winratePercent = percent(matchup.winrate ?? matchup.winratePercent);
      if (!opponentClassId || matchupGames === null || winratePercent === null) {
        return null;
      }
      return {
        opponentClassId,
        opponentHeroPowerCardId: safeCardId(matchup.opponentHeroPowerCardId),
        metrics: {
          winratePercent,
          games: matchupGames,
          wins: matchupWins,
          losses: count(matchup.losses),
        },
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return {
    classId,
    name: text(source.name) || classId,
    heroPowerCardId: safeCardId(source.heroPowerCardId),
    winsDistribution,
    matchups,
    metrics: {
      winratePercent,
      games,
      wins: count(source.wins ?? source.totalWins ?? source.totalsWins),
      losses: count(source.losses ?? source.totalLosses),
      pickRatePercent: percent(source.pickRate ?? source.pick_rate),
      sevenPlusWinsPercent: percent(
        source.sevenPlusWinsRate
          ?? source.sevenPlusWinsPercent
          ?? source.pct7Plus
          ?? source.pct_7_plus,
      ),
    },
  };
}

function serializeArenaCard(value: unknown, tier: unknown, sectionClass: unknown) {
  const source = record(value);
  const cardId = safeCardId(source.cardId);
  if (!cardId) return null;
  return {
    cardId,
    name: text(source.name) || cardId,
    classId: safeClassId(source.classKey) ?? safeClassId(sectionClass),
    rarity: text(source.rarity, 32) || null,
    tier: safeTier(tier),
    arenaSmithTier: safeTier(source.arenaSmithTier ?? source.arenasmithTier),
    arenaSmithTierPosition: safeTier(
      source.arenaSmithTierPosition ?? source.arenasmithTierPosition,
    ),
    arenaSmithRank: count(source.arenaSmithRank ?? source.arenasmithRank),
    metrics: {
      deckWinratePercent: percent(source.deckWinrate ?? source.winrate),
      playedWinratePercent: percent(source.playedWinrate),
      pickRatePercent: percent(source.pickRate),
      inclusionRatePercent: percent(source.inDecks),
      games: count(source.totalGames),
      arenaScore: finite(source.arenaScore, { minimum: -10_000, maximum: 10_000 }),
      offerRatePercent: percent(source.offerRate),
      discardRatePercent: percent(source.discardRate),
      drawnWinratePercent: percent(source.drawnWinrate),
      mulliganWinratePercent: percent(source.mulliganWinrate),
      keptRatePercent: percent(source.keptRate),
      averageCopies: finite(source.avgCopies, { minimum: 0, maximum: 30 }),
      copiesInPackage: count(source.count),
    },
  };
}

function serializeLegendaryCard(value: unknown) {
  const source = record(value);
  const cardId = safeCardId(source.cardId);
  if (!cardId) return null;
  return {
    cardId,
    name: text(source.name) || cardId,
    classId: safeClassId(source.classKey),
    rarity: text(source.rarity, 32) || null,
    tier: safeTier(source.tier),
    arenaSmithTier: safeTier(source.arenaSmithTier ?? source.arenasmithTier),
    arenaSmithTierPosition: safeTier(
      source.arenaSmithTierPosition ?? source.arenasmithTierPosition,
    ),
    arenaSmithRank: count(source.arenaSmithRank ?? source.arenasmithRank),
    metrics: {
      deckWinratePercent: percent(source.deckWinrate ?? source.winrate),
      playedWinratePercent: percent(source.playedWinrate),
      drawnWinratePercent: percent(source.drawnWinrate),
      mulliganWinratePercent: percent(source.mulliganWinrate),
      pickRatePercent: percent(source.pickRate),
      inclusionRatePercent: percent(source.inDecks),
      offerRatePercent: percent(source.offerRate),
      discardRatePercent: percent(source.discardRate),
      keptRatePercent: percent(source.keptRate),
      games: count(source.totalGames),
      arenaScore: finite(source.arenaScore, { minimum: -10_000, maximum: 10_000 }),
      averageCopies: finite(source.avgCopies, { minimum: 0, maximum: 30 }),
      copiesInPackage: count(source.count),
    },
  };
}

function serializeLegendaryByClass(value: unknown) {
  const source = record(value);
  const result: Record<string, {
    winratePercent: number | null;
    pickRatePercent: number | null;
    offerRatePercent: number | null;
    arenaScore: number | null;
  }> = {};
  for (const [rawClassId, rawMetrics] of Object.entries(source)) {
    const classId = rawClassId.toLocaleLowerCase('en-US') === 'all'
      ? 'all'
      : safeClassId(rawClassId);
    if (!classId) continue;
    const metrics = record(rawMetrics);
    result[classId] = {
      winratePercent: percent(metrics.winRate ?? metrics.winrate),
      pickRatePercent: percent(metrics.pickRate),
      offerRatePercent: percent(metrics.offerRate),
      arenaScore: finite(metrics.score ?? metrics.arenaScore, {
        minimum: -10_000,
        maximum: 10_000,
      }),
    };
  }
  return result;
}

function arenaCards(payload: unknown) {
  const source = record(payload);
  const data: NonNullable<ReturnType<typeof serializeArenaCard>>[] = [];
  for (const sectionValue of Array.isArray(source.sections) ? source.sections : []) {
    const section = record(sectionValue);
    for (const tierValue of Array.isArray(section.tiers) ? section.tiers : []) {
      const tier = record(tierValue);
      for (const card of Array.isArray(tier.cards) ? tier.cards : []) {
        const serialized = serializeArenaCard(card, tier.tier, section.id);
        if (serialized) data.push(serialized);
      }
    }
  }
  return data;
}

function serializeLegendary(value: unknown) {
  const group = record(value);
  const card = record(group.keyCard);
  const cardId = safeCardId(card.cardId);
  if (!cardId) return null;
  const keyCard = serializeLegendaryCard(card);
  const relatedCards = (Array.isArray(group.cards) ? group.cards : [])
    .map(serializeLegendaryCard)
    .filter((item): item is NonNullable<ReturnType<typeof serializeLegendaryCard>> => Boolean(item));
  const relatedCardIds = relatedCards.map(item => item.cardId);
  return {
    cardId,
    name: text(card.name) || cardId,
    classId: safeClassId(group.classKey) ?? safeClassId(card.classKey),
    relatedCardIds: [...new Set(relatedCardIds)],
    keyCard,
    relatedCards,
    byClass: serializeLegendaryByClass(group.byClass),
    metrics: {
      winratePercent: percent(group.winRate ?? card.deckWinrate ?? card.winrate),
      pickRatePercent: percent(group.pickRate ?? card.pickRate),
      offerRatePercent: percent(group.offerRate ?? card.offerRate),
      games: count(card.totalGames),
      arenaScore: finite(group.score ?? card.arenaScore, {
        minimum: -10_000,
        maximum: 10_000,
      }),
    },
  };
}

function serializeMatchup(value: unknown) {
  const source = record(value);
  const classAId = safeClassId(source.classAId);
  const classBId = safeClassId(source.classBId);
  const winratePercent = percent(source.winrate);
  if (!classAId || !classBId || winratePercent === null) return null;
  return {
    classAId,
    classBId,
    metrics: {
      winratePercent,
      games: count(source.games ?? source.totalGames ?? source.numGames),
    },
  };
}

/**
 * Builds the allowlisted Arena statistics surface. Provider labels, URLs,
 * presentation fields and raw payloads are deliberately excluded.
 */
export function createPublicArenaStatistics(source: PublicArenaStatisticsSource) {
  return {
    async classes(query: JsonRecord) {
      const selectedSource = enumValue(query.source, CLASS_SOURCES, 'hsreplay');
      const payload = record(await source.loadClasses(selectedSource));
      const updatedAt = timestamp(payload.updatedAt);
      const data = (Array.isArray(payload.classes) ? payload.classes : [])
        .map(serializeClass)
        .filter((item): item is NonNullable<ReturnType<typeof serializeClass>> => Boolean(item))
        .sort((left, right) => (
          right.metrics.winratePercent - left.metrics.winratePercent
          || right.metrics.games - left.metrics.games
          || left.classId.localeCompare(right.classId, 'en')
        ))
        .map((item, index) => ({ ...item, rank: index + 1 }));
      const sample = {
        dataPoints: count(payload.dataPoints ?? payload.data_points),
        timePeriod: text(payload.timePeriod ?? payload.time_period, 80) || null,
      };
      return versioned('classes', selectedSource, updatedAt, data, sample);
    },

    async cards(query: JsonRecord) {
      const selectedSource = enumValue(query.source, CARD_SOURCES, 'hsreplay');
      const selectedClass = classIdValue(query.class);
      const selectedTier = tierValue(query.tier);
      const minGames = integer(query.minGames, 0, MAX_MIN_GAMES);
      const payload = record(await source.loadCards(selectedSource));
      const updatedAt = timestamp(payload.updatedAt);
      const data = arenaCards(payload)
        .filter(item => (
          (!selectedClass || item.classId === selectedClass)
          && (!selectedTier || item.tier === selectedTier)
          && (item.metrics.games ?? 0) >= minGames
        ))
        .sort((left, right) => (
          (right.metrics.arenaScore ?? -Infinity) - (left.metrics.arenaScore ?? -Infinity)
          || (right.metrics.deckWinratePercent ?? -Infinity)
            - (left.metrics.deckWinratePercent ?? -Infinity)
          || (right.metrics.games ?? -1) - (left.metrics.games ?? -1)
          || left.cardId.localeCompare(right.cardId, 'en')
        ));
      const result = versioned('cards', selectedSource, updatedAt, data);
      return paginate(query, result, [selectedSource, selectedClass, selectedTier, minGames]);
    },

    async legendaries(query: JsonRecord) {
      const selectedSource = enumValue(query.source, LEGENDARY_SOURCES, 'hsreplay');
      const selectedClass = classIdValue(query.class);
      const minGames = integer(query.minGames, 0, MAX_MIN_GAMES);
      const payload = record(await source.loadLegendaries(selectedSource));
      const updatedAt = timestamp(payload.updatedAt);
      const data = (Array.isArray(payload.groups) ? payload.groups : [])
        .map(serializeLegendary)
        .filter((item): item is NonNullable<ReturnType<typeof serializeLegendary>> => Boolean(item))
        .filter(item => (
          (!selectedClass || item.classId === selectedClass)
          && (item.metrics.games ?? 0) >= minGames
        ))
        .sort((left, right) => (
          (right.metrics.winratePercent ?? -Infinity) - (left.metrics.winratePercent ?? -Infinity)
          || (right.metrics.games ?? -1) - (left.metrics.games ?? -1)
          || left.cardId.localeCompare(right.cardId, 'en')
        ));
      const result = versioned('legendaries', selectedSource, updatedAt, data);
      return paginate(query, result, [selectedSource, selectedClass, minGames]);
    },

    async matchups(query: JsonRecord) {
      const selectedSource = enumValue(query.source, CLASS_SOURCES, 'hsreplay');
      const selectedClass = classIdValue(query.class);
      const payload = record(await source.loadMatchups(selectedSource));
      const updatedAt = timestamp(payload.updatedAt);
      const data = (Array.isArray(payload.matchups) ? payload.matchups : [])
        .map(serializeMatchup)
        .filter((item): item is NonNullable<ReturnType<typeof serializeMatchup>> => Boolean(item))
        .filter(item => !selectedClass
          || item.classAId === selectedClass
          || item.classBId === selectedClass)
        .sort((left, right) => (
          left.classAId.localeCompare(right.classAId, 'en')
          || left.classBId.localeCompare(right.classBId, 'en')
        ));
      const result = versioned('matchups', selectedSource, updatedAt, data);
      return paginate(query, result, [selectedSource, selectedClass]);
    },
  };
}
