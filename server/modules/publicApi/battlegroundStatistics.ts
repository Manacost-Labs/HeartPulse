import { createHash } from 'node:crypto';

type JsonRecord = Record<string, unknown>;

export type PublicBattlegroundTierListKind =
  | 'heroes'
  | 'minions'
  | 'spells'
  | 'trinkets'
  | 'strategies';

export type PublicBattlegroundHeroMode = 'solo' | 'duos';
export type PublicBattlegroundMmr =
  | 'ALL'
  | 'TOP_50_PERCENT'
  | 'TOP_20_PERCENT'
  | 'TOP_5_PERCENT'
  | 'TOP_1_PERCENT';
export type PublicBattlegroundTimeRange =
  | 'CURRENT_BATTLEGROUNDS_PATCH'
  | 'LAST_7_DAYS';
export type PublicBattlegroundStrategySource = 'hsreplay' | 'firestone';

type HeroSelection = {
  mode: PublicBattlegroundHeroMode;
  mmr: Exclude<PublicBattlegroundMmr, 'ALL'>;
  timeRange: PublicBattlegroundTimeRange;
};

type TierListSelection = {
  kind: PublicBattlegroundTierListKind;
  mmr: PublicBattlegroundMmr | null;
  timeRange: PublicBattlegroundTimeRange | null;
  source: PublicBattlegroundStrategySource | null;
};

export type PublicBattlegroundStatisticsSource = {
  loadHeroes: (selection: HeroSelection) => Promise<unknown>;
  loadHeroDetails?: (heroId: string, selection: HeroSelection) => Promise<unknown>;
  loadMinions: () => Promise<unknown>;
  loadMinionHistory?: (dbfId: string) => Promise<unknown>;
  loadSpells?: () => Promise<unknown>;
  loadTierLists: (selection: TierListSelection) => Promise<unknown>;
};

type BattlegroundEntity =
  | 'heroes'
  | `hero:${string}`
  | 'minions'
  | `minion-history:${string}`
  | 'spells'
  | `tier-list:${PublicBattlegroundTierListKind}`;

