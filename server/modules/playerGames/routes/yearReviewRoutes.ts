import { Router } from 'express';
import type { LoadStatisticsEvents } from '../model/events.js';
import { readPlayerGames } from '../service/readGames.js';
import { buildYearReview, yearReviewOpen, type YearReview } from '../service/yearReview.js';

/** A year of a heavy player fits; the review stays bounded like the other statistics. */
const MAX_YEAR_GAMES = 20_000;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 200;
const NOT_FOUND = { error: 'Итоги года не найдены' };

export type YearReviewRouterDependencies = {
  loadEvents: LoadStatisticsEvents;
  /** The account behind a public profile while it shows its statistics (`findPublicStatsOwner`); null otherwise. */
  resolvePublicStatsOwner: (publicProfileId: string) => string | null;
  resolveCardNames?: (cardIds: string[]) => Promise<Record<string, string>>;
  /** Deck dbf ids → card ids (HearthstoneJSON), for the top cards. */
  resolveCardIds?: (dbfIds: number[]) => Promise<Record<number, string>>;
  /** `YEAR_REVIEW_ENABLED` from the environment (see `yearReviewOpen`). */
  flag?: string;
  now?: () => number;
};

/**
 * `GET /profiles/:publicProfileId/year/:year`: the year in review of a public profile that shows its statistics
 * (docs/specs/year-in-review.md). Hidden, blocked and missing profiles, and a year not yet open, all answer 404.
 * Like the public statistics, the copy stops at the start of the current UTC day.
 */
export function createYearReviewRouter(dependencies: YearReviewRouterDependencies): Router & { invalidate: (userId: string) => void } {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const cache = new Map<string, { expiresAt: number; value: Promise<YearReview> }>();

  async function compute(userId: string, year: number, until: number): Promise<YearReview> {
    const games = readPlayerGames(dependencies.loadEvents, userId,
      { since: Date.UTC(year, 0, 1), until: Math.min(until, Date.UTC(year + 1, 0, 1)), limit: MAX_YEAR_GAMES }, now());
    const review = buildYearReview(games, year);
    const byDbf = review.topCards.length && dependencies.resolveCardIds
      ? await dependencies.resolveCardIds(review.topCards.map(card => card.dbfId)).catch(() => ({} as Record<number, string>)) : {};
    const topCards = review.topCards.flatMap(card => (byDbf[card.dbfId] ? [{ ...card, cardId: byDbf[card.dbfId] }] : []));
    const hero = review.battlegrounds.favouriteHero;
    const ids = [...topCards.map(card => card.cardId), ...(hero ? [hero.cardId] : [])];
    const names = ids.length && dependencies.resolveCardNames ? await dependencies.resolveCardNames(ids).catch(() => ({} as Record<string, string>)) : {};
    return {
      ...review,
      topCards: topCards.map(card => ({ ...card, name: names[card.cardId] ?? null })),
      battlegrounds: { ...review.battlegrounds, favouriteHero: hero ? { ...hero, name: names[hero.cardId] ?? null } : null },
    };
  }

  function load(userId: string, year: number, until: number): Promise<YearReview> {
    const key = `${userId}|${year}|${until}`;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return hit.value;
    const value = compute(userId, year, until);
    cache.set(key, { expiresAt: now() + CACHE_TTL_MS, value });
    value.catch(() => cache.delete(key));
    if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
    return value;
  }

  router.get('/profiles/:publicProfileId/year/:year', async (request, response) => {
    const year = /^20\d\d$/.test(String(request.params.year)) ? Number(request.params.year) : null;
    const current = now();
    const userId = year !== null && yearReviewOpen(year, current, dependencies.flag)
      ? dependencies.resolvePublicStatsOwner(String(request.params.publicProfileId)) : null;
    if (year === null || !userId) {
      response.set('Cache-Control', 'public, max-age=60');
      return response.status(404).json(NOT_FOUND);
    }
    const today = new Date(current);
    const until = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    try {
      const review = await load(userId, year, until);
      response.set('Cache-Control', 'public, max-age=300');
      response.set('X-Robots-Tag', 'noindex');
      return response.json(review);
    } catch {
      response.set('Cache-Control', 'no-store');
      return response.status(503).json({ error: 'Не удалось загрузить итоги года' });
    }
  });

  return Object.assign(router, {
    invalidate(userId: string) {
      for (const key of cache.keys()) if (key.startsWith(`${userId}|`)) cache.delete(key);
    },
  });
}
