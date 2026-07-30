import { createHash } from 'node:crypto';
import type {
  ConstructedArchetypeAnalysis,
  ConstructedArchetypeCatalog,
  ConstructedArchetypeFormat,
  ConstructedArchetypeHistoryPoint,
  ConstructedArchetypeItem,
} from '../../constructedArchetypeRoutes.js';
import { createStandardMetaEnvelope } from '../../standardMetaDataset.js';
import type {
  StandardMetaCoin,
  StandardMetaMinGames,
  StandardMetaPeriod,
  StandardMetaRank,
} from '../../../shared/standardMetaContract.js';
import {
  createPublicResourceLinks,
  type PublicArchetypeLinks,
  type PublicResourceLinkOptions,
} from './resourceLinks.js';

export type PublicMetaStatisticsFormat = 'standard' | 'wild';
export type PublicMetaStatisticsRank =
  | 'all'
  | 'diamond'
  | 'diamond_4_1'
  | 'diamond_to_legend'
  | 'legend'
  | 'top_5000'
  | 'top_1000'
  | 'top_500'
  | 'top_100';
export type PublicMetaStatisticsPeriod = '1d' | '3d' | '7d' | '14d' | 'patch';

type JsonRecord = Record<string, unknown>;

export type PublicMetaStatisticsSource = {
  loadMeta: (
    format: PublicMetaStatisticsFormat,
    rank: StandardMetaRank,
    period: StandardMetaPeriod,
    coin: StandardMetaCoin,
    minGames: StandardMetaMinGames,
  ) => Promise<unknown>;
  loadCatalog: (format: ConstructedArchetypeFormat) => Promise<ConstructedArchetypeCatalog>;
  loadHistory: (
    format: ConstructedArchetypeFormat,
    archetype: string,
  ) => Promise<ConstructedArchetypeHistoryPoint[]>;
  loadAnalysis: (
    format: ConstructedArchetypeFormat,
    archetype: string,
  ) => Promise<ConstructedArchetypeAnalysis | null>;
};

type PublicMetaSlice = {
  format: PublicMetaStatisticsFormat;
  rank: PublicMetaStatisticsRank;
  sourceRank: StandardMetaRank;
  period: PublicMetaStatisticsPeriod;
  minGames: StandardMetaMinGames;
};

type PublicMetaArchetype = {
  archetypeId: string;
  slug: string;
  name: string;
  localizedName: string;
  translated: boolean;
  classId: string | null;
  metrics: {
    winratePercent: number | null;
    popularityPercent: number | null;
    games: number | null;
    averageTurns: number | null;
    averageDurationMinutes: number | null;
    climbingSpeedStarsPerHour: number | null;
  };
  links: PublicArchetypeLinks;
};

type PublicArchetypeStatistics = Omit<PublicMetaArchetype, 'archetypeId'> & {
  format: PublicMetaStatisticsFormat;
  deckCount: number;
};

type PublicArchetypeHistoryPoint = {
  recordedAt: string;
  metrics: PublicMetaArchetype['metrics'];
};

type VersionedMeta = {
  updatedAt: string | null;
  datasetVersion: string;
  dataStatus: 'fresh' | 'stale';
};

export class PublicMetaStatisticsQueryError extends Error {
  constructor() {
    super('Meta statistics query is invalid');
    this.name = 'PublicMetaStatisticsQueryError';
  }
}

