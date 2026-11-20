import { Router, type Response } from 'express';
import { projectCardAssembleList, type CardAssembleListPayload } from './cardAssembleList.js';
import { CARD_ID, isFormat, projectCardAssemble, type CardAssemblePayload } from './cardAssembleProjection.js';

export { projectCardAssemble } from './cardAssembleProjection.js';
export type { CardAssembleListPayload } from './cardAssembleList.js';
export { projectCardAssembleList } from './cardAssembleList.js';
export type { CardAssemblePayload } from './cardAssembleProjection.js';

const BASE_PARAM = /^(?:top|\d{1,12})$/;

type CacheEntry = { at: number; status: number; body: CardAssemblePayload | CardAssembleListPayload | null };

export type CardAssembleRouterDependencies = {
  /** GET a hs-data-api path such as `/v1/hsreplay/assemble?...`. */
  request: (path: string) => Promise<globalThis.Response>;
  cacheMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

const MAX_CACHE_ENTRIES = 2_000;

/** `GET /api/card-assemble/:format[/:cardId?base=<dbf|top>]` — public, cached for ten minutes, renewed in the background once expired. */
export function createCardAssembleRouter(dependencies: CardAssembleRouterDependencies): Router {
  const cache = new Map<string, CacheEntry>();
  const cacheMs = dependencies.cacheMs ?? 10 * 60_000;
  const now = dependencies.now ?? Date.now;
  const router = Router({ caseSensitive: true });
  /** The one upstream read per key that is in flight, shared by everyone who needs that key meanwhile. */
  const inflight = new Map<string, Promise<CacheEntry>>();
  function refresh(key: string, load: () => Promise<CacheEntry>): Promise<CacheEntry> {
    const running = inflight.get(key);
    if (running) return running;
    const started = load().then(entry => {
      if (!cache.has(key) && cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
      cache.set(key, entry);
      return entry;
    }).finally(() => inflight.delete(key));
    inflight.set(key, started);
    return started;
  }
  /**
   * Serves one cached upstream read. An expired answer is sent at once and renewed in the background (stale-while-revalidate),
   * so a reader never waits for the upstream once the key is warm; a failed renewal keeps the last answer, a cold failure is a 503.
   */
  async function serve(response: Response, key: string, load: () => Promise<CacheEntry>) {
    const cached = cache.get(key);
    let entry: CacheEntry;
    if (cached) {
      entry = cached;
      if (now() - cached.at >= cacheMs) refresh(key, load).catch(error => dependencies.onError?.(error));
    } else {
      try {
        entry = await refresh(key, load);
      } catch (error) {
        dependencies.onError?.(error);
        response.set('Cache-Control', 'no-store');
        response.set('Retry-After', '30');
        return response.status(503).json({ error: 'Assemble statistics temporarily unavailable' });
      }
    }
    response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    if (entry.status === 404 || !entry.body) return response.status(404).json({ error: 'Assemble statistics not found' });
    return response.json(entry.body);
  }
  router.get('/card-assemble/:format', async (request, response) => {
    const { format } = request.params;
    if (!isFormat(format)) {
      response.set('Cache-Control', 'no-store');
      return response.status(404).json({ error: 'Assemble statistics not found' });
    }
    return serve(response, `list:${format}`, async () => {
      const upstream = await dependencies.request(`/v1/hsreplay/assemble/cards?${new URLSearchParams({ format })}`);
      if (!upstream.ok) throw new Error(`hs-data-api answered ${upstream.status}`);
      const body = projectCardAssembleList(await upstream.json(), format);
      if (!body) throw new Error('hs-data-api assemble list contract mismatch');
      return { at: now(), status: 200, body };
    });
  });
  router.get('/card-assemble/:format/:cardId', async (request, response) => {
    const { format, cardId } = request.params;
    const base = request.query.base ?? 'top';
    if (!isFormat(format) || !CARD_ID.test(cardId) || typeof base !== 'string' || !BASE_PARAM.test(base)
      || (base !== 'top' && !Number.isSafeInteger(Number(base)))) {
      response.set('Cache-Control', 'no-store');
      return response.status(404).json({ error: 'Assemble statistics not found' });
    }
    return serve(response, `${format}:${cardId}:${base}`, async () => {
      const query = new URLSearchParams({ card: cardId, format, base });
      const upstream = await dependencies.request(`/v1/hsreplay/assemble?${query}`);
      if (upstream.status === 404) return { at: now(), status: 404, body: null };
      if (!upstream.ok) throw new Error(`hs-data-api answered ${upstream.status}`);
      const body = projectCardAssemble(await upstream.json(), { cardId, format });
      if (!body) throw new Error('hs-data-api assemble contract mismatch');
      return { at: now(), status: 200, body };
    });
  });
  return router;
}
