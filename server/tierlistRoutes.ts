import { Router, type RequestHandler } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';

export type TierlistCacheEntry = { data: any; etag: string; expiresAt: number };
export type TierlistDataResult = {
  data: any;
  etag: string;
  cacheSource: 'memory' | 'redis' | 'origin';
};

export type TierlistRouterDependencies = {
  accessGuard: RequestHandler;
  cache: Map<string, TierlistCacheEntry>;
  resolveSource: (source: string | undefined) => string;
  getData: (source: string, now: number, bypassCache: boolean) => Promise<TierlistDataResult>;
  present: (data: any) => any;
  loadFallback: (source: string) => { data: any; etag: string } | null;
  allowData?: (source: string, data: any) => boolean | Promise<boolean>;
  allowFallback?: (source: string, data: any) => boolean | Promise<boolean>;
  cacheHeader?: string;
  provisionalCacheHeader?: string;
  staleCacheHeader?: string;
  fallbackCacheHeader?: string;
  now?: () => number;
  onError?: (error: unknown) => void;
};

/** Cards of the open slice: a guest sees the top ten overall and the top three of each class. */
const TEASER_TOP_COUNT = 10;
const TEASER_CLASS_COUNT = 3;
// Letter tiers only: a card without a tier (HSReplay's `U`) is not "top" of anything.
const TEASER_TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
const NEUTRAL_CLASS_ID = 'any';
const MIN_PUBLIC_SAMPLE = 1000;

/** `987654` → `980000`: two significant digits, rounded down; `null` below the smallest figure worth showing. */
export function sampleGamesLowerBound(games: number): number | null {
  if (!Number.isFinite(games) || games < MIN_PUBLIC_SAMPLE) return null;
  const step = 10 ** (Math.floor(Math.log10(games)) - 1);
  return Math.floor(games / step) * step;
}

/**
 * What the anonymous projection may say about a card. Every field is listed
 * here on purpose: the object is built field by field, never by spreading a
 * source row, so a figure added to the dataset later stays closed.
 */
export type TierlistTeaserCard = {
  cardId: string;
  name: string;
  classKey: string;
  className: string;
  tier: string;
  image: string | null;
};

export type TierlistPublicTeaser = {
  updatedAt: string | null;
  source: string;
  /**
   * A lower bound of the sample, never an exact figure: the largest per-card
   * game count of the dataset rounded down to two significant digits (987654
   * becomes 980000), or null when the source gives none or it is under 1000.
   * No source publishes a total of its own, and a per-card count is closed.
   */
  sampleGamesAtLeast: number | null;
  top: TierlistTeaserCard[];
  classes: Array<{ id: string; name: string; cards: TierlistTeaserCard[] }>;
};

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

type RankedCard = { card: TierlistTeaserCard; tierIndex: number; score: number };

/**
 * The open slice of a normalized tierlist (`present` output): the tier of the
 * best cards and the date and size of the sample, with no winrate, score or
 * per-card game count. Cards are ranked by tier, then by the dataset's own
 * score (used only for the order, never sent). `null` when no card has a tier.
 */
export function projectTierlistPublicTeaser(dataset: unknown): TierlistPublicTeaser | null {
  const data = record(dataset);
  const lookup = record(data.cards);
  let largestGames = 0;
  const perClass = new Map<string, { name: string; cards: RankedCard[] }>();
  const all: RankedCard[] = [];

  for (const entry of list(data.sections)) {
    const section = record(entry);
    const classKey = text(section.id);
    const className = text(section.name);
    if (!classKey || !className) continue;
    const ranked: RankedCard[] = [];
    for (const groupEntry of list(section.tiers)) {
      const group = record(groupEntry);
      const tier = text(group.tier);
      const tierIndex = TEASER_TIER_ORDER.indexOf(tier);
      for (const rowEntry of list(group.cards)) {
        const row = record(rowEntry);
        const games = Number(row.totalGames);
        if (Number.isFinite(games) && games > largestGames) largestGames = Math.floor(games);
        const cardId = text(row.cardId);
        const name = text(row.name);
        if (tierIndex < 0 || !cardId || !name) continue;
        const image = record(lookup[cardId]).imageRu;
        const score = Number(row.score);
        ranked.push({
          tierIndex,
          score: Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY,
          card: { cardId, name, classKey, className, tier, image: typeof image === 'string' && image.startsWith('/') ? image : null },
        });
      }
    }
    all.push(...ranked);
    if (classKey !== NEUTRAL_CLASS_ID) perClass.set(classKey, { name: className, cards: ranked });
  }

  const byRank = (a: RankedCard, b: RankedCard) => a.tierIndex - b.tierIndex || b.score - a.score;
  const top = all.sort(byRank).slice(0, TEASER_TOP_COUNT).map(entry => entry.card);
  if (!top.length) return null;
  const updatedAt = text(data.updatedAt);
  return {
    updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
    source: text(data.source),
    sampleGamesAtLeast: sampleGamesLowerBound(largestGames),
    top,
    classes: [...perClass].map(([id, entry]) => ({
      id, name: entry.name, cards: entry.cards.sort(byRank).slice(0, TEASER_CLASS_COUNT).map(item => item.card),
    })).filter(entry => entry.cards.length > 0),
  };
}