const FORMATS = new Set<PublicMetaStatisticsFormat>(['standard', 'wild']);
const RANKS = new Set<PublicMetaStatisticsRank>([
  'all',
  'diamond',
  'diamond_4_1',
  'diamond_to_legend',
  'legend',
  'top_5000',
  'top_1000',
  'top_500',
  'top_100',
]);
const PERIODS = new Set<PublicMetaStatisticsPeriod>(['1d', '3d', '7d', '14d', 'patch']);
const MIN_GAMES = new Set<StandardMetaMinGames>([100, 250, 500, 1000, 2500, 5000]);
const RANK_MAP: Record<PublicMetaStatisticsRank, StandardMetaRank> = {
  all: 'all',
  diamond: 'diamond_all',
  diamond_4_1: 'diamond',
  diamond_to_legend: 'diamond_legend',
  legend: 'legend',
  top_5000: 'top_5k',
  top_1000: 'top_legend',
  top_500: 'top_500',
  top_100: 'top_100',
};
const PERIOD_MAP: Record<Exclude<PublicMetaStatisticsPeriod, 'patch'>, StandardMetaPeriod> = {
  '1d': 'past_day',
  '3d': 'past_3_days',
  '7d': 'past_week',
  '14d': 'past_2_weeks',
};
const ARCHETYPE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,89}$/;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const DEFAULT_HISTORY_DAYS = 90;
const MIN_HISTORY_DAYS = 7;
const MAX_HISTORY_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;
const FRESH_FOR_MS = 24 * 60 * 60 * 1000;
const PATCH_CACHE_MS = 5 * 60 * 1000;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function scalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string') throw new PublicMetaStatisticsQueryError();
  return value.trim();
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  const normalized = scalar(value).toLocaleLowerCase('en-US') as T;
  if (!normalized) return fallback;
  if (!allowed.has(normalized)) throw new PublicMetaStatisticsQueryError();
  return normalized;
}

function positiveInteger(value: unknown, fallback: number, maximum: number, minimum = 1): number {
  const normalized = scalar(value);
  if (!normalized) return fallback;
  if (!/^[1-9]\d{0,3}$/.test(normalized)) throw new PublicMetaStatisticsQueryError();
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new PublicMetaStatisticsQueryError();
  }
  return parsed;
}

function parseSlice(query: JsonRecord): PublicMetaSlice {
  const rank = enumValue(query.rank, RANKS, 'legend');
  const minGames = positiveInteger(query.minGames, 100, 5000, 100) as StandardMetaMinGames;
  if (!MIN_GAMES.has(minGames)) throw new PublicMetaStatisticsQueryError();
  return {
    format: enumValue(query.format, FORMATS, 'standard'),
    rank,
    sourceRank: RANK_MAP[rank],
    period: enumValue(query.period, PERIODS, '1d'),
    minGames,
  };
}

function archetypeSlug(value: unknown): string {
  const normalized = scalar(value).toLocaleLowerCase('en-US');
  if (!ARCHETYPE_SLUG_PATTERN.test(normalized)) throw new PublicMetaStatisticsQueryError();
  return normalized;
}

function sourceArchetypeSlug(value: unknown): string {
  const normalized = typeof value === 'string'
    ? value.trim().toLocaleLowerCase('en-US')
    : '';
  if (!ARCHETYPE_SLUG_PATTERN.test(normalized)) {
    throw new Error('Authoritative archetype slug is invalid');
  }
  return normalized;
}

function finite(
  value: unknown,
  options?: { minimum?: number; maximum?: number; integer?: boolean },
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (options?.integer && !Number.isSafeInteger(parsed)) return null;
  if (options?.minimum !== undefined && parsed < options.minimum) return null;
  if (options?.maximum !== undefined && parsed > options.maximum) return null;
  return parsed;
}

const percent = (value: unknown) => finite(value, { minimum: 0, maximum: 100 });
const count = (value: unknown) => finite(value, { minimum: 0, integer: true });
const timestamp = (value: unknown): string | null => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

