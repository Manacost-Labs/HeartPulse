import { createHash } from 'node:crypto';
import type {
  ConstructedArchetypeCatalog,
  ConstructedArchetypeFormat,
  ConstructedArchetypeItem,
} from '../../constructedArchetypeRoutes.js';
import {
  createPublicResourceLinks,
  type PublicDeckLinks,
  type PublicResourceLinkOptions,
} from './resourceLinks.js';

type JsonRecord = Record<string, unknown>;

export type PublicDeckStatisticsSource = {
  loadCatalog: (format: ConstructedArchetypeFormat) => Promise<ConstructedArchetypeCatalog>;
};

type PublicDeckStatisticsQuery = {
  format: ConstructedArchetypeFormat;
  archetype: string | null;
  minGames: number;
};

type PublicDeckStatisticsItem = {
  deckId: string;
  deckCode: string;
  format: ConstructedArchetypeFormat;
  archetype: {
    slug: string;
    name: string;
    localizedName: string;
    classId: string | null;
  };
  metrics: {
    games: number | null;
    winratePercent: number | null;
  };
  sample: {
    rank: string | null;
    period: string | null;
  };
  updatedAt: string | null;
  links: PublicDeckLinks;
};

const FORMATS = new Set<ConstructedArchetypeFormat>(['standard', 'wild']);
const ARCHETYPE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,89}$/;
const DECK_ID_PATTERN = /^deck_[a-f0-9]{32}$/;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_MIN_GAMES = 10_000_000;
const FRESH_FOR_MS = 24 * 60 * 60 * 1000;

export class PublicDeckStatisticsQueryError extends Error {
  constructor() {
    super('Deck statistics query is invalid');
    this.name = 'PublicDeckStatisticsQueryError';
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function scalar(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value !== 'string') throw new PublicDeckStatisticsQueryError();
  return value.trim();
}

function formatValue(value: unknown): ConstructedArchetypeFormat {
  const normalized = scalar(value).toLocaleLowerCase('en-US') as ConstructedArchetypeFormat;
  if (!normalized) return 'standard';
  if (!FORMATS.has(normalized)) throw new PublicDeckStatisticsQueryError();
  return normalized;
}

function archetypeValue(value: unknown): string | null {
  const normalized = scalar(value).toLocaleLowerCase('en-US');
  if (!normalized) return null;
  if (!ARCHETYPE_SLUG_PATTERN.test(normalized)) throw new PublicDeckStatisticsQueryError();
  return normalized;
}

function integer(
  value: unknown,
  fallback: number,
  maximum: number,
  minimum = 0,
): number {
  const normalized = scalar(value);
  if (!normalized) return fallback;
  if (!/^\d{1,8}$/.test(normalized)) throw new PublicDeckStatisticsQueryError();
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new PublicDeckStatisticsQueryError();
  }
  return parsed;
}

