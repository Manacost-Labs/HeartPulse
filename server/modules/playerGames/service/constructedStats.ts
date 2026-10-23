import { ladderValue, type HearthstoneClass, type LadderRank, type PlayerGame } from '../model/game.js';
import { archetypeKey, classKey, type GlobalArchetype } from '../model/globalSources.js';
import { MAX_SERIES_POINTS, average, rate, type ConstructedStats, type WinLoss } from '../model/stats.js';

type ConstructedGame = Extract<PlayerGame, { mode: 'standard' | 'wild' }>;
const MAX_ROWS = 40;

function tally<K, T extends WinLoss>(map: Map<K, T>, key: K, create: () => T, game: ConstructedGame): T {
  const entry = map.get(key) ?? create();
  entry.games += 1;
  if (game.result === 'win') entry.wins += 1;
  map.set(key, entry);
  return entry;
}

/** Legend beats every star level; among legend ranks the smaller number is better. */
function betterRank(left: LadderRank | null, right: LadderRank): LadderRank {
  if (!left) return right;
  if (left.starLevel === 51 && right.starLevel === 51) {
    return (right.legendRank ?? Infinity) < (left.legendRank ?? Infinity) ? right : left;
  }
  return (ladderValue(right) ?? 0) > (ladderValue(left) ?? 0) ? right : left;
}

function globalWinrates(global: readonly GlobalArchetype[] | null) {
  const byArchetype = new Map<string, number>();
  const byClass = new Map<string, { wins: number; games: number }>();
  for (const item of global ?? []) {
    if (item.winrate === null) continue;
    byArchetype.set(archetypeKey(item.archetype), item.winrate);
    if (item.label) byArchetype.set(archetypeKey(item.label), item.winrate);
    if (!item.playerClass || item.games <= 0) continue;
    const entry = byClass.get(item.playerClass) ?? { wins: 0, games: 0 };
    entry.wins += item.winrate * item.games;
    entry.games += item.games;
    byClass.set(item.playerClass, entry);
  }
  return {
    archetype: (name: string) => global ? byArchetype.get(archetypeKey(name)) ?? null : null,
    playerClass: (name: string) => {
      const entry = byClass.get(classKey(name));
      return entry ? Math.round((entry.wins / entry.games) * 10) / 10 : null;
    },
  };
}

/**
 * Aggregates Standard or Wild games (newest first). Casual games count in the
 * totals; only ranked games with a reported rank draw the rank line.
 */
export function buildConstructedStats(
  games: readonly ConstructedGame[],
  options: Pick<ConstructedStats, 'mode' | 'period' | 'global'>,
  global: readonly GlobalArchetype[] | null,
): ConstructedStats {
  const globalRate = globalWinrates(global);
  const decks = new Map<string, ConstructedStats['decks'][number]>();
  const archetypes = new Map<string, ConstructedStats['archetypes'][number]>();
  const classes = new Map<HearthstoneClass, ConstructedStats['classes'][number]>();
  const opponents = new Map<HearthstoneClass, ConstructedStats['opponentClasses'][number]>();
  const matchups = new Map<string, ConstructedStats['matchups'][number]>();
  const first: WinLoss = { games: 0, wins: 0 };
  const coin: WinLoss = { games: 0, wins: 0 };
  let bestRank: LadderRank | null = null;
  let turns = 0;
  let turnGames = 0;

  for (const game of games) {
    const detail = game.constructed;
    const deckKey = detail.deckCode ?? `${detail.playerClass}:${detail.archetype ?? detail.deckName ?? ''}`;
    const deck = tally(decks, deckKey, () => ({ key: deckKey, deckCode: detail.deckCode, deckName: detail.deckName,
      archetype: detail.archetype, playerClass: detail.playerClass, lastPlayedAt: game.startedAt, games: 0, wins: 0 }), game);
    deck.lastPlayedAt = Math.max(deck.lastPlayedAt, game.startedAt);
    if (detail.archetype && archetypeKey(detail.archetype)) {
      tally(archetypes, `${detail.playerClass}:${archetypeKey(detail.archetype)}`, () => ({ archetype: detail.archetype as string,
        playerClass: detail.playerClass, globalWinrate: globalRate.archetype(detail.archetype as string), games: 0, wins: 0 }), game);
    }
    tally(classes, detail.playerClass, () => ({ playerClass: detail.playerClass,
      globalWinrate: globalRate.playerClass(detail.playerClass), games: 0, wins: 0 }), game);
    tally(opponents, detail.opponentClass, () => ({ opponentClass: detail.opponentClass, games: 0, wins: 0 }), game);
    tally(matchups, `${detail.playerClass}:${detail.opponentClass}`, () => ({ playerClass: detail.playerClass,
      opponentClass: detail.opponentClass, games: 0, wins: 0 }), game);
    if (detail.wentFirst !== null) {
      const side = detail.wentFirst ? first : coin;
      side.games += 1;
      if (game.result === 'win') side.wins += 1;
    }
    if (detail.ranked && detail.rankAfter) bestRank = betterRank(bestRank, detail.rankAfter);
    if (game.turns !== null) {
      turns += game.turns;
      turnGames += 1;
    }
  }

  const wins = games.filter(game => game.result === 'win').length;
  const ties = games.filter(game => game.result === 'tie').length;
  const ranked = [...games].filter(game => game.constructed.ranked && game.constructed.rankAfter)
    .sort((left, right) => left.startedAt - right.startedAt);
  const byGames = <T extends WinLoss>(map: Map<unknown, T>) => [...map.values()]
    .sort((left, right) => right.games - left.games || right.wins - left.wins).slice(0, MAX_ROWS);
  return {
    mode: options.mode,
    period: options.period,
    games: games.length,
    summary: {
      wins,
      losses: games.length - wins - ties,
      ties,
      winrate: rate(wins, games.length),
      rankedGames: games.filter(game => game.constructed.ranked).length,
      averageDurationSeconds: average(games.reduce((sum, game) => sum + game.durationSeconds, 0), games.length, 0),
      averageTurns: average(turns, turnGames, 1),
      timePlayedSeconds: games.reduce((sum, game) => sum + game.durationSeconds, 0),
      currentRank: ranked.at(-1)?.constructed.rankAfter ?? null,
      bestRank,
      first,
      coin,
    },
    rankSeries: ranked.slice(-MAX_SERIES_POINTS).map(game => ({
      id: game.id,
      startedAt: game.startedAt,
      result: game.result,
      playerClass: game.constructed.playerClass,
      rank: game.constructed.rankAfter as LadderRank,
      value: ladderValue(game.constructed.rankAfter) as number,
    })),
    decks: byGames(decks),
    archetypes: byGames(archetypes),
    classes: byGames(classes),
    opponentClasses: byGames(opponents),
    matchups: [...matchups.values()],
    global: options.global,
  };
}
