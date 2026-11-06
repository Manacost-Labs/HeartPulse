import type { ArenaRun, PlayerStats } from './stats.js';

const DAY_MS = 86_400_000;

/** The UTC start of the day: a visitor sees on which days someone played, not at what time. */
const day = (time: number): number => Math.floor(time / DAY_MS) * DAY_MS;

/**
 * The statistics as anyone may see them on `/id/<n>/`. The owner's own view
 * keeps tracker event ids and exact start times; the public copy replaces the
 * ids with positions and rounds every time to the day, so it reveals neither
 * stored identifiers nor when the person is usually online. There is no
 * global comparison (`availability: 'none'`): it would depend on the viewer's
 * subscription, and a visitor should not be offered one on someone's page.
 */
export function publicPlayerStats(stats: PlayerStats): PlayerStats {
  switch (stats.mode) {
    case 'battlegrounds':
      return {
        ...stats,
        global: { ...stats.global, availability: 'none' },
        recentGames: [],
        ratingSeries: stats.ratingSeries.map((game, index) => ({ ...game, id: String(index + 1), startedAt: day(game.startedAt) })),
      };
    case 'arena': {
      // The best run is one of the runs; it keeps the same public position.
      const position = new Map(stats.runs.map((run, index) => [run.runId, String(index + 1)]));
      const project = (run: ArenaRun): ArenaRun => ({
        ...run, runId: position.get(run.runId) ?? '0', startedAt: day(run.startedAt), lastPlayedAt: day(run.lastPlayedAt),
      });
      const { bestRun } = stats.summary;
      return {
        ...stats,
        summary: { ...stats.summary, bestRun: bestRun ? project(bestRun) : null },
        recentGames: [],
        runs: stats.runs.map(project),
      };
    }
    default:
      return {
        ...stats,
        global: { availability: 'none' },
        recentGames: [],
        rankSeries: stats.rankSeries.map((game, index) => ({ ...game, id: String(index + 1), startedAt: day(game.startedAt) })),
        decks: stats.decks.map(deck => ({ ...deck, lastPlayedAt: day(deck.lastPlayedAt) })),
      };
  }
}