type ResolvedTierlist = { presented: unknown; etag: string; cacheControl: string; cacheSource: string };

export function createTierlistRouter(dependencies: TierlistRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.cacheHeader ?? 'public, max-age=3600, stale-while-revalidate=3600';
  const provisionalCacheHeader = dependencies.provisionalCacheHeader ?? 'public, max-age=300, stale-while-revalidate=300';
  const staleCacheHeader = dependencies.staleCacheHeader ?? 'public, max-age=300, stale-while-revalidate=600';
  const fallbackCacheHeader = dependencies.fallbackCacheHeader ?? 'public, max-age=21600, stale-while-revalidate=3600';
  const now = dependencies.now ?? Date.now;

  /** The dataset for a source: memory, origin, stale memory, then the last known good file; `null` when none is allowed. */
  const resolveTierlist = async (source: string, bypassCache: boolean): Promise<ResolvedTierlist | null> => {
    const timestamp = now();
    const cached = dependencies.cache.get(source);
    const dataAllowed = async (data: any): Promise<boolean> => {
      if (!dependencies.allowData) return true;
      try {
        return await dependencies.allowData(source, data);
      } catch (guardError) {
        dependencies.onError?.(guardError);
        return false;
      }
    };
    const answer = (data: unknown, etag: string, cacheControl: string, cacheSource: string): ResolvedTierlist => {
      const presented = dependencies.present(data);
      return { presented, etag, cacheSource, cacheControl: record(presented).provisional === true ? provisionalCacheHeader : cacheControl };
    };

    if (!bypassCache && cached && cached.expiresAt > timestamp && await dataAllowed(cached.data)) {
      return answer(cached.data, cached.etag, cacheHeader, 'memory');
    }

    try {
      const result = await dependencies.getData(source, timestamp, bypassCache);
      if (!await dataAllowed(result.data)) throw new Error('Tierlist publication policy rejected provisional data');
      return answer(result.data, result.etag, cacheHeader, result.cacheSource);
    } catch (error) {
      dependencies.onError?.(error);
      if (cached && await dataAllowed(cached.data)) {
        return answer({ ...cached.data, warning: 'stale' }, cached.etag, staleCacheHeader, 'memory-stale');
      }

      const fallback = dependencies.loadFallback(source);
      let fallbackAllowed = Boolean(fallback);
      if (fallback) {
        try {
          fallbackAllowed = dependencies.allowFallback
            ? await dependencies.allowFallback(source, fallback.data)
            : await dataAllowed(fallback.data);
        } catch (guardError) {
          dependencies.onError?.(guardError);
          fallbackAllowed = false;
        }
      }
      if (fallback && fallbackAllowed) {
        return answer({ ...fallback.data, warning: 'fallback' }, fallback.etag, fallbackCacheHeader, 'fallback');
      }
      return null;
    }
  };

  router.get('/tierlist', dependencies.accessGuard, async (request, response) => {
    const source = dependencies.resolveSource(request.query.source as string | undefined);
    const bypassCache = request.query.t !== undefined || request.query.bust === '1';
    const resolved = await resolveTierlist(source, bypassCache);
    if (!resolved) return response.status(502).json({ error: 'Tierlist unavailable' });
    return sendDatasetJsonCached(request, response, resolved.presented, resolved.etag, resolved.cacheControl, resolved.cacheSource);
  });

  // No access guard: this is the open slice of the page for guests and robots.
  // It reads the default source only and never bypasses the cache, so a guest
  // cannot fan out origin reads, and answers with the whitelisted projection.
  router.get('/tierlist/public-teaser', async (request, response) => {
    const resolved = await resolveTierlist(dependencies.resolveSource(undefined), false);
    const teaser = resolved ? projectTierlistPublicTeaser(resolved.presented) : null;
    if (!resolved || !teaser) return response.status(502).json({ error: 'Tierlist unavailable' });
    return sendDatasetJsonCached(request, response, teaser, `"teaser-${resolved.etag.replace(/"/g, '')}"`,
      resolved.cacheControl, resolved.cacheSource);
  });

  return router;
}
