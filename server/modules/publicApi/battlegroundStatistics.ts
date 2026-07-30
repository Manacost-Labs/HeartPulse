import { createHash } from 'node:crypto';

type JsonRecord = Record<string, unknown>;

export type PublicBattlegroundTierListKind =
  | 'heroes'
  | 'minions'
  | 'spells'
  | 'trinkets'
  | 'strategies';

export type PublicBattlegroundStatisticsSource = {
  loadHeroes: () => Promise<unknown>;
  loadMinions: () => Promise<unknown>;
  loadTierLists: () => Promise<unknown>;
};

type BattlegroundEntity = 'heroes' | 'minions' | `tier-list:${PublicBattlegroundTierListKind}`;

type VersionedDataset<T> = {
  data: T[];
  meta: {
    mode: 'battlegrounds';
    entity: BattlegroundEntity;
    updatedAt: string | null;
    datasetVersion: string;
    dataStatus: 'fresh' | 'stale';
    sample?: {
      mmrPercentile: string | null;
      timeRange: string | null;
    };
  };
  cacheSource: 'fresh' | 'LKG';
};

const TIER_LIST_KINDS = new Set<PublicBattlegroundTierListKind>([
  'heroes',
  'minions',
  'spells',
  'trinkets',
  'strategies',
]);
const TIERS = new Set(['S', 'A', 'B', 'C', 'D']);
const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_MIN_GAMES = 100_000_000;
const FRESH_FOR_MS = 48 * 60 * 60 * 1000;

export class PublicBattlegroundStatisticsQueryError extends Error {
  constructor() {
    super('Battlegrounds statistics query is invalid');
    this.name = 'PublicBattlegroundStatisticsQueryError';
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function scalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string') throw new PublicBattlegroundStatisticsQueryError();
  return value.trim();
}

function integer(value: unknown, fallback: number, maximum: number, minimum = 0): number {
  const normalized = scalar(value);
  if (!normalized) return fallback;
  if (!/^\d{1,9}$/.test(normalized)) throw new PublicBattlegroundStatisticsQueryError();
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new PublicBattlegroundStatisticsQueryError();
  }
  return parsed;
}

function decimal(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const normalized = scalar(value);
  if (!normalized) return fallback;
  if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(normalized)) {
    throw new PublicBattlegroundStatisticsQueryError();
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new PublicBattlegroundStatisticsQueryError();
  }
  return parsed;
}

function tierValue(value: unknown): string | null {
  const normalized = scalar(value).toLocaleUpperCase('en-US');
  if (!normalized) return null;
  if (!TIERS.has(normalized)) throw new PublicBattlegroundStatisticsQueryError();
  return normalized;
}

