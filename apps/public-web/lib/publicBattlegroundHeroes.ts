import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import {
  heroesRankingPath, parsePublicBattlegroundHeroesRanking,
  type HeroesRankingMode, type PublicBattlegroundHeroesRanking,
} from './publicBattlegroundHeroesData';

const load = (mode: HeroesRankingMode) => readFirstPaintJson(
  signal => fetchPublicExpress(heroesRankingPath(mode), signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }),
  Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
).then(raw => parsePublicBattlegroundHeroesRanking(raw, mode));

/**
 * The open hero ranking (solo and duos) for the prerendered guest view. A mode
 * with no data is `null`: the page is then served without its table instead of failing.
 */
export const loadPublicBattlegroundHeroes = cache(async (): Promise<{
  solo: PublicBattlegroundHeroesRanking | null; duos: PublicBattlegroundHeroesRanking | null;
}> => {
  const [solo, duos] = await Promise.all([load('solo'), load('duos')]);
  return { solo, duos };
});