type VersionedDataset<T> = {
  data: T[];
  meta: {
    mode: 'battlegrounds';
    entity: BattlegroundEntity;
    updatedAt: string | null;
    datasetVersion: string;
    dataStatus: 'fresh' | 'stale';
    sample?: {
      mode?: PublicBattlegroundHeroMode | null;
      mmrPercentile: string | null;
      timeRange: string | null;
      totalDataPoints?: number | null;
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
const HERO_MODES = new Set<PublicBattlegroundHeroMode>(['solo', 'duos']);
const HERO_MMRS = new Set<Exclude<PublicBattlegroundMmr, 'ALL'>>([
  'TOP_50_PERCENT',
  'TOP_20_PERCENT',
  'TOP_5_PERCENT',
  'TOP_1_PERCENT',
]);
const ALL_MMRS = new Set<PublicBattlegroundMmr>(['ALL', ...HERO_MMRS]);
const TIME_RANGES = new Set<PublicBattlegroundTimeRange>([
  'CURRENT_BATTLEGROUNDS_PATCH',
  'LAST_7_DAYS',
]);
const STRATEGY_SOURCES = new Set<PublicBattlegroundStrategySource>(['hsreplay', 'firestone']);
const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_MIN_GAMES = 100_000_000;
const MAX_HISTORY_DAYS = 3650;
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

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<T>,
  fallback: T,
  transform: (value: string) => string = value => value,
): T {
  const normalized = transform(scalar(value));
  if (!normalized) return fallback;
  if (!allowed.has(normalized as T)) throw new PublicBattlegroundStatisticsQueryError();
  return normalized as T;
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

function boolean(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

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

function requiredNumericId(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : String(value ?? '');
  if (!/^\d{1,12}$/.test(normalized) || Number(normalized) <= 0) {
    throw new PublicBattlegroundStatisticsQueryError();
  }
  return normalized;
}

function heroSelection(query: JsonRecord): HeroSelection {
  return {
    mode: enumValue(
      query.mode,
      HERO_MODES,
      'solo',
      value => value.toLocaleLowerCase('en-US'),
    ),
    mmr: enumValue(
      query.mmr,
      HERO_MMRS,
      'TOP_50_PERCENT',
      value => value.toLocaleUpperCase('en-US'),
    ),
    timeRange: enumValue(
      query.timeRange,
      TIME_RANGES,
      'CURRENT_BATTLEGROUNDS_PATCH',
      value => value.toLocaleUpperCase('en-US'),
    ),
  };
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

function serializeCardReference(value: unknown) {
  const source = record(value);
  const nestedCard = record(source.card);
  const cardId = safeEntityId(
    source.cardId
      ?? source.card_id
      ?? source.id
      ?? nestedCard.cardId
      ?? nestedCard.card_id
      ?? nestedCard.id,
  );
  const dbfId = count(
    source.dbfId
      ?? source.dbf_id
      ?? source.dbf
      ?? nestedCard.dbfId
      ?? nestedCard.dbf_id
      ?? nestedCard.dbf,
  );
  const name = text(source.name ?? nestedCard.name);
  if (!cardId && dbfId === null && !name) return null;
  return {
    cardId,
    dbfId,
    name: name || null,
    tavernTier: finite(
      source.tavern_tier
        ?? source.tavernTier
        ?? source.techLevel
        ?? nestedCard.tavern_tier
        ?? nestedCard.tavernTier
        ?? nestedCard.techLevel,
      { minimum: 1, maximum: 7, integer: true },
    ),
  };
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
    cardId: safeEntityId(source.id),
    name,
    tier: safeTier(source.tier),
    isAnomalyAdjusted: boolean(source.anomaly_adjusted ?? source.anomalyAdjusted),
    heroPower: serializeCardReference(source.hero_power ?? source.heroPower),
    keyMinions: (
      Array.isArray(source.key_minions_top3)
        ? source.key_minions_top3
        : Array.isArray(source.keyMinions)
          ? source.keyMinions
          : []
    )
      .map(serializeCardReference)
      .filter((item): item is NonNullable<ReturnType<typeof serializeCardReference>> => Boolean(item))
      .slice(0, 3),
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
      adjustedAveragePlacement: finite(
        source.adjusted_avg_placement ?? source.adjustedAveragePlacement,
        { minimum: 1, maximum: 8 },
      ),
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

function serializeSpell(value: unknown, tavernTier: unknown) {
  const source = record(value);
  const cardId = safeEntityId(source.card_id ?? source.cardId ?? source.id);
  const dbfId = count(source.dbfId ?? source.dbf_id);
  if (!cardId || dbfId === null) return null;
  return {
    cardId,
    dbfId,
    name: text(source.name) || cardId,
    tavernTier: finite(source.tavern_tier ?? source.tavernTier ?? tavernTier, {
      minimum: 1,
      maximum: 7,
      integer: true,
    }),
    metrics: {
      games: count(source.total_played ?? source.totalPlayed),
      averagePlacement: finite(
        source.average_placement ?? source.avgPlacement,
        { minimum: 1, maximum: 8 },
      ),
      averagePlacementWithout: finite(
        source.average_placement_other ?? source.avgPlacementOther,
        { minimum: 1, maximum: 8 },
      ),
      impact: finite(source.impact, { minimum: -8, maximum: 8 }),
    },
  };
}

function serializeHistoryPoint(value: unknown) {
  const source = record(value);
  const observedAt = timestamp(source.fetched_at ?? source.fetchedAt);
  if (!observedAt) return null;
  return {
    observedAt,
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

function serializeHeroSummary(value: unknown) {
  return serializeHero(value);
}

function serializeTavernUpgrade(value: unknown) {
  const source = record(value);
  const turn = count(source.turn);
  const tavernTier = finite(source.tavern_tier ?? source.tavernTier, {
    minimum: 1,
    maximum: 7,
    integer: true,
  });
  if (turn === null || tavernTier === null) return null;
  return {
    turn,
    tavernTier,
    occurrences: count(source.occurrences),
    percentAtTier: percent(source.pct_at_tier ?? source.percentAtTier),
    games: count(source.num_games ?? source.games),
  };
}

function serializeTavernUpgradeByTurn(value: unknown) {
  const source = record(value);
  const turn = count(source.turn);
  const tavernTier = finite(
    source.recommended_tavern_tier ?? source.recommendedTavernTier,
    { minimum: 1, maximum: 7, integer: true },
  );
  if (turn === null || tavernTier === null) return null;
  return {
    turn,
    recommendedTavernTier: tavernTier,
    percentAtTier: percent(source.pct_at_tier ?? source.percentAtTier),
    games: count(source.num_games ?? source.games),
  };
}

function serializeHeroPowerUsage(value: unknown) {
  const source = record(value);
  const turn = count(source.turn);
  if (turn === null) return null;
  return {
    turn,
    tavernTier: finite(source.tavern_tier ?? source.tavernTier, {
      minimum: 1,
      maximum: 7,
      integer: true,
    }),
    gold: count(source.gold),
    medianEndOfRoundTavernTier: finite(
      source.end_of_round_median_tavern_tier ?? source.medianEndOfRoundTavernTier,
      { minimum: 1, maximum: 7 },
    ),
    invocations: count(source.times_invoked ?? source.invocations),
    invocationRatePercent: percent(source.invoked_rate ?? source.invocationRate),
    dataPoints: count(source.total_data_points ?? source.dataPoints),
  };
}

function serializeHeroPowerByTurn(value: unknown) {
  const source = record(value);
  const turn = count(source.turn);
  if (turn === null) return null;
  return {
    turn,
    invocationRatePercent: percent(source.invoked_rate ?? source.invocationRate),
    dataPoints: count(source.total_data_points ?? source.dataPoints),
  };
}

function serializeCombatByTurn(value: unknown) {
  const source = record(value);
  const turn = count(source.combat_round ?? source.combatRound);
  if (turn === null) return null;
  return {
    turn,
    dataPoints: count(source.data_points ?? source.dataPoints),
    winratePercent: percent(source.combat_winrate ?? source.combatWinrate),
  };
}

function serializeLineupMinion(value: unknown) {
  const source = record(value);
  const cardId = safeEntityId(source.id);
  const dbfId = count(source.minion_dbf_id ?? source.dbfId ?? source.dbf_id);
  if (!cardId && dbfId === null) return null;
  return {
    cardId,
    dbfId,
    name: text(source.minion ?? source.name) || null,
    tavernTier: finite(source.tavern_tier ?? source.tavernTier ?? source.techLevel, {
      minimum: 1,
      maximum: 7,
      integer: true,
    }),
    zonePosition: finite(source.zone_position ?? source.zonePosition, {
      minimum: 1,
      maximum: 7,
      integer: true,
    }),
    isPremium: boolean(source.premium),
    hasTaunt: boolean(source.taunt),
    hasPoison: boolean(source.poison),
    hasDivineShield: boolean(source.divine_shield ?? source.divineShield),
    metrics: {
      attack: finite(source.attack, { minimum: 0 }),
      health: finite(source.health, { minimum: 0 }),
    },
  };
}

function serializeFinalFormMinion(value: unknown) {
  const source = record(value);
  const cardId = safeEntityId(source.id);
  const dbfId = count(source.minion_dbf_id ?? source.dbfId ?? source.dbf_id);
  if (!cardId && dbfId === null) return null;
  return {
    cardId,
    dbfId,
    name: text(source.minion ?? source.name) || null,
    tavernTier: finite(source.tavern_tier ?? source.tavernTier, {
      minimum: 1,
      maximum: 7,
      integer: true,
    }),
    metrics: {
      atLeastOnePercent: percent(source.at_least_one ?? source.atLeastOne),
      moreThanOnePercent: percent(source.more_than_one ?? source.moreThanOne),
      atLeastOnePremiumPercent: percent(
        source.at_least_one_premium ?? source.atLeastOnePremium,
      ),
      averageNormalAttack: finite(source.normal_attack_avg ?? source.averageNormalAttack, {
        minimum: 0,
      }),
      averageNormalHealth: finite(source.normal_health_avg ?? source.averageNormalHealth, {
        minimum: 0,
      }),
      averagePremiumAttack: finite(
        source.premium_attack_avg ?? source.averagePremiumAttack,
        { minimum: 0 },
      ),
      averagePremiumHealth: finite(
        source.premium_health_avg ?? source.averagePremiumHealth,
        { minimum: 0 },
      ),
      divineShieldPercent: percent(
        source.divine_shield_buff_freq ?? source.divineShieldFrequency,
      ),
      tauntPercent: percent(source.taunt_buff_freq ?? source.tauntFrequency),
      poisonPercent: percent(source.poison_buff_freq ?? source.poisonFrequency),
      positionDistributionPercent: placementDistribution(
        source.position_freq ?? source.positionDistribution,
      ).slice(0, 7),
    },
  };
}

function serializeComposition(value: unknown) {
  const source = record(value);
  const compositionId = safeEntityId(source.composition_id ?? source.compositionId);
  const name = text(source.name);
  if (!compositionId && !name) return null;
  const lineup = (Array.isArray(source.lineup) ? source.lineup : [])
    .map(serializeLineupMinion)
    .filter((item): item is NonNullable<ReturnType<typeof serializeLineupMinion>> => Boolean(item));
  const finalFormMinions = (
    Array.isArray(source.final_form_minions) ? source.final_form_minions : []
  )
    .map(serializeFinalFormMinion)
    .filter((item): item is NonNullable<ReturnType<typeof serializeFinalFormMinion>> => Boolean(item));
  return {
    compositionId,
    name: name || compositionId,
    isRecent: boolean(source.is_recent ?? source.isRecent),
    sampleDays: count(source.num_days ?? source.sampleDays),
    metrics: {
      games: count(source.num_games ?? source.games),
      averagePlacement: finite(source.avg_placement ?? source.averagePlacement, {
        minimum: 1,
        maximum: 8,
      }),
      placementDistributionPercent: placementDistribution(
        source.placement_distribution ?? source.placementDistribution,
      ),
      confidenceInterval: finite(
        source.confidence_interval ?? source.confidenceInterval,
        { minimum: 0, maximum: 8 },
      ),
      popularityPercent: percent(source.popularity_value ?? source.popularity),
      firstPlacePopularityPercent: percent(
        source.popularity_first_place ?? source.firstPlacePopularity,
      ),
      topFourPopularityPercent: percent(
        source.popularity_top_4 ?? source.topFourPopularity,
      ),
    },
    lineup,
    finalFormMinions,
  };
}

function latestTimestamp(values: unknown[]): string | null {
  return values
    .map(timestamp)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function serializeAsOf(value: unknown): Record<string, string> {
  const source = record(value);
  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(source)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/i.test(key)) continue;
    const normalized = timestamp(rawValue);
    if (normalized) result[key] = normalized;
  }
  return result;
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
  const bestCompositionId = safeEntityId(
    source.bestCompositionId ?? source.best_composition_id,
  );
  const bestCompositionName = text(source.bestComp ?? source.bestComposition);
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
    bestComposition: bestCompositionId || bestCompositionName
      ? { id: bestCompositionId, name: bestCompositionName || null }
      : null,
    difficulty: text(source.difficulty, 40) || null,
    size: text(source.size, 16) || null,
    cost: finite(source.cost, { minimum: 0, maximum: 100, integer: true }),
    race: text(source.race, 40) || null,
    races: (Array.isArray(source.races) ? source.races : [])
      .map(value => text(value, 40))
      .filter(Boolean)
      .slice(0, 20),
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
      gamesIsMinimum: boolean(source.gamesIsMinimum ?? source.games_is_minimum),
      metricValue: finite(source.metricValue ?? source.metric_value, {
        minimum: -1_000_000_000,
        maximum: 1_000_000_000,
      }),
      placementDistributionPercent: placementDistribution(
        source.placementDistribution ?? source.placement_distribution,
      ),
    },
  };
}

function sampleFrom(value: unknown) {
  const source = record(value);
  return {
    mode: text(source.mode, 16).toLocaleLowerCase('en-US') === 'duos'
      ? 'duos' as const
      : text(source.mode, 16).toLocaleLowerCase('en-US') === 'solo'
        ? 'solo' as const
        : null,
    mmrPercentile: text(source.mmr_percentile ?? source.mmrPercentile, 80) || null,
    timeRange: text(source.time_range ?? source.timeRange, 80) || null,
    totalDataPoints: count(source.total_data_points ?? source.totalDataPoints),
  };
}

/**
 * Builds the allowlisted Battlegrounds statistics surface. Source URLs,
 * scraper status, raw snapshots, media and strategy card lists stay private.
 */
export function createPublicBattlegroundStatistics(source: PublicBattlegroundStatisticsSource) {
  return {
    async heroes(query: JsonRecord) {
      const selection = heroSelection(query);
      const selectedTier = tierValue(query.tier);
      const minPickRate = decimal(query.minPickRate, 0, 0, 100);
      const payload = record(await source.loadHeroes(selection));
      const view = record(payload.view);
      const updatedAt = timestamp(payload.fetched_at ?? payload.fetchedAt);
      const sample = {
        ...sampleFrom(view.filters),
        mode: text(view.mode, 16).toLocaleLowerCase('en-US') === 'duos'
          ? 'duos' as const
          : selection.mode,
      };
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
      return paginate(query, result, [selection, selectedTier, minPickRate]);
    },

    async heroDetail(heroIdValue: unknown, query: JsonRecord) {
      const heroId = requiredNumericId(heroIdValue);
      const selection = heroSelection(query);
      if (!source.loadHeroDetails) return null;
      const payload = record(await source.loadHeroDetails(heroId, selection));
      const stats = record(payload.stats);
      const hero = serializeHeroSummary(stats.hero);
      if (!hero) return null;
      const asOf = serializeAsOf(stats.as_of ?? stats.asOf);
      const compositions = (Array.isArray(stats.compositions) ? stats.compositions : [])
        .map(serializeComposition)
        .filter((item): item is NonNullable<ReturnType<typeof serializeComposition>> => Boolean(item));
      const bestComposition = serializeComposition(stats.best_composition ?? stats.bestComposition);
      const data = {
        hero,
        sample: {
          ...sampleFrom(stats.filters),
          mode: text(stats.mode, 16).toLocaleLowerCase('en-US') === 'duos'
            ? 'duos' as const
            : selection.mode,
        },
        asOf,
        tavernUpgrades: (Array.isArray(stats.tavern_up) ? stats.tavern_up : [])
          .map(serializeTavernUpgrade)
          .filter((item): item is NonNullable<ReturnType<typeof serializeTavernUpgrade>> => Boolean(item)),
        tavernUpgradeByTurn: (
          Array.isArray(stats.tavern_up_by_turn) ? stats.tavern_up_by_turn : []
        )
          .map(serializeTavernUpgradeByTurn)
          .filter((item): item is NonNullable<ReturnType<typeof serializeTavernUpgradeByTurn>> => Boolean(item)),
        heroPowerUsage: (Array.isArray(stats.hero_power) ? stats.hero_power : [])
          .map(serializeHeroPowerUsage)
          .filter((item): item is NonNullable<ReturnType<typeof serializeHeroPowerUsage>> => Boolean(item)),
        heroPowerByTurn: (
          Array.isArray(stats.hero_power_by_turn) ? stats.hero_power_by_turn : []
        )
          .map(serializeHeroPowerByTurn)
          .filter((item): item is NonNullable<ReturnType<typeof serializeHeroPowerByTurn>> => Boolean(item)),
        combatByTurn: (Array.isArray(stats.combat_winrate) ? stats.combat_winrate : [])
          .map(serializeCombatByTurn)
          .filter((item): item is NonNullable<ReturnType<typeof serializeCombatByTurn>> => Boolean(item)),
        compositions,
        bestComposition,
      };
      const updatedAt = timestamp(payload.fetched_at ?? payload.fetchedAt)
        ?? latestTimestamp(Object.values(asOf));
      const result = versioned(`hero:${heroId}`, updatedAt, [data], data.sample);
      return { ...result, data };
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

    async minionHistory(dbfIdValue: unknown, query: JsonRecord) {
      const dbfId = requiredNumericId(dbfIdValue);
      if (!source.loadMinionHistory) return null;
      const days = integer(query.days, 0, MAX_HISTORY_DAYS);
      const payload = record(await source.loadMinionHistory(dbfId));
      const minion = record(payload.minion);
      const cardId = safeEntityId(minion.card_id ?? minion.cardId);
      if (!cardId) return null;
      const cutoff = days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
      const history = (Array.isArray(payload.history) ? payload.history : [])
        .map(serializeHistoryPoint)
        .filter((item): item is NonNullable<ReturnType<typeof serializeHistoryPoint>> => Boolean(item))
        .filter(item => cutoff === null || Date.parse(item.observedAt) >= cutoff)
        .sort((left, right) => left.observedAt.localeCompare(right.observedAt, 'en'));
      const data = {
        minion: {
          dbfId: count(minion.dbf_id ?? minion.dbfId),
          cardId,
          name: text(minion.name) || cardId,
          localizedName: text(minion.name_ru ?? minion.localizedName) || null,
          tavernTier: finite(minion.tavern_tier ?? minion.tavernTier, {
            minimum: 1,
            maximum: 7,
            integer: true,
          }),
          firstSeenAt: timestamp(minion.first_seen_at ?? minion.firstSeenAt),
          updatedAt: timestamp(minion.updated_at ?? minion.updatedAt),
        },
        history,
      };
      const updatedAt = data.minion.updatedAt ?? history.at(-1)?.observedAt ?? null;
      const result = versioned(`minion-history:${dbfId}`, updatedAt, [data]);
      return { ...result, data };
    },

    async spells(query: JsonRecord) {
      if (!source.loadSpells) return null;
      const tavernTier = integer(query.tavernTier, 0, 7);
      if (tavernTier === 0 && scalar(query.tavernTier)) {
        throw new PublicBattlegroundStatisticsQueryError();
      }
      const minGames = integer(query.minGames, 0, MAX_MIN_GAMES);
      const payload = record(await source.loadSpells());
      const view = record(payload.view);
      const data: NonNullable<ReturnType<typeof serializeSpell>>[] = [];
      for (const [tier, values] of Object.entries(record(view.tiers))) {
        if (!Array.isArray(values)) continue;
        for (const value of values) {
          const item = serializeSpell(value, tier);
          if (item) data.push(item);
        }
      }
      const filtered = data
        .filter(item => (
          (!tavernTier || item.tavernTier === tavernTier)
          && (item.metrics.games ?? 0) >= minGames
        ))
        .sort((left, right) => (
          (right.metrics.impact ?? -Infinity) - (left.metrics.impact ?? -Infinity)
          || (right.metrics.games ?? -1) - (left.metrics.games ?? -1)
          || left.cardId.localeCompare(right.cardId, 'en')
        ));
      const updatedAt = timestamp(
        view.last_update_date
          ?? view.lastUpdateDate
          ?? payload.fetched_at
          ?? payload.fetchedAt,
      );
      const sample = {
        mode: null,
        mmrPercentile: null,
        timeRange: null,
        totalDataPoints: count(view.total_data_points ?? view.totalDataPoints),
      };
      const result = versioned('spells', updatedAt, filtered, sample);
      return paginate(query, result, [tavernTier, minGames]);
    },

    async tierList(kindValue: unknown, query: JsonRecord) {
      const kind = tierListKindValue(kindValue);
      const selectedTier = tierValue(query.tier);
      const minGames = integer(query.minGames, 0, MAX_MIN_GAMES);
      const mmr = kind === 'trinkets'
        ? enumValue(
            query.mmr,
            ALL_MMRS,
            'TOP_1_PERCENT',
            value => value.toLocaleUpperCase('en-US'),
          )
        : null;
      const timeRange = kind === 'trinkets'
        ? enumValue(
            query.timeRange,
            TIME_RANGES,
            'LAST_7_DAYS',
            value => value.toLocaleUpperCase('en-US'),
          )
        : null;
      const strategySource = kind === 'strategies'
        ? enumValue(
            query.source,
            STRATEGY_SOURCES,
            'firestone',
            value => value.toLocaleLowerCase('en-US'),
          )
        : null;
      const selection = { kind, mmr, timeRange, source: strategySource };
      const payload = record(await source.loadTierLists(selection));
      const list = payload.list === kind
        ? payload
        : record(record(payload.lists)[kind]);
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
      const sample = {
        mode: null,
        mmrPercentile: text(list.mmr, 80) || mmr,
        timeRange: text(list.timeRange, 80) || timeRange,
      };
      const result = versioned(`tier-list:${kind}`, updatedAt, filtered, sample);
      return paginate(query, result, [selection, selectedTier, minGames]);
    },
  };
}