function tierListKindValue(value: unknown): PublicBattlegroundTierListKind {
  if (typeof value !== 'string') throw new PublicBattlegroundStatisticsQueryError();
  const normalized = value.trim().toLocaleLowerCase('en-US') as PublicBattlegroundTierListKind;
  if (!TIER_LIST_KINDS.has(normalized)) throw new PublicBattlegroundStatisticsQueryError();
  return normalized;
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

function safeTier(value: unknown): string | null {
  const normalized = text(value, 8).toLocaleUpperCase('en-US');
  return TIERS.has(normalized) ? normalized : null;
}

function safeEntityId(value: unknown): string | null {
  const normalized = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : text(value, 120);
  return ENTITY_ID_PATTERN.test(normalized) ? normalized : null;
}

function dataStatus(updatedAt: string | null): 'fresh' | 'stale' {
  return updatedAt && Date.now() - Date.parse(updatedAt) <= FRESH_FOR_MS ? 'fresh' : 'stale';
}

function datasetVersion(
  entity: BattlegroundEntity,
  updatedAt: string | null,
  data: unknown[],
  sample?: unknown,
): string {
  return `ds1-${createHash('sha256')
    .update(JSON.stringify({ entity, updatedAt, data, sample }))
    .digest('hex')
    .slice(0, 20)}`;
}

function versioned<T>(
  entity: BattlegroundEntity,
  updatedAt: string | null,
  data: T[],
  sample?: VersionedDataset<T>['meta']['sample'],
): VersionedDataset<T> {
  const status = dataStatus(updatedAt);
  return {
    data,
    meta: {
      mode: 'battlegrounds',
      entity,
      updatedAt,
      datasetVersion: datasetVersion(entity, updatedAt, data, sample),
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

function decodeCursor(value: unknown, version: string, fingerprint: string): number {
  const encoded = scalar(value);
  if (!encoded) return 0;
  if (!/^[A-Za-z0-9_-]{12,500}$/.test(encoded)) {
    throw new PublicBattlegroundStatisticsQueryError();
  }
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    if (Buffer.from(decoded).toString('base64url') !== encoded) {
      throw new PublicBattlegroundStatisticsQueryError();
    }
    const cursor = record(JSON.parse(decoded));
    const offset = Number(cursor.o);
    if (cursor.v !== 1
      || cursor.d !== version
      || cursor.f !== fingerprint
      || !Number.isSafeInteger(offset)
      || offset < 0) {
      throw new PublicBattlegroundStatisticsQueryError();
    }
    return offset;
  } catch (error) {
    if (error instanceof PublicBattlegroundStatisticsQueryError) throw error;
    throw new PublicBattlegroundStatisticsQueryError();
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

function placementDistribution(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => percent(record(value).rate ?? value))
    .filter((value): value is number => value !== null)
    .slice(0, 8);
}

function serializeHero(value: unknown) {
  const source = record(value);
  const heroId = safeEntityId(source.dbfId ?? source.dbf_id);
  const name = text(source.hero ?? source.name);
  if (!heroId || !name) return null;
  const bestCompositionId = safeEntityId(
    source.best_composition_id ?? record(source.best_composition).id,
  );
  const bestCompositionName = text(
    source.best_comp
      ?? source.bestComposition
      ?? record(source.best_composition).name,
  );
  return {
    heroId,
    name,
    tier: safeTier(source.tier),
    bestComposition: bestCompositionId || bestCompositionName
      ? {
          id: bestCompositionId,
          name: bestCompositionName || null,
        }
      : null,
    metrics: {
      pickRatePercent: percent(source.pick_rate ?? source.pickRate),
      averagePlacement: finite(source.avg_placement ?? source.avgPlacement, {
        minimum: 1,
        maximum: 8,
      }),
      placementDistributionPercent: placementDistribution(
        source.placement_distribution ?? source.placementDistribution,
      ),
    },
  };
}

function serializeMinion(value: unknown) {
  const source = record(value);
  const dbfId = count(source.dbf_id ?? source.dbfId);
  const cardId = safeEntityId(source.card_id ?? source.cardId);
  if (dbfId === null || !cardId) return null;
  return {
    dbfId,
    cardId,
    name: text(source.name) || cardId,
    localizedName: text(source.name_ru ?? source.localizedName) || null,
    tavernTier: finite(source.tavern_tier ?? source.tavernTier, {
      minimum: 1,
      maximum: 7,
      integer: true,
    }),
    metrics: {
      impact: finite(source.impact, { minimum: -8, maximum: 8 }),
      combatWinratePercent: percent(source.combat_winrate ?? source.combatWinrate),
      popularityPercent: percent(source.popularity),
      gamesWithMinion: count(source.games_with_minion ?? source.gamesWithMinion),
      gamesWithoutMinion: count(source.games_without_minion ?? source.gamesWithoutMinion),
      averagePlacementWith: finite(
        source.avg_placement_with ?? source.averagePlacementWith,
        { minimum: 1, maximum: 8 },
      ),
      averagePlacementWithout: finite(
        source.avg_placement_without ?? source.averagePlacementWithout,
        { minimum: 1, maximum: 8 },
      ),
    },
  };
}

function tierListEntityId(source: JsonRecord): string | null {
  return safeEntityId(source.id ?? source.key ?? source.dbfId ?? source.dbf_id);
}

function serializeTierListItem(value: unknown, tier: unknown) {
  const source = record(value);
  const entityId = tierListEntityId(source);
  if (!entityId) return null;
  const name = text(source.name ?? source.title ?? source.hero) || entityId;
  const localizedName = text(source.localizedName ?? source.ruName);
  const archetypeId = safeEntityId(source.archetypeKey);
  const archetypeName = text(source.archetype);
  return {
    entityId,
    dbfId: count(source.dbfId ?? source.dbf_id),
    cardId: safeEntityId(source.id),
    name,
    localizedName: localizedName || null,
    tier: safeTier(source.tier ?? tier),
    tavernTier: finite(source.tavernTier ?? source.tavern_tier, {
      minimum: 1,
      maximum: 7,
      integer: true,
    }),
    archetype: archetypeId || archetypeName
      ? { id: archetypeId, name: archetypeName || null }
      : null,
    difficulty: text(source.difficulty, 40) || null,
    metrics: {
      impact: finite(source.impact, { minimum: -8, maximum: 8 }),
      combatWinratePercent: percent(source.combatWinrate ?? source.combat_winrate),
      pickRatePercent: percent(source.pickRate ?? source.pick_rate),
      popularityPercent: percent(source.popularity),
      firstPlacePercent: percent(source.firstPlace ?? source.first_place),
      averagePlacement: finite(source.avgPlacement ?? source.avg_placement, {
        minimum: 1,
        maximum: 8,
      }),
      averagePlacementWithout: finite(
        source.avgPlacementOther ?? source.avg_placement_other,
        { minimum: 1, maximum: 8 },
      ),
      games: count(source.games ?? source.totalPlayed ?? source.total_played),
      placementDistributionPercent: placementDistribution(
        source.placementDistribution ?? source.placement_distribution,
      ),
    },
  };
}

function sampleFrom(value: unknown) {
  const source = record(value);
  return {
    mmrPercentile: text(source.mmr_percentile ?? source.mmrPercentile, 80) || null,
    timeRange: text(source.time_range ?? source.timeRange, 80) || null,
  };
}

/**
 * Builds the allowlisted Battlegrounds statistics surface. Source URLs,
 * scraper status, raw snapshots, media and strategy card lists stay private.
 */
export function createPublicBattlegroundStatistics(source: PublicBattlegroundStatisticsSource) {
  return {
    async heroes(query: JsonRecord) {
      const selectedTier = tierValue(query.tier);
      const minPickRate = decimal(query.minPickRate, 0, 0, 100);
      const payload = record(await source.loadHeroes());
      const view = record(payload.view);
      const updatedAt = timestamp(payload.fetched_at ?? payload.fetchedAt);
      const sample = sampleFrom(view.filters);
      const data = (Array.isArray(view.heroes) ? view.heroes : [])
        .map(serializeHero)
        .filter((item): item is NonNullable<ReturnType<typeof serializeHero>> => Boolean(item))
        .filter(item => (
          (!selectedTier || item.tier === selectedTier)
          && (item.metrics.pickRatePercent ?? 0) >= minPickRate
        ))
        .sort((left, right) => (
          (left.metrics.averagePlacement ?? Infinity) - (right.metrics.averagePlacement ?? Infinity)
          || (right.metrics.pickRatePercent ?? -1) - (left.metrics.pickRatePercent ?? -1)
          || left.heroId.localeCompare(right.heroId, 'en')
        ));
      const result = versioned('heroes', updatedAt, data, sample);
      return paginate(query, result, [selectedTier, minPickRate]);
    },

    async minions(query: JsonRecord) {
      const tavernTier = integer(query.tavernTier, 0, 7);
      if (tavernTier === 0 && scalar(query.tavernTier)) {
        throw new PublicBattlegroundStatisticsQueryError();
      }
      const minGames = integer(query.minGames, 0, MAX_MIN_GAMES);
      const payload = record(await source.loadMinions());
      const latestRun = record(payload.latest_run ?? payload.latestRun);
      const updatedAt = timestamp(latestRun.completed_at ?? latestRun.completedAt);
      const sample = sampleFrom(latestRun);
      const data = (Array.isArray(payload.minions) ? payload.minions : [])
        .map(serializeMinion)
        .filter((item): item is NonNullable<ReturnType<typeof serializeMinion>> => Boolean(item))
        .filter(item => (
          (!tavernTier || item.tavernTier === tavernTier)
          && (item.metrics.gamesWithMinion ?? 0) >= minGames
        ))
        .sort((left, right) => (
          (right.metrics.impact ?? -Infinity) - (left.metrics.impact ?? -Infinity)
          || (right.metrics.gamesWithMinion ?? -1) - (left.metrics.gamesWithMinion ?? -1)
          || left.cardId.localeCompare(right.cardId, 'en')
        ));
      const result = versioned('minions', updatedAt, data, sample);
      return paginate(query, result, [tavernTier, minGames]);
    },

    async tierList(kindValue: unknown, query: JsonRecord) {
      const kind = tierListKindValue(kindValue);
      const selectedTier = tierValue(query.tier);
      const minGames = integer(query.minGames, 0, MAX_MIN_GAMES);
      const payload = record(await source.loadTierLists());
      const list = record(record(payload.lists)[kind]);
      const updatedAt = timestamp(list.fetchedAt ?? list.generatedAt ?? payload.generatedAt);
      const data: NonNullable<ReturnType<typeof serializeTierListItem>>[] = [];
      const tiers = record(list.tiers);
      for (const [tier, values] of Object.entries(tiers)) {
        if (!Array.isArray(values)) continue;
        for (const value of values) {
          const serialized = serializeTierListItem(value, tier);
          if (serialized) data.push(serialized);
        }
      }
      const filtered = data
        .filter(item => (
          (!selectedTier || item.tier === selectedTier)
          && (item.metrics.games ?? 0) >= minGames
        ))
        .sort((left, right) => (
          (left.metrics.averagePlacement ?? Infinity) - (right.metrics.averagePlacement ?? Infinity)
          || (right.metrics.games ?? -1) - (left.metrics.games ?? -1)
          || left.entityId.localeCompare(right.entityId, 'en')
        ));
      const result = versioned(`tier-list:${kind}`, updatedAt, filtered);
      return paginate(query, result, [kind, selectedTier, minGames]);
    },
  };
}