function text(value: unknown, maximum = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function metaMetrics(source: JsonRecord): PublicMetaArchetype['metrics'] {
  return {
    winratePercent: percent(source.winrate),
    popularityPercent: percent(source.popularity),
    games: count(source.games),
    averageTurns: finite(source.turns, { minimum: 0, maximum: 100 }),
    averageDurationMinutes: finite(source.durationMinutes, { minimum: 0, maximum: 240 }),
    climbingSpeedStarsPerHour: finite(source.climbingSpeed, { minimum: -1000, maximum: 1000 }),
  };
}

function serializeMetaArchetype(
  value: unknown,
  format: PublicMetaStatisticsFormat,
  links: ReturnType<typeof createPublicResourceLinks>,
): PublicMetaArchetype {
  const source = record(value);
  const slug = sourceArchetypeSlug(source.slug);
  return {
    archetypeId: text(source.id, 80) || slug,
    slug,
    name: text(source.archetype),
    localizedName: text(source.archetypeLabel),
    translated: source.translated === true,
    classId: text(source.classKey, 32) || null,
    metrics: metaMetrics(source),
    links: links.archetype(format, slug),
  };
}

function serializeArchetypeStatistics(
  item: ConstructedArchetypeItem,
  links: ReturnType<typeof createPublicResourceLinks>,
): PublicArchetypeStatistics {
  const source = record(item);
  const { archetypeId: _archetypeId, ...serialized } = serializeMetaArchetype({
    ...source,
    id: source.slug,
  }, item.format, links);
  return {
    ...serialized,
    format: item.format,
    deckCount: count(item.deckCount) ?? 0,
  };
}

function serializeHistoryPoint(value: unknown): PublicArchetypeHistoryPoint {
  const source = record(value);
  const recordedAt = timestamp(source.recordedAt);
  if (!recordedAt) throw new Error('Authoritative archetype history timestamp is invalid');
  return { recordedAt, metrics: metaMetrics(source) };
}

function dataStatus(value: unknown): 'fresh' | 'stale' {
  const updatedAt = timestamp(value);
  return updatedAt && Date.now() - Date.parse(updatedAt) <= FRESH_FOR_MS ? 'fresh' : 'stale';
}

function datasetVersion(prefix: string, value: unknown): string {
  return `${prefix}-${createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 20)}`;
}

function cacheSource(status: 'fresh' | 'stale'): 'fresh' | 'LKG' {
  return status === 'fresh' ? 'fresh' : 'LKG';
}

function publicPeriodPatch(value: StandardMetaPeriod | null): string | null {
  return value?.startsWith('patch_') ? value.slice('patch_'.length) : null;
}

function encodeCursor(slice: PublicMetaSlice, version: string, offset: number): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    f: slice.format,
    r: slice.rank,
    p: slice.period,
    m: slice.minGames,
    d: version,
    o: offset,
  })).toString('base64url');
}

function decodeCursor(
  value: unknown,
  slice: PublicMetaSlice,
  version: string,
): number {
  const encoded = scalar(value);
  if (!encoded) return 0;
  if (!/^[A-Za-z0-9_-]{12,500}$/.test(encoded)) throw new PublicMetaStatisticsQueryError();
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    if (Buffer.from(decoded).toString('base64url') !== encoded) {
      throw new PublicMetaStatisticsQueryError();
    }
    const cursor = record(JSON.parse(decoded));
    const offset = Number(cursor.o);
    if (cursor.v !== 1
      || cursor.f !== slice.format
      || cursor.r !== slice.rank
      || cursor.p !== slice.period
      || cursor.m !== slice.minGames
      || cursor.d !== version
      || !Number.isSafeInteger(offset)
      || offset < 0) {
      throw new PublicMetaStatisticsQueryError();
    }
    return offset;
  } catch (error) {
    if (error instanceof PublicMetaStatisticsQueryError) throw error;
    throw new PublicMetaStatisticsQueryError();
  }
}

function compareMetaArchetypes(left: PublicMetaArchetype, right: PublicMetaArchetype): number {
  const popularity = (right.metrics.popularityPercent ?? -1) - (left.metrics.popularityPercent ?? -1);
  if (popularity !== 0) return popularity;
  const games = (right.metrics.games ?? -1) - (left.metrics.games ?? -1);
  return games || left.slug.localeCompare(right.slug, 'en');
}

/**
 * Exposes only normalized aggregates from the protected meta sources. Provider
 * URLs, raw provenance, deck codes and source-specific payload fields are
 * deliberately excluded at this boundary.
 */
