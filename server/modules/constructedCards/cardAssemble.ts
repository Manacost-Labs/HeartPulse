import { Router } from 'express';
import { CARD_ID, isFormat, projectCardAssemble, type CardAssemblePayload } from './cardAssembleProjection.js';

export { projectCardAssemble } from './cardAssembleProjection.js';
export type { CardAssemblePayload } from './cardAssembleProjection.js';

const BASE_PARAM = /^(?:top|\d{1,12})$/;

type CacheEntry = { at: number; status: number; body: CardAssemblePayload | null };

export type CardAssembleRouterDependencies = {
  /** GET a hs-data-api path such as `/v1/hsreplay/assemble?...`. */
  request: (path: string) => Promise<globalThis.Response>;
  cacheMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

const MAX_CACHE_ENTRIES = 2_000;

/** `GET /api/card-assemble/:format/:cardId?base=<dbf|top>` — public, cached for ten minutes. */
export function createCardAssembleRouter(dependencies: CardAssembleRouterDependencies): Router {
  const cache = new Map<string, CacheEntry>();
  const cacheMs = dependencies.cacheMs ?? 10 * 60_000;
  const now = dependencies.now ?? Date.now;
  const router = Router({ caseSensitive: true });
  router.get('/card-assemble/:format/:cardId', async (request, response) => {
    const { format, cardId } = request.params;
    const base = request.query.base ?? 'top';
    if (!isFormat(format) || !CARD_ID.test(cardId) || typeof base !== 'string' || !BASE_PARAM.test(base)
      || (base !== 'top' && !Number.isSafeInteger(Number(base)))) {
      response.set('Cache-Control', 'no-store');
      return response.status(404).json({ error: 'Assemble statistics not found' });
    }
    const key = `${format}:${cardId}:${base}`;
    const cached = cache.get(key);
    let entry = cached && now() - cached.at < cacheMs ? cached : null;
    if (!entry) {
      try {
        const query = new URLSearchParams({ card: cardId, format, base });
        const upstream = await dependencies.request(`/v1/hsreplay/assemble?${query}`);
        if (upstream.status === 404) entry = { at: now(), status: 404, body: null };
        else if (!upstream.ok) throw new Error(`hs-data-api answered ${upstream.status}`);
        else {
          const body = projectCardAssemble(await upstream.json(), { cardId, format });
          if (!body) throw new Error('hs-data-api assemble contract mismatch');
          entry = { at: now(), status: 200, body };
        }
        if (!cache.has(key) && cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
        cache.set(key, entry);
      } catch (error) {
        dependencies.onError?.(error);
        if (!cached) {
          response.set('Cache-Control', 'no-store');
          response.set('Retry-After', '30');
          return response.status(503).json({ error: 'Assemble statistics temporarily unavailable' });
        }
        // A failed refresh keeps serving the last answer.
        entry = cached;
      }
    }
    response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    if (entry.status === 404 || !entry.body) return response.status(404).json({ error: 'Assemble statistics not found' });
    return response.json(entry.body);
  });
  return router;
}
