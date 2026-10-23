import type { PlayerGame } from '../model/game.js';
import type { GlobalBattlegroundsHero } from '../model/globalSources.js';
import {
  MAX_SERIES_POINTS,
  average,
  rate,
  type BattlegroundsHeroStats,
  type BattlegroundsStats,
} from '../model/stats.js';

type BattlegroundsGame = Extract<PlayerGame, { mode: 'battlegrounds' }>;
const COMBAT_TURNS = 15;

export type BattlegroundsGlobal = {
  heroes: Map<string, GlobalBattlegroundsHero>;
  combat: Map<string, Array<{ turn: number; winrate: number }>>;
};

function ratingDelta(game: BattlegroundsGame): number | null {
  const { ratingBefore, ratingAfter } = game.battlegrounds;
  return ratingBefore !== null && ratingAfter !== null ? ratingAfter - ratingBefore : null;
}

function placementCounts(games: readonly BattlegroundsGame[], slots: number): number[] {
  const counts = Array<number>(slots).fill(0);
  for (const game of games) counts[game.battlegrounds.placement - 1] += 1;
  return counts;
}

function heroStats(heroCardId: string, games: BattlegroundsGame[], slots: number, offered: number,
  global: BattlegroundsGlobal | null): BattlegroundsHeroStats {
  const deltas = games.map(ratingDelta).filter((value): value is number => value !== null);
  const rounds = new Map<number, { wins: number; total: number }>();
  for (const game of games) {
    for (const combat of game.battlegrounds.combats) {
      if (combat.turn > COMBAT_TURNS) continue;
      const turn = rounds.get(combat.turn) ?? { wins: 0, total: 0 };
      turn.total += 1;
      if (combat.result === 'win') turn.wins += 1;
      rounds.set(combat.turn, turn);
    }
  }
  const globalHero = global?.heroes.get(heroCardId);
  return {
    heroCardId,
    games: games.length,
    netRating: deltas.length ? deltas.reduce((sum, value) => sum + value, 0) : null,
    averagePlacement: average(games.reduce((sum, game) => sum + game.battlegrounds.placement, 0), games.length) ?? 0,
    placements: placementCounts(games, slots),
    combat: [...rounds.entries()].sort(([left], [right]) => left - right)
      .map(([turn, value]) => ({ turn, winrate: rate(value.wins, value.total) ?? 0, rounds: value.total })),
    offered,
    picked: games.filter(game => game.battlegrounds.heroOptions.length > 0).length,
    global: globalHero ? {
      averagePlacement: globalHero.averagePlacement,
      pickRatePercent: globalHero.pickRatePercent,
      placementPercent: slots === 8 ? globalHero.placementPercent : null,
      combat: global?.combat.get(heroCardId) ?? null,
    } : null,
  };
}

/**
 * Aggregates Battlegrounds games (newest first) into the account statistics.
 * A hero counts as offered only in games whose client reported the hero choice,
 * so the personal pick rate is never diluted by games without that data.
 */
export function buildBattlegroundsStats(
  games: readonly BattlegroundsGame[],
  options: Pick<BattlegroundsStats, 'period' | 'duos' | 'global'>,
  global: BattlegroundsGlobal | null,
): Omit<BattlegroundsStats, 'cards'> {
  const slots = options.duos ? 4 : 8;
  const chronological = [...games].sort((left, right) => left.startedAt - right.startedAt);
  const rated = chronological.filter(game => game.battlegrounds.ratingAfter !== null);
  const ratings = rated.map(game => game.battlegrounds.ratingAfter as number);
  const deltas = chronological.map(ratingDelta).filter((value): value is number => value !== null);
  const placements = placementCounts(games, slots);
  const byHero = new Map<string, BattlegroundsGame[]>();
  const offeredByHero = new Map<string, number>();
  for (const game of games) {
    byHero.set(game.battlegrounds.heroCardId, [...(byHero.get(game.battlegrounds.heroCardId) ?? []), game]);
    for (const option of new Set(game.battlegrounds.heroOptions)) {
      offeredByHero.set(option, (offeredByHero.get(option) ?? 0) + 1);
    }
  }
  return {
    mode: 'battlegrounds',
    period: options.period,
    duos: options.duos,
    games: games.length,
    summary: {
      highestRating: ratings.length ? Math.max(...ratings) : null,
      currentRating: ratings.at(-1) ?? null,
      ratingChange: deltas.length ? deltas.reduce((sum, value) => sum + value, 0) : null,
      averagePlacement: average(games.reduce((sum, game) => sum + game.battlegrounds.placement, 0), games.length),
      placements,
      top4Rate: rate(placements.slice(0, slots / 2).reduce((sum, value) => sum + value, 0), games.length),
      firstPlaces: placements[0] ?? 0,
      timePlayedSeconds: games.reduce((sum, game) => sum + game.durationSeconds, 0),
    },
    ratingSeries: rated.slice(-MAX_SERIES_POINTS).map(game => ({
      id: game.id,
      startedAt: game.startedAt,
      heroCardId: game.battlegrounds.heroCardId,
      placement: game.battlegrounds.placement,
      rating: game.battlegrounds.ratingAfter as number,
      delta: ratingDelta(game),
      anomalyCardId: game.battlegrounds.anomalyCardId,
      tavernTier: game.battlegrounds.tavernTier,
      board: game.battlegrounds.finalBoard,
    })),
    heroes: [...byHero.entries()]
      .map(([heroCardId, heroGames]) => heroStats(heroCardId, heroGames, slots, offeredByHero.get(heroCardId) ?? 0, global))
      .sort((left, right) => right.games - left.games || left.averagePlacement - right.averagePlacement),
    global: options.global,
  };
}
