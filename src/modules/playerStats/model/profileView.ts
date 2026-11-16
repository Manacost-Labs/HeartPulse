/*
 * What the profile statistics draw, computed from one answer of
 * `/api/{account,profiles/<id>}/game-stats`. The components only render.
 */
import { CLASS_LABELS, formatDuration, formatNumber, formatPercent, formatSigned, rankLabel, winrate } from './format';
import type { ProfileStatsText } from './profileText';
import type { ArenaStats, BattlegroundsStats, ConstructedStats, PlayerStats } from './stats';

type HearthstoneClass = ConstructedStats['classes'][number]['playerClass'];
type Result = 'win' | 'loss' | 'tie';

/** Fewer games than this and a win rate is mostly noise: the cell or card is muted. */
const LOW_SAMPLE = 5;
/** Columns of the matchup grid besides «Всего»: more own classes than this rarely fit a phone. */
const MAX_MATCHUP_COLUMNS = 5;
/** A deck needs this many results before its win rate line says anything. */
const MIN_TREND_GAMES = 5;

export type Tone = -3 | -2 | -1 | 0 | 1 | 2 | 3;

/**
 * Colour step of a win rate against 50%: ±2 points is even, then 5 and 10
 * points. The steps are symmetric, so red and green mean the same distance.
 */
export function winrateTone(rate: number | null): Tone {
  if (rate === null) return 0;
  const delta = rate - 50;
  const size = Math.abs(delta);
  const step = size < 2 ? 0 : size < 5 ? 1 : size < 10 ? 2 : 3;
  return (Math.sign(delta) * step) as Tone;
}

/**
 * The deck's win rate after each of its last results, oldest first, from the
 * fifth result on: a line that shows whether the deck is getting better.
 * `null` until it means anything.
 */
export function deckTrend(results: readonly Result[] | undefined): number[] | null {
  if (!results || results.length < MIN_TREND_GAMES) return null;
  let wins = 0;
  const line = results.map((result, index) => {
    if (result === 'win') wins += 1;
    return Math.round((wins / (index + 1)) * 1_000) / 10;
  });
  // The first few points swing between 0% and 100%; the line starts once it has a few games behind it.
  return line.slice(MIN_TREND_GAMES - 1);
}

export type DeckCard = {
  key: string;
  title: string;
  subtitle: string;
  playerClass: HearthstoneClass;
  games: number;
  wins: number;
  losses: number;
  rate: number | null;
  tone: Tone;
  low: boolean;
  trend: number[] | null;
  deckCode: string | null;
  /** All players on this archetype, when the account may compare. */
  globalRate: number | null;
  lastPlayedAt: number;
};

/** Decks by games, with the archetype's global win rate when the answer carries one. */
export function deckCards(stats: ConstructedStats): DeckCard[] {
  const global = new Map(stats.archetypes.map(item => [`${item.playerClass}:${item.archetype}`, item.globalWinrate]));
  return stats.decks.map(deck => {
    const rate = winrate(deck);
    const title = deck.deckName ?? deck.archetype ?? CLASS_LABELS[deck.playerClass];
    return {
      key: deck.key,
      title,
      subtitle: deck.deckName && deck.archetype ? `${CLASS_LABELS[deck.playerClass]} · ${deck.archetype}` : CLASS_LABELS[deck.playerClass],
      playerClass: deck.playerClass,
      games: deck.games,
      wins: deck.wins,
      losses: deck.games - deck.wins,
      rate,
      tone: winrateTone(rate),
      low: deck.games < LOW_SAMPLE,
      trend: deckTrend(deck.results),
      deckCode: deck.deckCode,
      globalRate: deck.archetype ? global.get(`${deck.playerClass}:${deck.archetype}`) ?? null : null,
      lastPlayedAt: deck.lastPlayedAt,
    };
  });
}

export type HeatCell = { games: number; wins: number; rate: number | null; tone: Tone; low: boolean };
export type Heatmap = {
  /** The player's classes by games, then `all`: every game against that opponent. */
  columns: Array<{ key: HearthstoneClass | 'all'; games: number }>;
  rows: Array<{ opponent: HearthstoneClass; cells: HeatCell[] }>;
};

const cell = (entry: { games: number; wins: number } | undefined): HeatCell => {
  const games = entry?.games ?? 0;
  const rate = entry ? winrate(entry) : null;
  return { games, wins: entry?.wins ?? 0, rate, tone: games < LOW_SAMPLE ? 0 : winrateTone(rate), low: games < LOW_SAMPLE };
};

/** The same grid turned: the player's classes as rows, opponents and «Всего» as columns (wide screens). */
export function transposeHeatmap(grid: Heatmap): Array<{ key: HearthstoneClass | 'all'; games: number; cells: Array<HeatCell & { opponent: HearthstoneClass }> }> {
  return grid.columns.map((column, index) => ({
    ...column,
    cells: grid.rows.map(row => ({ ...row.cells[index], opponent: row.opponent })),
  }));
}

