import { Router } from 'express';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';
import {
  battlegroundHeroRankingEtag,
  projectBattlegroundHeroRanking,
  PUBLIC_HERO_RANKING_MODES,
  type PublicBattlegroundHeroRanking,
  type PublicHeroRankingMode,
} from './battlegroundHeroRankingProjection.js';

type Entry = { body: PublicBattlegroundHeroRanking; etag: string; expiresAt: number };

export type BattlegroundHeroRankingRouterDependencies = {
  /** Raw hero catalog of the base rating range, as the Battlegrounds service answers it. */
  loadCatalog: (mode: PublicHeroRankingMode) => Promise<unknown>;
  now?: () => number;
  onError?: (error: unknown) => void;
  retryAfterSeconds?: number;
};

const CACHE_HEADER = 'public, max-age=300, stale-while-revalidate=600';
const CACHE_MS = 300_000;

/**
 * `GET /bg/heroes/public?mode=solo|duos`: the open hero ranking. The rating
 * range is fixed by the server, so a caller cannot ask for a closed one
 * (`mmr` is a 400). The projection has a store of its own per mode that also
 * serves as the last known good copy: a failing source answers it with
 * `warning: "stale"`, and no copy at all is a 503 with `Retry-After`.
 */
export function createBattlegroundHeroRankingRouter(dependencies: BattlegroundHeroRankingRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const store = new Map<PublicHeroRankingMode, Entry>();
  const inFlight = new Map<PublicHeroRankingMode, Promise<Entry>>();

  const refresh = (mode: PublicHeroRankingMode): Promise<Entry> => {
    const running = inFlight.get(mode);
    if (running) return running;
    const request = (async (): Promise<Entry> => {
      const body = projectBattlegroundHeroRanking(await dependencies.loadCatalog(mode), mode);
      if (!body) throw new Error('Empty public hero ranking');
      const entry = { body, etag: battlegroundHeroRankingEtag(body), expiresAt: now() + CACHE_MS };
      store.set(mode, entry);
      return entry;
    })().finally(() => inFlight.delete(mode));
    inFlight.set(mode, request);
    return request;
  };

  router.get('/bg/heroes/public', async (request, response) => {
    response.set('X-Robots-Tag', 'noindex, nofollow');
    const rawMode = request.query.mode;
    const mode = rawMode === undefined ? 'solo' : rawMode;
    if (request.query.mmr !== undefined
      || typeof mode !== 'string'
      || !(PUBLIC_HERO_RANKING_MODES as readonly string[]).includes(mode)) {
      response.set('Cache-Control', 'no-store');
      return response.status(400).json({ error: 'Only mode=solo|duos is accepted' });
    }
    const key = mode as PublicHeroRankingMode;
    const cached = store.get(key);
    if (cached && cached.expiresAt > now()) {
      return sendDatasetJsonCached(request, response, cached.body, cached.etag, CACHE_HEADER, 'memory');
    }
    try {
      const entry = await refresh(key);
      return sendDatasetJsonCached(request, response, entry.body, entry.etag, CACHE_HEADER, 'origin');
    } catch (error) {
      try { dependencies.onError?.(error); } catch { /* diagnostics are best-effort */ }
      if (cached) {
        const body = { ...cached.body, warning: 'stale' as const };
        return sendDatasetJsonCached(request, response, body, battlegroundHeroRankingEtag(body),
          'public, max-age=60', 'memory-stale');
      }
      response.set('Cache-Control', 'no-store');
      response.set('Retry-After', String(dependencies.retryAfterSeconds ?? 60));
      return response.status(503).json({ error: 'Hero ranking temporarily unavailable' });
    }
  });

  return router;
}