export function createPublicMetaStatistics(
  source: PublicMetaStatisticsSource,
  options: PublicResourceLinkOptions = {},
) {
  const links = createPublicResourceLinks(options);
  const metaCache = new Map<string, { version: string; items: PublicMetaArchetype[] }>();
  const patchCache = new Map<string, { period: StandardMetaPeriod; expiresAt: number }>();

  const loadMeta = async (slice: PublicMetaSlice) => {
    const patchKey = `${slice.format}:${slice.sourceRank}:${slice.minGames}`;
    let sourcePeriod: StandardMetaPeriod;
    if (slice.period === 'patch') {
      const cachedPatch = patchCache.get(patchKey);
      sourcePeriod = cachedPatch && cachedPatch.expiresAt > Date.now()
        ? cachedPatch.period
        : 'past_day';
      if (sourcePeriod === 'past_day') {
        const discovery = createStandardMetaEnvelope(await source.loadMeta(
          slice.format,
          slice.sourceRank,
          'past_day',
          'any_player',
          slice.minGames,
        ));
        sourcePeriod = discovery.data.currentPatchPeriod ?? 'past_day';
        if (!sourcePeriod.startsWith('patch_')) {
          throw new Error('Current patch meta is unavailable');
        }
        patchCache.set(patchKey, {
          period: sourcePeriod,
          expiresAt: Date.now() + PATCH_CACHE_MS,
        });
      }
    } else {
      sourcePeriod = PERIOD_MAP[slice.period];
    }
    return createStandardMetaEnvelope(await source.loadMeta(
      slice.format,
      slice.sourceRank,
      sourcePeriod,
      'any_player',
      slice.minGames,
    ));
  };

  const findArchetype = async (format: PublicMetaStatisticsFormat, slug: string) => {
    const catalog = await source.loadCatalog(format);
    const item = catalog.items.find(candidate => candidate.slug === slug) ?? null;
    return { catalog, item };
  };

  return {
    async list(query: JsonRecord) {
      const slice = parseSlice(query);
      const limit = positiveInteger(query.limit, DEFAULT_LIMIT, MAX_LIMIT);
      const envelope = await loadMeta(slice);
      const cacheKey = `${slice.format}:${slice.rank}:${slice.period}:${slice.minGames}`;
      const cached = metaCache.get(cacheKey);
      const items = cached?.version === envelope.datasetVersion
        ? cached.items
        : envelope.data.items
          .map(item => serializeMetaArchetype(item, slice.format, links))
          .sort(compareMetaArchetypes);
      if (cached?.version !== envelope.datasetVersion) {
        metaCache.set(cacheKey, { version: envelope.datasetVersion, items });
      }
      const offset = decodeCursor(query.cursor, slice, envelope.datasetVersion);
      const data = items.slice(offset, offset + limit);
      const nextOffset = offset + data.length;
      const hasMore = nextOffset < items.length;
      const status: 'fresh' | 'stale' = envelope.freshness === 'fresh' ? 'fresh' : 'stale';
      return {
        data,
        pagination: {
          limit,
          total: items.length,
          hasMore,
          nextCursor: hasMore
            ? encodeCursor(slice, envelope.datasetVersion, nextOffset)
            : null,
        },
        meta: {
          format: slice.format,
          rank: { id: slice.rank },
          period: {
            id: slice.period,
            patch: slice.period === 'patch'
              ? publicPeriodPatch(envelope.data.currentPatchPeriod)
              : null,
          },
          minGames: slice.minGames,
          mode: envelope.mode,
          partial: envelope.partial,
          updatedAt: timestamp(envelope.sourceUpdatedAt),
          datasetVersion: envelope.datasetVersion,
          dataStatus: status,
        },
        cacheSource: cacheSource(status),
      };
    },

    async detail(query: JsonRecord, slugValue: unknown) {
      const format = enumValue(query.format, FORMATS, 'standard');
      const slug = archetypeSlug(slugValue);
      const { catalog, item } = await findArchetype(format, slug);
      if (!item) return null;
      const data = serializeArchetypeStatistics(item, links);
      const version = datasetVersion('as1', {
        format,
        patch: catalog.patch,
        updatedAt: catalog.updatedAt,
        data,
      });
      const status = dataStatus(catalog.updatedAt);
      return {
        data,
        meta: {
          format,
          patch: text(catalog.patch, 40) || null,
          minimumGames: count(catalog.minimumGames) ?? 0,
          updatedAt: timestamp(catalog.updatedAt),
          datasetVersion: version,
          dataStatus: status,
        } satisfies VersionedMeta & Record<string, unknown>,
        cacheSource: cacheSource(status),
      };
    },

    async history(query: JsonRecord, slugValue: unknown) {
      const format = enumValue(query.format, FORMATS, 'standard');
      const slug = archetypeSlug(slugValue);
      const days = positiveInteger(
        query.days,
        DEFAULT_HISTORY_DAYS,
        MAX_HISTORY_DAYS,
        MIN_HISTORY_DAYS,
      );
      const { catalog, item } = await findArchetype(format, slug);
      if (!item) return null;
      const points = (await source.loadHistory(format, item.archetype))
        .map(serializeHistoryPoint)
        .sort((left, right) => Date.parse(left.recordedAt) - Date.parse(right.recordedAt));
      const latest = points.length > 0 ? Date.parse(points[points.length - 1].recordedAt) : NaN;
      const cutoff = Number.isFinite(latest) ? latest - days * DAY_MS : Number.NEGATIVE_INFINITY;
      const data = points.filter(point => Date.parse(point.recordedAt) >= cutoff).slice(-1000);
      const version = datasetVersion('ah1', {
        format,
        slug,
        days,
        catalogUpdatedAt: catalog.updatedAt,
        data,
      });
      const status = dataStatus(catalog.updatedAt ?? data.at(-1)?.recordedAt);
      return {
        data,
        meta: {
          format,
          slug,
          days,
          patch: text(catalog.patch, 40) || null,
          updatedAt: timestamp(catalog.updatedAt ?? data.at(-1)?.recordedAt),
          datasetVersion: version,
          dataStatus: status,
        } satisfies VersionedMeta & Record<string, unknown>,
        cacheSource: cacheSource(status),
      };
    },

    async analysis(query: JsonRecord, slugValue: unknown) {
      const format = enumValue(query.format, FORMATS, 'standard');
      const slug = archetypeSlug(slugValue);
      const { item } = await findArchetype(format, slug);
      if (!item) return null;
      const sourceAnalysis = await source.loadAnalysis(format, item.archetype);
      if (!sourceAnalysis) return null;
      const data = {
        slug,
        state: sourceAnalysis.state,
        rank: sourceAnalysis.rank,
        period: '7d',
        classMatchups: sourceAnalysis.classMatchups.map(matchup => ({
          classId: text(matchup.classKey, 32),
          localizedName: text(matchup.classLabel, 80),
          metrics: {
            winratePercent: percent(matchup.winrate),
            games: count(matchup.games),
            sharePercent: percent(matchup.share),
          },
        })),
        cardStatistics: sourceAnalysis.cardStats.map(card => ({
          cardId: text(card.cardId, 80) || null,
          dbfId: count(card.dbfId),
          name: text(card.cardName),
          manaCost: count(card.cost),
          metrics: {
            mulliganImpactPercentagePoints: finite(card.mulliganImpact, {
              minimum: -100,
              maximum: 100,
            }),
            mulliganCount: count(card.mulliganCount),
            drawnImpactPercentagePoints: finite(card.drawnImpact, {
              minimum: -100,
              maximum: 100,
            }),
            drawnCount: count(card.drawnCount),
            keptImpactPercentagePoints: finite(card.keptImpact, {
              minimum: -100,
              maximum: 100,
            }),
            keptCount: count(card.keptCount),
          },
        })),
      };
      const version = datasetVersion('aa1', {
        format,
        updatedAt: sourceAnalysis.updatedAt,
        data,
      });
      const status = dataStatus(sourceAnalysis.updatedAt);
      return {
        data,
        meta: {
          format,
          updatedAt: timestamp(sourceAnalysis.updatedAt),
          matchupsUpdatedAt: timestamp(sourceAnalysis.matchupsUpdatedAt),
          cardStatisticsUpdatedAt: timestamp(sourceAnalysis.cardStatsUpdatedAt),
          datasetVersion: version,
          dataStatus: status,
        } satisfies VersionedMeta & Record<string, unknown>,
        cacheSource: cacheSource(status),
      };
    },
  };
}
