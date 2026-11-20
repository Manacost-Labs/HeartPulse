import { createHash } from 'node:crypto';
import type { Request, RequestHandler, Router } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';
import type { DeckBuilderCardRecord } from './deckBuilderResolve.js';
import { publicDeckCards, publicDeckCatalog, type PublicDeckCard } from './publicDeckCards.js';

type Format = 'standard' | 'wild';

/** Builds of an archetype the open layer lists; the rest (up to `deckCount`) stays with subscribers. */
export const PUBLIC_ARCHETYPE_BUILDS_LIMIT = 12;
const CACHE_MS = 300_000;
/** A kept answer serves through an outage this long; beyond it the numbers are too old to call current. */
const STALE_LIMIT_MS = 6 * 60 * 60_000;
const MAX_ENTRIES = 400;
const CACHE_HEADER = 'public, max-age=300, stale-while-revalidate=600';

type SourceBuild = {
  deckCode: string; games: number | null; winrate: number | null; updatedAt: string | null; sampleRank: string; samplePeriod: string;
};
type SourceItem = {
  slug: string; archetype: string; archetypeLabel: string; translated: boolean; classKey: string | null; format: Format;
  games: number; winrate: number | null; popularity: number | null; turns: number | null; durationMinutes: number | null;
  climbingSpeed: number | null; deckCount: number; sourceUrl: string; builds: SourceBuild[];
};
type SourceCatalog = { format: Format; formatLabel: string; patch: string; minimumGames: number; updatedAt: string | null; items: SourceItem[] };

export type PublicArchetypeBuild = SourceBuild & { cards: PublicDeckCard[] | null };
export type PublicArchetypeDetail = {
  format: Format; formatLabel: string; patch: string; minimumGames: number; updatedAt: string | null;
  item: Omit<SourceItem, 'builds'> & { builds: PublicArchetypeBuild[] };
  featuredBuild: Omit<SourceBuild, 'deckCode'> | null;
  /** The closed layer is not here; the keys stay so the page's shared detail type is satisfied. */
  history: [];
  analysis: null;
  warning?: 'stale';
};

/**
 * Field-by-field allowlist of the open archetype layer: the general slice
 * (games, winrate, popularity, pace, deck count), the first builds with their
 * deck codes and card lists. Matchups, card statistics, history and the rank
 * matrix have no input here, and a field a source adds later stays out until
 * it is named below.
 */
export function projectPublicArchetype(catalog: SourceCatalog, item: SourceItem, cards: Map<number, DeckBuilderCardRecord>): PublicArchetypeDetail {
  const builds = item.builds.slice(0, PUBLIC_ARCHETYPE_BUILDS_LIMIT).map((build): PublicArchetypeBuild => ({
    deckCode: build.deckCode, games: build.games, winrate: build.winrate, updatedAt: build.updatedAt,
    sampleRank: build.sampleRank, samplePeriod: build.samplePeriod, cards: publicDeckCards(build.deckCode, cards),
  }));
  const featured = item.builds[0];
  return {
    format: catalog.format, formatLabel: catalog.formatLabel, patch: catalog.patch,
    minimumGames: catalog.minimumGames, updatedAt: catalog.updatedAt,
    item: {
      slug: item.slug, archetype: item.archetype, archetypeLabel: item.archetypeLabel, translated: item.translated,
      classKey: item.classKey, format: item.format, games: item.games, winrate: item.winrate, popularity: item.popularity,
      turns: item.turns, durationMinutes: item.durationMinutes, climbingSpeed: item.climbingSpeed,
      deckCount: item.deckCount, sourceUrl: item.sourceUrl, builds,
    },
    featuredBuild: featured ? {
      games: featured.games, winrate: featured.winrate, updatedAt: featured.updatedAt,
      sampleRank: featured.sampleRank, samplePeriod: featured.samplePeriod,
    } : null,
    history: [], analysis: null,
  };
}

export type PublicArchetypeDependencies = {
  /** With the slug: the default catalog that lists it. */
  loadCatalog: (format: Format, slug: string) => Promise<SourceCatalog>;
  loadCardCatalog?: (format: Format) => Promise<{ cards: Record<string, unknown>[] }>;
  now?: () => number;
  onError?: (error: unknown) => void;
};

type Entry = { body: PublicArchetypeDetail; etag: string; expiresAt: number; storedAt: number };

