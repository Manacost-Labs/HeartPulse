import {
  DatasetContractError,
  type DatasetEnvelope,
  type DatasetMode,
  parseDatasetEnvelope,
} from './datasetEnvelope.js';

export const STANDARD_META_DATASET = 'standard-meta';
export const STANDARD_META_MEDIA_TYPE = 'application/vnd.manacost.standard-meta.v1+json';

export type StandardMetaFormat = 'standard' | 'wild';
// Keep the legacy identifiers in the transport type so old stored rows can be
// inspected and rejected explicitly. RANKS below is the serving contract.
export type StandardMetaRank = 'all' | 'diamond_all' | 'diamond' | 'diamond_legend' | 'legend'
  | 'top_5k' | 'top_500' | 'top_100' | 'top_legend';
export type StandardMetaServingRank = Exclude<
  StandardMetaRank,
  'diamond_all' | 'top_500' | 'top_100'
>;
export type StandardMetaPeriod = 'past_day' | 'past_3_days' | 'past_week' | 'past_2_weeks'
  | 'violet_hold' | `patch_${string}`;
export type StandardMetaCoin = 'any_player';
export type StandardMetaMinGames = 100 | 250 | 500 | 1000 | 2500 | 5000;
export type StandardMetaClass = 'deathknight' | 'demonhunter' | 'druid' | 'hunter' | 'mage' | 'paladin'
  | 'priest' | 'rogue' | 'shaman' | 'warlock' | 'warrior';

export type StandardMetaItem = {
  id: string;
  slug: string;
  archetype: string;
  archetypeLabel: string;
  translated: boolean;
  classKey: StandardMetaClass | null;
  winrate: number | null;
  popularity: number | null;
  games: number | null;
  turns: number | null;
  durationMinutes: number | null;
  climbingSpeed: number | null;
};

export type StandardMetaData = {
  format: StandardMetaFormat;
  formatLabel: string;
  rank: StandardMetaServingRank;
  rankLabel: string;
  period: StandardMetaPeriod;
  availablePeriods: StandardMetaPeriod[];
  currentPatchPeriod: StandardMetaPeriod | null;
  coin: StandardMetaCoin;
  minGames: StandardMetaMinGames;
  source: string;
  sourceId?: string;
  sourceUrl: string;
  translationSource: string;
  updatedAt: string | null;
  items: StandardMetaItem[];
};

export type StandardMetaEnvelope = DatasetEnvelope<StandardMetaData>;

const FORMATS = new Set<StandardMetaFormat>(['standard', 'wild']);
const RANKS = new Set<StandardMetaServingRank>([
  'all', 'diamond', 'diamond_legend', 'legend', 'top_5k', 'top_legend',
]);
const FIXED_PERIODS = new Set<StandardMetaPeriod>([
  'past_day',
  'past_3_days',
  'past_week',
  'past_2_weeks',
  'violet_hold',
]);
const DEFAULT_PERIODS: StandardMetaPeriod[] = ['past_day', 'past_3_days', 'past_week', 'past_2_weeks'];
const COINS = new Set<StandardMetaCoin>(['any_player']);
const MIN_GAMES = new Set<StandardMetaMinGames>([100, 250, 500, 1000, 2500, 5000]);
const CLASSES = new Set<StandardMetaClass>([
  'deathknight', 'demonhunter', 'druid', 'hunter', 'mage', 'paladin',
  'priest', 'rogue', 'shaman', 'warlock', 'warrior',
]);

function invalid(message: string): never {
  throw new DatasetContractError('INVALID_DATA', `standard-meta: ${message}`);
}

function isPeriod(value: unknown): value is StandardMetaPeriod {
  return typeof value === 'string'
    && (FIXED_PERIODS.has(value as StandardMetaPeriod) || /^patch_\d+(?:\.\d+){1,3}$/.test(value));
}

function dataRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function dataString(value: unknown, label: string, maximum = 240, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > maximum) {
    invalid(`${label} must be a valid string`);
  }
  return value;
}

function metric(value: unknown, label: string, minimum: number, maximum: number): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    invalid(`${label} is outside ${minimum}..${maximum}`);
  }
  return value;
}

function games(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    invalid(`${label} must be a non-negative integer or null`);
  }
  return value;
}

