import type {
  PublicBattlegroundHeroRanking,
  PublicBattlegroundHeroRankingEntry,
  PublicHeroRankingMode,
} from './battlegroundHeroRankingProjection.js';
import type { PublicBattlegroundHeroModeStats, PublicBattlegroundHeroStats } from './battlegroundHeroPublicTypes.js';

export type { PublicBattlegroundHeroModeStats, PublicBattlegroundHeroStats };

function modeStats(entry: PublicBattlegroundHeroRankingEntry, rank: number, of: number): PublicBattlegroundHeroModeStats {
  return {
    tier: entry.tier,
    avgPlacement: entry.avgPlacement,
    top4Rate: entry.top4Rate,
    pickRate: entry.pickRate,
    ...(entry.games !== undefined ? { games: entry.games } : {}),
    bestComposition: entry.bestComposition,
    keyMinions: entry.keyMinions.slice(0, 3),
    rank,
    of,
  };
}

/** `null` when the hero is in neither open ranking: the page then has no figures to print. */
export function projectBattlegroundHeroStats(
  dbfId: number,
  rankings: Partial<Record<PublicHeroRankingMode, PublicBattlegroundHeroRanking | null>>,
): PublicBattlegroundHeroStats | null {
  const modes: PublicBattlegroundHeroStats['modes'] = {};
  const dates: string[] = [];
  let source = '';
  let heroPowerName: string | null = null;
  let stale = false;
  for (const mode of ['solo', 'duos'] as const) {
    const ranking = rankings[mode];
    const index = ranking?.heroes.findIndex(hero => hero.dbfId === dbfId) ?? -1;
    if (!ranking || index < 0) continue;
    modes[mode] = modeStats(ranking.heroes[index], index + 1, ranking.heroes.length);
    heroPowerName = heroPowerName ?? ranking.heroes[index].heroPowerName;
    if (ranking.updatedAt) dates.push(ranking.updatedAt);
    source = source || ranking.source;
    stale = stale || ranking.warning === 'stale';
  }
  if (!modes.solo && !modes.duos) return null;
  dates.sort();
  return {
    mmr: 'TOP_50_PERCENT',
    heroPowerName,
    updatedAt: dates[0] ?? null,
    source,
    ...(stale ? { warning: 'stale' as const } : {}),
    modes,
  };
}
