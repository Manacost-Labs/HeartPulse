import type { ArenaRunRecord, HearthstoneClass, PlayerGame } from '../model/game.js';
import type { GlobalArenaClass } from '../model/globalSources.js';
import { average, rate, type ArenaRun, type ArenaStats } from '../model/stats.js';

type ArenaGame = Extract<PlayerGame, { mode: 'arena' }>;
const MAX_WINS = 12;
const MAX_LOSSES = 3;
const MAX_RUNS = 100;

/** A run with an `arena_run` record: the record's score, the games only for dates. */
function runFromRecord(record: ArenaRunRecord, games: ArenaGame[]): ArenaRun {
  const times = games.map(game => game.startedAt);
  return {
    runId: record.runId,
    playerClass: record.playerClass,
    wins: record.wins,
    losses: record.losses,
    games: Math.max(games.length, record.wins + record.losses),
    startedAt: times.length ? Math.min(...times) : record.occurredAt,
    lastPlayedAt: Math.max(record.occurredAt, ...times),
    complete: record.complete ?? (record.wins >= MAX_WINS || record.losses >= MAX_LOSSES),
    underground: record.underground,
  };
}

/**
 * Builds a run from its games. When the client reported the record before a
 * game, it wins over counting, so a run whose early games were never uploaded
 * still shows its real score.
 */
function buildRun(games: ArenaGame[]): ArenaRun {
  const ordered = [...games].sort((left, right) => left.arena.gameNumber - right.arena.gameNumber
    || left.startedAt - right.startedAt);
  let wins = ordered.filter(game => game.result === 'win').length;
  let losses = ordered.filter(game => game.result === 'loss').length;
  const last = ordered.at(-1) as ArenaGame;
  if (last.arena.winsBefore !== null && last.arena.lossesBefore !== null) {
    wins = Math.max(wins, last.arena.winsBefore + (last.result === 'win' ? 1 : 0));
    losses = Math.max(losses, last.arena.lossesBefore + (last.result === 'loss' ? 1 : 0));
  }
  wins = Math.min(wins, MAX_WINS);
  losses = Math.min(losses, MAX_LOSSES);
  return {
    runId: last.arena.runId,
    playerClass: last.arena.playerClass,
    wins,
    losses,
    games: ordered.length,
    startedAt: Math.min(...ordered.map(game => game.startedAt)),
    lastPlayedAt: Math.max(...ordered.map(game => game.startedAt)),
    complete: wins >= MAX_WINS || losses >= MAX_LOSSES,
    underground: last.arena.underground,
  };
}

/**
 * Aggregates Arena games (newest first) into runs, classes and totals. An
 * `arena_run` record is the run's authoritative score; its newest record wins.
 */
export function buildArenaStats(
  games: readonly ArenaGame[],
  records: readonly ArenaRunRecord[],
  options: Pick<ArenaStats, 'period' | 'global'>,
  global: readonly GlobalArenaClass[] | null,
): ArenaStats {
  const byRun = new Map<string, ArenaGame[]>();
  for (const game of games) {
    const run = byRun.get(game.arena.runId);
    if (run) run.push(game);
    else byRun.set(game.arena.runId, [game]);
  }
  const latestRecord = new Map<string, ArenaRunRecord>();
  for (const record of records) {
    const known = latestRecord.get(record.runId);
    if (!known || record.occurredAt > known.occurredAt) latestRecord.set(record.runId, record);
  }
  const runIds = new Set([...byRun.keys(), ...latestRecord.keys()]);
  const runs = [...runIds].map(runId => {
    const record = latestRecord.get(runId);
    const runGames = byRun.get(runId) ?? [];
    return record ? runFromRecord(record, runGames) : buildRun(runGames);
  }).sort((left, right) => right.lastPlayedAt - left.lastPlayedAt);
  const globalByClass = new Map((global ?? []).map(item => [item.playerClass, item]));
  const classes = new Map<HearthstoneClass, ArenaStats['classes'][number] & { totalWins: number }>();
  for (const run of runs) {
    const entry = classes.get(run.playerClass) ?? { playerClass: run.playerClass, runs: 0, averageWins: 0, games: 0, wins: 0,
      totalWins: 0, globalWinrate: globalByClass.get(run.playerClass)?.winrate ?? null,
      globalAverageWins: globalByClass.get(run.playerClass)?.averageWins ?? null };
    entry.runs += 1;
    entry.totalWins += run.wins;
    classes.set(run.playerClass, entry);
  }
  for (const game of games) {
    const entry = classes.get(game.arena.playerClass);
    if (!entry) continue;
    entry.games += 1;
    if (game.result === 'win') entry.wins += 1;
  }
  const wins = games.filter(game => game.result === 'win').length;
  const losses = games.filter(game => game.result === 'loss').length;
  const bestRun = [...runs].sort((left, right) => right.wins - left.wins || left.losses - right.losses)[0] ?? null;
  return {
    mode: 'arena',
    period: options.period,
    games: games.length,
    summary: {
      runs: runs.length,
      averageWins: average(runs.reduce((sum, run) => sum + run.wins, 0), runs.length),
      bestRun,
      twelveWinRuns: runs.filter(run => run.wins >= MAX_WINS).length,
      wins,
      losses,
      gameWinrate: rate(wins, games.length),
      timePlayedSeconds: games.reduce((sum, game) => sum + game.durationSeconds, 0),
    },
    runs: runs.slice(0, MAX_RUNS),
    classes: [...classes.values()]
      .map(({ totalWins, ...entry }) => ({ ...entry, averageWins: average(totalWins, entry.runs) ?? 0 }))
      .sort((left, right) => right.runs - left.runs || right.averageWins - left.averageWins),
    global: options.global,
  };
}
