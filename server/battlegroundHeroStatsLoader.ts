import { createBattlegroundHeroCatalogLoader } from './battlegroundHeroRankingSource.js';
import { createHeroRankingStore } from './battlegroundHeroRankingStore.js';
import { projectBattlegroundHeroStats } from './battlegroundHeroStatsProjection.js';

/**
 * Open statistics of one hero for `/api/bg/heroes/public/:dbfId`: the hero's row in the base-range ranking of each
 * mode, read through a store of this route (live window, last known good copy). Rejects when a mode has neither
 * a live read nor a copy (a cold start with the source down): the route then answers 503 with `Retry-After`,
 * instead of an answer without figures that would turn an indexable page into `noindex`. An unrated hero is
 * `null`, which is a real answer.
 */
export function createHeroStatsLoader(options: { fetchImpl?: typeof fetch; timeoutMs?: number; onError?: (error: unknown) => void }) {
  const store = createHeroRankingStore({
    loadCatalog: createBattlegroundHeroCatalogLoader({ fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs }),
    onError: options.onError,
  });
  const read = (mode: 'solo' | 'duos') => store.get(mode).then(snapshot => snapshot.body);
  return async (dbfId: number) => {
    const [solo, duos] = await Promise.all([read('solo'), read('duos')]);
    return projectBattlegroundHeroStats(dbfId, { solo, duos });
  };
}