function parseItem(value: unknown, index: number): StandardMetaItem {
  const item = dataRecord(value, `items[${index}]`);
  const classKey = item.classKey === null ? null : dataString(item.classKey, `items[${index}].classKey`, 32);
  if (classKey !== null && !CLASSES.has(classKey as StandardMetaClass)) invalid(`items[${index}].classKey is unsupported`);
  if (typeof item.translated !== 'boolean') invalid(`items[${index}].translated must be boolean`);
  return {
    id: dataString(item.id, `items[${index}].id`, 80),
    slug: dataString(item.slug, `items[${index}].slug`, 80),
    archetype: dataString(item.archetype, `items[${index}].archetype`, 160),
    archetypeLabel: dataString(item.archetypeLabel, `items[${index}].archetypeLabel`, 160),
    translated: item.translated,
    classKey: classKey as StandardMetaClass | null,
    winrate: metric(item.winrate, `items[${index}].winrate`, 0, 100),
    popularity: metric(item.popularity, `items[${index}].popularity`, 0, 100),
    games: games(item.games, `items[${index}].games`),
    turns: metric(item.turns, `items[${index}].turns`, 0, 100),
    durationMinutes: metric(item.durationMinutes, `items[${index}].durationMinutes`, 0, 240),
    climbingSpeed: metric(item.climbingSpeed, `items[${index}].climbingSpeed`, -1000, 1000),
  };
}

export function parseStandardMetaData(value: unknown): StandardMetaData {
  const data = dataRecord(value, 'data');
  if (!FORMATS.has(data.format as StandardMetaFormat)) invalid('format is unsupported');
  if (!RANKS.has(data.rank as StandardMetaServingRank)) invalid('rank is unsupported');
  const period = (data.period ?? 'past_day') as StandardMetaPeriod;
  const coin = (data.coin ?? 'any_player') as StandardMetaCoin;
  const minGames = Number(data.minGames ?? 100) as StandardMetaMinGames;
  if (!isPeriod(period)) invalid('period is unsupported');
  if (!COINS.has(coin)) invalid('coin is unsupported');
  if (!MIN_GAMES.has(minGames)) invalid('minGames is unsupported');
  if (!Array.isArray(data.items)) invalid('items must be an array');
  if (data.items.length > 500) invalid('items exceeds the 500-record safety limit');
  const items = data.items.map(parseItem);
  const ids = new Set<string>();
  const archetypes = new Set<string>();
  for (const item of items) {
    const normalizedArchetype = item.archetype.trim().toLocaleLowerCase('en-US');
    if (ids.has(item.id)) invalid(`duplicate item id ${item.id}`);
    if (archetypes.has(normalizedArchetype)) invalid(`duplicate archetype ${item.archetype}`);
    ids.add(item.id);
    archetypes.add(normalizedArchetype);
  }
  const updatedAt = data.updatedAt === null ? null : dataString(data.updatedAt, 'updatedAt', 64);
  if (updatedAt !== null && !Number.isFinite(Date.parse(updatedAt))) invalid('updatedAt must be an ISO date or null');
  const rawAvailablePeriods = data.availablePeriods ?? DEFAULT_PERIODS;
  if (!Array.isArray(rawAvailablePeriods) || rawAvailablePeriods.length > 12) {
    invalid('availablePeriods must be an array with at most 12 entries');
  }
  const availablePeriods = rawAvailablePeriods.map((value, index) => {
    if (!isPeriod(value)) invalid(`availablePeriods[${index}] is unsupported`);
    return value;
  });
  if (!availablePeriods.includes(period)) availablePeriods.push(period);
  const rawCurrentPatchPeriod = data.currentPatchPeriod ?? null;
  if (rawCurrentPatchPeriod !== null && (
    !isPeriod(rawCurrentPatchPeriod)
    || !rawCurrentPatchPeriod.startsWith('patch_')
    || !availablePeriods.includes(rawCurrentPatchPeriod)
  )) {
    invalid('currentPatchPeriod must reference an available patch period');
  }
  return {
    format: data.format as StandardMetaFormat,
    formatLabel: dataString(data.formatLabel, 'formatLabel', 80),
    rank: data.rank as StandardMetaServingRank,
    rankLabel: dataString(data.rankLabel, 'rankLabel', 80),
    period,
    availablePeriods,
    currentPatchPeriod: rawCurrentPatchPeriod as StandardMetaPeriod | null,
    coin,
    minGames,
    source: dataString(data.source, 'source', 80),
    ...(typeof data.sourceId === 'string' && data.sourceId.trim()
      ? { sourceId: dataString(data.sourceId, 'sourceId', 160) }
      : {}),
    sourceUrl: dataString(data.sourceUrl, 'sourceUrl', 500, true),
    translationSource: dataString(data.translationSource, 'translationSource', 120, true),
    updatedAt,
    items,
  };
}