function queryValue(query: JsonRecord): PublicDeckStatisticsQuery {
  return {
    format: formatValue(query.format),
    archetype: archetypeValue(query.archetype),
    minGames: integer(query.minGames, 0, MAX_MIN_GAMES),
  };
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

const count = (value: unknown) => finite(value, { minimum: 0, integer: true });
const percent = (value: unknown) => finite(value, { minimum: 0, maximum: 100 });

function text(value: unknown, maximum = 160): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function timestamp(value: unknown): string | null {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function publicDeckId(deckCode: string): string {
  return `deck_${createHash('sha256').update(deckCode.trim()).digest('hex').slice(0, 32)}`;
}

function serializeBuild(
  format: ConstructedArchetypeFormat,
  archetype: ConstructedArchetypeItem,
  value: unknown,
  links: ReturnType<typeof createPublicResourceLinks>,
): PublicDeckStatisticsItem | null {
  const source = record(value);
  const deckCode = text(source.deckCode, 4096);
  if (!deckCode) return null;
  const deckId = publicDeckId(deckCode);
  return {
    deckId,
    deckCode,
    format,
    archetype: {
      slug: text(archetype.slug, 90),
      name: text(archetype.archetype),
      localizedName: text(archetype.archetypeLabel),
      classId: text(source.classKey ?? archetype.classKey, 32) || null,
    },
    metrics: {
      games: count(source.games),
      winratePercent: percent(source.winrate),
    },
    sample: {
      rank: text(source.sampleRank, 80) || null,
      period: text(source.samplePeriod, 80) || null,
    },
    updatedAt: timestamp(source.updatedAt),
    links: links.deck(format, text(archetype.slug, 90), deckId, deckCode),
  };
}

function compareDecks(left: PublicDeckStatisticsItem, right: PublicDeckStatisticsItem): number {
  const games = (right.metrics.games ?? -1) - (left.metrics.games ?? -1);
  if (games !== 0) return games;
  const winrate = (right.metrics.winratePercent ?? -1) - (left.metrics.winratePercent ?? -1);
  return winrate || left.deckId.localeCompare(right.deckId, 'en');
}

function serializeCatalog(
  catalog: ConstructedArchetypeCatalog,
  links: ReturnType<typeof createPublicResourceLinks>,
): PublicDeckStatisticsItem[] {
  const unique = new Map<string, PublicDeckStatisticsItem>();
  for (const archetype of catalog.items) {
    for (const build of archetype.builds) {
      const item = serializeBuild(catalog.format, archetype, build, links);
      if (!item) continue;
      const existing = unique.get(item.deckId);
      if (!existing || compareDecks(item, existing) < 0) unique.set(item.deckId, item);
    }
  }
  return [...unique.values()].sort(compareDecks);
}

function datasetVersion(catalog: ConstructedArchetypeCatalog, items: PublicDeckStatisticsItem[]): string {
  return `ds1-${createHash('sha256')
    .update(JSON.stringify({
      format: catalog.format,
      patch: catalog.patch,
      updatedAt: catalog.updatedAt,
      items,
    }))
    .digest('hex')
    .slice(0, 20)}`;
}

function dataStatus(value: unknown): 'fresh' | 'stale' {
  const updatedAt = timestamp(value);
  return updatedAt && Date.now() - Date.parse(updatedAt) <= FRESH_FOR_MS ? 'fresh' : 'stale';
}

function encodeCursor(
  query: PublicDeckStatisticsQuery,
  version: string,
  offset: number,
): string {
  return Buffer.from(JSON.stringify({
    v: 1,
    f: query.format,
    a: query.archetype,
    m: query.minGames,
    d: version,
    o: offset,
  })).toString('base64url');
}

function decodeCursor(
  value: unknown,
  query: PublicDeckStatisticsQuery,
  version: string,
): number {
  const encoded = scalar(value);
  if (!encoded) return 0;
  if (!/^[A-Za-z0-9_-]{12,500}$/.test(encoded)) throw new PublicDeckStatisticsQueryError();
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    if (Buffer.from(decoded).toString('base64url') !== encoded) {
      throw new PublicDeckStatisticsQueryError();
    }
    const cursor = record(JSON.parse(decoded));
    const offset = Number(cursor.o);
    if (cursor.v !== 1
      || cursor.f !== query.format
      || cursor.a !== query.archetype
      || cursor.m !== query.minGames
      || cursor.d !== version
      || !Number.isSafeInteger(offset)
      || offset < 0) {
      throw new PublicDeckStatisticsQueryError();
    }
    return offset;
  } catch (error) {
    if (error instanceof PublicDeckStatisticsQueryError) throw error;
    throw new PublicDeckStatisticsQueryError();
  }
}

/**
 * Creates the public view of concrete deck builds. Deck codes are portable
 * public game data and allow clients to resolve the full composition. Provider
 * URLs and source-specific fields never cross this serialization boundary.
 */
export function createPublicDeckStatistics(
  source: PublicDeckStatisticsSource,
  options: PublicResourceLinkOptions = {},
) {
  const links = createPublicResourceLinks(options);
  const cache = new WeakMap<ConstructedArchetypeCatalog, {
    version: string;
    items: PublicDeckStatisticsItem[];
  }>();

  const load = async (format: ConstructedArchetypeFormat) => {
    const catalog = await source.loadCatalog(format);
    const cached = cache.get(catalog);
    if (cached) {
      return { catalog, version: cached.version, items: cached.items };
    }
    const items = serializeCatalog(catalog, links);
    const version = datasetVersion(catalog, items);
    cache.set(catalog, { version, items });
    return { catalog, version, items };
  };

  return {
    async list(query: JsonRecord) {
      const parsed = queryValue(query);
      const limit = integer(query.limit, DEFAULT_LIMIT, MAX_LIMIT, 1);
      const { catalog, version, items } = await load(parsed.format);
      const filtered = items.filter(item => (
        (!parsed.archetype || item.archetype.slug === parsed.archetype)
        && (item.metrics.games ?? 0) >= parsed.minGames
      ));
      const offset = decodeCursor(query.cursor, parsed, version);
      const data = filtered.slice(offset, offset + limit);
      const nextOffset = offset + data.length;
      const hasMore = nextOffset < filtered.length;
      const status = dataStatus(catalog.updatedAt);
      return {
        data,
        pagination: {
          limit,
          total: filtered.length,
          hasMore,
          nextCursor: hasMore ? encodeCursor(parsed, version, nextOffset) : null,
        },
        meta: {
          format: parsed.format,
          archetype: parsed.archetype,
          minGames: parsed.minGames,
          patch: text(catalog.patch, 40) || null,
          updatedAt: timestamp(catalog.updatedAt),
          datasetVersion: version,
          dataStatus: status,
        },
        cacheSource: status === 'fresh' ? 'fresh' as const : 'LKG' as const,
      };
    },

    async detail(query: JsonRecord, deckIdValue: unknown) {
      const format = formatValue(query.format);
      const deckId = scalar(deckIdValue).toLocaleLowerCase('en-US');
      if (!DECK_ID_PATTERN.test(deckId)) throw new PublicDeckStatisticsQueryError();
      const { catalog, version, items } = await load(format);
      const data = items.find(item => item.deckId === deckId) ?? null;
      if (!data) return null;
      const status = dataStatus(catalog.updatedAt);
      return {
        data,
        meta: {
          format,
          patch: text(catalog.patch, 40) || null,
          updatedAt: timestamp(catalog.updatedAt),
          datasetVersion: version,
          dataStatus: status,
        },
        cacheSource: status === 'fresh' ? 'fresh' as const : 'LKG' as const,
      };
    },
  };
}
