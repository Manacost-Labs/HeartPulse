import {
  battlegroundHeroRankingEtag,
  projectBattlegroundHeroRanking,
  type PublicBattlegroundHeroRanking,
  type PublicHeroRankingMode,
} from './battlegroundHeroRankingProjection.js';

export type HeroRankingSnapshot = {
  body: PublicBattlegroundHeroRanking;
  etag: string;
  /** The source failed and this is the last known good copy (the body carries `warning: "stale"`). */
  stale: boolean;
  /** Served from the live window without a request to the source. */
  fromMemory: boolean;
};

export type HeroRankingStoreOptions = {
  /** Raw hero catalog of the base rating range, as the Battlegrounds service answers it. */
  loadCatalog: (mode: PublicHeroRankingMode) => Promise<unknown>;
  now?: () => number;
  onError?: (error: unknown) => void;
  cacheMs?: number;
};

type Entry = { body: PublicBattlegroundHeroRanking; etag: string; expiresAt: number };

/**
 * One projection per mode with a live window, a deduplicated refresh and the
 * last known good copy. `get` throws only when the source fails and no copy
 * exists at all; the caller then answers 503 with `Retry-After`.
 */
export function createHeroRankingStore(options: HeroRankingStoreOptions) {
  const now = options.now ?? Date.now;
  const cacheMs = options.cacheMs ?? 300_000;
  const store = new Map<PublicHeroRankingMode, Entry>();
  const inFlight = new Map<PublicHeroRankingMode, Promise<Entry>>();

  const refresh = (mode: PublicHeroRankingMode): Promise<Entry> => {
    const running = inFlight.get(mode);
    if (running) return running;
    const request = (async (): Promise<Entry> => {
      const body = projectBattlegroundHeroRanking(await options.loadCatalog(mode), mode);
      if (!body) throw new Error('Empty public hero ranking');
      const entry = { body, etag: battlegroundHeroRankingEtag(body), expiresAt: now() + cacheMs };
      store.set(mode, entry);
      return entry;
    })().finally(() => inFlight.delete(mode));
    inFlight.set(mode, request);
    return request;
  };

  return {
    async get(mode: PublicHeroRankingMode): Promise<HeroRankingSnapshot> {
      const cached = store.get(mode);
      if (cached && cached.expiresAt > now()) return { body: cached.body, etag: cached.etag, stale: false, fromMemory: true };
      try {
        const entry = await refresh(mode);
        return { body: entry.body, etag: entry.etag, stale: false, fromMemory: false };
      } catch (error) {
        try { options.onError?.(error); } catch { /* diagnostics are best-effort */ }
        if (!cached) throw error;
        const body = { ...cached.body, warning: 'stale' as const };
        return { body, etag: battlegroundHeroRankingEtag(body), stale: true, fromMemory: true };
      }
    },
  };
}

export type HeroRankingStore = ReturnType<typeof createHeroRankingStore>;
