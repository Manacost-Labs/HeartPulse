import type { PlayerGame } from '../model/game.js';
import {
  MAX_RECENT_GAMES,
  type RecentArenaGame,
  type RecentBattlegroundsGame,
  type RecentConstructedGame,
} from '../model/stats.js';

type Game<M extends PlayerGame['mode']> = Extract<PlayerGame, { mode: M }>;

/** The newest games of the answer, newest first; `replayId` is filled later, per request. */
function newest<T extends PlayerGame>(games: readonly T[]): T[] {
  return [...games].sort((left, right) => right.startedAt - left.startedAt).slice(0, MAX_RECENT_GAMES);
}

const base = (game: PlayerGame) => ({
  id: game.id, startedAt: game.startedAt, durationSeconds: game.durationSeconds, result: game.result, turns: game.turns, replayId: null,
});

export function recentConstructedGames(games: readonly Game<'standard' | 'wild'>[]): RecentConstructedGame[] {
  return newest(games).map(game => ({
    ...base(game),
    playerClass: game.constructed.playerClass,
    opponentClass: game.constructed.opponentClass,
    deckName: game.constructed.deckName,
    archetype: game.constructed.archetype,
    opponentArchetype: game.constructed.opponentArchetype,
    ranked: game.constructed.ranked,
    rankAfter: game.constructed.rankAfter,
  }));
}

export function recentBattlegroundsGames(games: readonly Game<'battlegrounds'>[]): RecentBattlegroundsGame[] {
  return newest(games).map(game => {
    const { ratingBefore, ratingAfter } = game.battlegrounds;
    return {
      ...base(game),
      heroCardId: game.battlegrounds.heroCardId,
      placement: game.battlegrounds.placement,
      ratingAfter,
      delta: ratingBefore !== null && ratingAfter !== null ? ratingAfter - ratingBefore : null,
    };
  });
}

export function recentArenaGames(games: readonly Game<'arena'>[]): RecentArenaGame[] {
  return newest(games).map(game => ({
    ...base(game),
    playerClass: game.arena.playerClass,
    opponentClass: game.arena.opponentClass,
    gameNumber: game.arena.gameNumber,
    underground: game.arena.underground,
  }));
}