/**
 * Opponents are rows and the player's classes columns: there are at most
 * eleven opponents but usually few own classes, so the grid keeps its
 * width on a phone. Columns beyond `MAX_MATCHUP_COLUMNS` fold into «Всего».
 */
export function matchupHeatmap(stats: ConstructedStats): Heatmap {
  const own = stats.classes.slice(0, MAX_MATCHUP_COLUMNS);
  const byPair = new Map(stats.matchups.map(item => [`${item.playerClass}:${item.opponentClass}`, item]));
  return {
    columns: [...own.map(item => ({ key: item.playerClass, games: item.games })), { key: 'all' as const, games: stats.games }],
    rows: stats.opponentClasses.map(opponent => ({
      opponent: opponent.opponentClass,
      cells: [...own.map(item => cell(byPair.get(`${item.playerClass}:${opponent.opponentClass}`))), cell(opponent)],
    })),
  };
}

export type SummaryItem = { id: string; label: string; value: string; caption?: string; tone?: Tone };

/** The four numbers of the profile header for the shown mode; a number without data is left out. */
export function summaryItems(stats: PlayerStats, text: ProfileStatsText): SummaryItem[] {
  const hours = (seconds: number) => `${formatNumber(Math.round(seconds / 360) / 10, seconds < 36_000 ? 1 : 0)} ${text.hoursShort}`;
  if (stats.mode === 'battlegrounds') return battlegroundsItems(stats, text, hours);
  if (stats.mode === 'arena') return arenaItems(stats, text, hours);
  const { summary } = stats;
  const items: SummaryItem[] = [
    { id: 'winrate', label: text.winrate, value: formatPercent(summary.winrate), tone: winrateTone(summary.winrate),
      caption: `${formatNumber(summary.wins)}–${formatNumber(summary.losses)}` },
    { id: 'games', label: text.games, value: formatNumber(stats.games),
      caption: summary.averageDurationSeconds === null ? undefined : `${text.averageGame} ${formatDuration(summary.averageDurationSeconds)}` },
  ];
  if (summary.bestRank) {
    const best = rankLabel(summary.bestRank);
    const now = summary.currentRank ? rankLabel(summary.currentRank) : null;
    // «Легенда №820» is too long for the header's display face: the place goes to the caption.
    const [value, place] = best.split(' №');
    const caption = [place ? `№${place}` : null, now && now !== best ? `${text.now} ${now}` : null].filter(Boolean).join(' · ');
    items.push({ id: 'rank', label: text.bestRank, value, caption: caption || undefined });
  }
  items.push({ id: 'time', label: text.timePlayed, value: hours(summary.timePlayedSeconds) });
  return items;
}

function battlegroundsItems(stats: BattlegroundsStats, text: ProfileStatsText, hours: (seconds: number) => string): SummaryItem[] {
  const { summary } = stats;
  const items: SummaryItem[] = [];
  if (summary.highestRating !== null) {
    items.push({ id: 'rating', label: text.bestRating, value: formatNumber(summary.highestRating),
      caption: summary.currentRating !== null ? `${text.now} ${formatNumber(summary.currentRating)}`
        + (summary.ratingChange ? ` (${formatSigned(summary.ratingChange)})` : '') : undefined });
  }
  items.push(
    { id: 'placement', label: text.averagePlace, value: formatNumber(summary.averagePlacement, 2),
      caption: summary.top4Rate !== null ? `${text.topShare(stats.duos ? 2 : 4)} ${formatPercent(summary.top4Rate)}` : undefined },
    { id: 'games', label: text.games, value: formatNumber(stats.games), caption: `${text.firstPlaces} ${formatNumber(summary.firstPlaces)}` },
    { id: 'time', label: text.timePlayed, value: hours(summary.timePlayedSeconds) },
  );
  return items;
}

function arenaItems(stats: ArenaStats, text: ProfileStatsText, hours: (seconds: number) => string): SummaryItem[] {
  const { summary } = stats;
  return [
    { id: 'average', label: text.averageWins, value: formatNumber(summary.averageWins, 2),
      caption: `${text.runs} ${formatNumber(summary.runs)}` },
    { id: 'best', label: text.bestRun, value: summary.bestRun ? `${summary.bestRun.wins}–${summary.bestRun.losses}` : '—',
      caption: summary.twelveWinRuns ? `${text.twelveWins} ${formatNumber(summary.twelveWinRuns)}` : undefined },
    { id: 'winrate', label: text.gameWinrate, value: formatPercent(summary.gameWinrate), tone: winrateTone(summary.gameWinrate),
      caption: `${formatNumber(summary.wins)}–${formatNumber(summary.losses)}` },
    { id: 'time', label: text.timePlayed, value: hours(summary.timePlayedSeconds) },
  ];
}

/** Share of games per place in percent, and the places that count as a good finish (top half). */
export function placementShares(counts: readonly number[]): Array<{ place: number; count: number; share: number; top: boolean }> {
  const total = counts.reduce((sum, value) => sum + value, 0);
  return counts.map((count, index) => ({
    place: index + 1, count, share: total ? Math.round((count / total) * 1_000) / 10 : 0, top: index < counts.length / 2,
  }));
}