const etagOf = (body: unknown) => `"${createHash('sha1').update(JSON.stringify(body)).digest('base64url').slice(0, 27)}"`;

/**
 * `GET /constructed-archetypes/public/:format/:slug`: the open layer of one
 * archetype for every viewer, so it may sit in a shared cache. It never reads
 * the paid sources. A failed read answers with the last good copy (marked
 * `stale`, up to six hours) and only without one with 503 and `Retry-After`,
 * never with an empty page.
 */
export function createPublicArchetypeHandler(dependencies: PublicArchetypeDependencies): RequestHandler {
  const now = dependencies.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const inflight = new Map<string, Promise<Entry>>();
  const indexes = new WeakMap<object, Map<number, DeckBuilderCardRecord>>();
  const cardIndex = async (format: Format) => {
    if (!dependencies.loadCardCatalog) throw new Error('Card catalog is not available');
    const { cards } = await dependencies.loadCardCatalog(format);
    if (!Array.isArray(cards) || !cards.length) throw new Error('Empty card catalog');
    let index = indexes.get(cards);
    if (!index) { index = publicDeckCatalog(cards); indexes.set(cards, index); }
    return index;
  };
  const compute = async (format: Format, slug: string): Promise<Entry | null> => {
    const catalog = await dependencies.loadCatalog(format, slug);
    const item = catalog.items.find(row => row.slug === slug);
    if (!item) return null;
    const body = projectPublicArchetype(catalog, item, await cardIndex(format));
    // A list the catalog could not name card by card would pass for the whole deck: it is a failed read.
    if (body.item.builds.some(build => build.cards === null)) throw new Error('Deck card list unresolved');
    const stored = now();
    return { body, etag: etagOf(body), expiresAt: stored + CACHE_MS, storedAt: stored };
  };
  const send = (request: Request, response: Parameters<RequestHandler>[1], entry: Entry, origin: string, header = CACHE_HEADER) => {
    response.set('X-Content-Type-Options', 'nosniff');
    return sendDatasetJsonCached(request, response, entry.body, entry.etag, header, origin);
  };
  return async (request, response) => {
    const format = request.params.format;
    const slug = String(request.params.slug ?? '').trim().toLowerCase();
    if ((format !== 'standard' && format !== 'wild') || !/^[a-z0-9-]{1,90}$/.test(slug)) {
      return response.status(400).json({ error: 'Некорректный адрес архетипа' });
    }
    const key = `${format}/${slug}`;
    const cached = entries.get(key);
    if (cached && cached.expiresAt > now()) return send(request, response, cached, 'memory');
    try {
      let pending = inflight.get(key);
      if (!pending) {
        pending = compute(format, slug).then(entry => {
          if (!entry) throw new MissingArchetype();
          entries.delete(key);
          entries.set(key, entry);
          while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
          return entry;
        }).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      return send(request, response, await pending, 'origin');
    } catch (error) {
      if (error instanceof MissingArchetype) {
        entries.delete(key);
        response.set('Cache-Control', 'public, max-age=60');
        return response.status(404).json({ error: 'Архетип не найден в текущей мете' });
      }
      dependencies.onError?.(error);
      if (cached && now() - cached.storedAt <= STALE_LIMIT_MS) {
        const body = { ...cached.body, warning: 'stale' as const };
        return send(request, response, { ...cached, body, etag: etagOf(body) }, 'memory-stale', 'public, max-age=60, stale-while-revalidate=60');
      }
      response.set('Retry-After', '60');
      response.set('Cache-Control', 'no-store');
      return response.status(503).json({ error: 'Архетип временно недоступен' });
    }
  };
}

class MissingArchetype extends Error {}

/** The open routes of the archetype pages, mounted before the entitlement guard; `public` in the path marks them for the scraping guard. */
export function mountPublicArchetypeRoutes(router: Router, dependencies: {
  loadCatalog: (format: Format, period: string | null, slug: string) => Promise<SourceCatalog>;
  loadCardCatalog?: PublicArchetypeDependencies['loadCardCatalog'];
  onError?: (scope: 'detail', error: unknown) => void;
}): void {
  router.get('/constructed-archetypes/public/:format/:slug', createPublicArchetypeHandler({
    loadCatalog: (format, slug) => dependencies.loadCatalog(format, null, slug),
    loadCardCatalog: dependencies.loadCardCatalog,
    onError: error => dependencies.onError?.('detail', error),
  }));
}
