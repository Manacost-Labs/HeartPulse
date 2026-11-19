import { PUBLIC_HERO_RANKING_MMR, type PublicHeroRankingMode } from './battlegroundHeroRankingProjection.js';

const CATALOG_URL = 'http://127.0.0.1:3108/api/bg/heroes';

/** The base range is named here and nowhere else: a caller of the open route cannot pick another. */
export function createBattlegroundHeroCatalogLoader(options: { fetchImpl?: typeof fetch; timeoutMs?: number; baseUrl?: string } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (mode: PublicHeroRankingMode): Promise<unknown> => {
    const url = new URL(options.baseUrl ?? CATALOG_URL);
    url.searchParams.set('mode', mode);
    url.searchParams.set('mmr', PUBLIC_HERO_RANKING_MMR);
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
      headers: { Accept: 'application/json', 'User-Agent': 'HearthPulse/BattlegroundHeroRanking' },
    });
    if (!response.ok) throw new Error(`Battleground hero catalog HTTP ${response.status}`);
    return response.json();
  };
}