export function assessStandardMetaData(data: StandardMetaData, mode: DatasetMode): {
  partial: boolean;
  quality: StandardMetaEnvelope['quality'];
} {
  // Narrow rank/period combinations can legitimately contain no archetypes.
  // Keep the empty result visible so the client can render its dedicated
  // empty state instead of turning a successful upstream response into 502.
  const minimumItems = mode === 'early' ? 1 : 0;
  if (data.items.length < minimumItems) invalid(`${mode} snapshot has only ${data.items.length} items`);
  if (!data.updatedAt) invalid('published snapshot has no source timestamp');

  const measuredWinrates = data.items.filter(item => item.winrate !== null);
  const impossibleSampleWinrate = measuredWinrates.find(item => (
    (item.games ?? 0) >= 100 && (item.winrate === 0 || item.winrate === 100)
  ));
  if (impossibleSampleWinrate) {
    invalid(`${impossibleSampleWinrate.archetype} has an implausible exact winrate for ${impossibleSampleWinrate.games} games`);
  }
  const suspiciousWinrates = measuredWinrates.filter(item => (
    (item.games ?? 0) >= 100 && ((item.winrate as number) >= 97 || (item.winrate as number) <= 3)
  ));
  if (measuredWinrates.length >= 5 && suspiciousWinrates.length >= Math.ceil(measuredWinrates.length / 2)) {
    invalid('widespread extreme winrates failed plausibility gate');
  }
  const measuredPopularity = data.items.filter(item => item.popularity !== null);
  const suspiciousPopularity = measuredPopularity.filter(item => (item.popularity as number) >= 95);
  if (measuredPopularity.length >= 5 && suspiciousPopularity.length >= Math.ceil(measuredPopularity.length / 2)) {
    invalid('widespread extreme popularity failed plausibility gate');
  }

  const metricSlots = data.items.length * 6;
  const presentMetrics = data.items.reduce((total, item) => total + [
    item.winrate,
    item.popularity,
    item.games,
    item.turns,
    item.durationMinutes,
    item.climbingSpeed,
  ].filter(value => value !== null).length, 0);
  const coverage = metricSlots === 0 ? 1 : Math.round((presentMetrics / metricSlots) * 10_000) / 10_000;
  const warnings: string[] = [];
  if (mode === 'early') warnings.push('Ранняя мета: выборка и позиции ещё могут заметно измениться');
  if (data.items.length === 0) warnings.push('Нет архетипов с выбранным минимальным количеством игр');
  if (coverage < 0.95) warnings.push('Часть метрик источника пока недоступна');
  if (mode === 'stable' && coverage < 0.9) invalid(`stable metric coverage ${coverage} is below 0.9`);
  const partial = mode === 'early' || coverage < 0.95;
  return {
    partial,
    quality: {
      status: warnings.length ? 'warning' : 'pass',
      warnings,
      sampleSize: data.items.reduce((total, item) => total + (item.games ?? 0), 0),
      coverage,
    },
  };
}

export function parseStandardMetaEnvelope(value: unknown, now = Date.now()): StandardMetaEnvelope {
  const envelope = parseDatasetEnvelope(value, {
    dataset: STANDARD_META_DATASET,
    parseData: parseStandardMetaData,
    now,
  });
  const expected = assessStandardMetaData(envelope.data, envelope.mode);
  const qualityMatches = envelope.quality.status === expected.quality.status
    && envelope.quality.sampleSize === expected.quality.sampleSize
    && envelope.quality.coverage === expected.quality.coverage
    && envelope.quality.warnings.length === expected.quality.warnings.length
    && envelope.quality.warnings.every((warning, index) => warning === expected.quality.warnings[index]);
  if (envelope.partial !== expected.partial || !qualityMatches) {
    invalid('envelope quality assessment does not match its data');
  }
  return envelope;
}

export function parseStandardMetaApiResponse(value: unknown, now = Date.now()): {
  data: StandardMetaData;
  envelope: StandardMetaEnvelope | null;
  legacy: boolean;
} {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (candidate && Object.prototype.hasOwnProperty.call(candidate, 'schemaVersion')) {
    const envelope = parseStandardMetaEnvelope(value, now);
    return { data: envelope.data, envelope, legacy: false };
  }
  const data = parseStandardMetaData(value);
  // A legacy server had no mode/freshness envelope. Treat it as stable and run
  // the same plausibility gates rather than allowing N-1 compatibility to
  // reintroduce the historic 97–100% corruption.
  assessStandardMetaData(data, 'stable');
  return { data, envelope: null, legacy: true };
}
