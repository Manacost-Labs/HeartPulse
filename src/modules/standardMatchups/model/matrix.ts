import type { StandardMatchupsClassKey, StandardMatchupsData } from './types';

/**
 * How far a pair's win rate can be trusted: by its games when the payload has
 * them, else (older payloads) by the geometric mean of both archetypes' shares,
 * which grows with the pair's expected sample.
 */
export type StandardMatchupConfidence = 'low' | 'medium' | 'high';

/** Games of a pair from which it is medium or high; below medium the matrix mutes it. */
export const CONFIDENCE_GAMES = { medium: 100, high: 500 } as const;

export function gamesConfidence(games: number): StandardMatchupConfidence {
  return games >= CONFIDENCE_GAMES.high ? 'high' : games >= CONFIDENCE_GAMES.medium ? 'medium' : 'low';
}

/** Geometric mean of the two shares, in percent, from which a pair is medium or high. */
export const CONFIDENCE_SHARE = { medium: 2, high: 4 } as const;

/**
 * The matrix component counts games; it receives the confidence rank instead,
 * so `games < MATRIX_MIN_GAMES` marks exactly the low-confidence pairs.
 */
export const CONFIDENCE_RANK: Record<StandardMatchupConfidence, number> = { low: 1, medium: 2, high: 3 };
export const MATRIX_MIN_GAMES = CONFIDENCE_RANK.medium;

export function confidenceOfRank(rank: number): StandardMatchupConfidence {
  return rank >= CONFIDENCE_RANK.high ? 'high' : rank >= CONFIDENCE_RANK.medium ? 'medium' : 'low';
}

export interface StandardMatrixArchetype {
  id: string;
  name: string;
  classKey: StandardMatchupsClassKey | null;
  /** Share of games in percent; undefined when the source has none. */
  share?: number;
}

export interface StandardMatrixPair {
  a: string;
  b: string;
  /** Fraction: 0.523 = 52.3%. */
  winRate: number;
  /** Games of the pair, or its `CONFIDENCE_RANK` when `counted` is false. */
  games: number;
}

export interface StandardMatrix {
  archetypes: StandardMatrixArchetype[];
  pairs: StandardMatrixPair[];
  /** The minimum games of a published pair: the slice's, else read from the source URL. */
  minSample: number | null;
  /** True when `games` are real game counts; false for payloads without them. */
  counted: boolean;
  /** Pairs below this `games` value are muted and left out of best/worst. */
  minGames: number;
}

function share(value: string | null | undefined): number | undefined {
  const number = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function pairConfidence(a: number | undefined, b: number | undefined): StandardMatchupConfidence {
  if (a === undefined || b === undefined) return 'low';
  const mean = Math.sqrt(a * b);
  return mean >= CONFIDENCE_SHARE.high ? 'high' : mean >= CONFIDENCE_SHARE.medium ? 'medium' : 'low';
}

/** The source's minimum games for a published pair, read from its URL. */
export function matchupMinSample(sourceUrl: string | undefined): number | null {
  try {
    const value = Number(new URL(sourceUrl ?? '').searchParams.get('min_matchup_sample'));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch { return null; }
}

/**
 * Rows of the source as the matrix's archetypes, in the source's order. Mirror
 * pairs are left out (even by definition), as are pairs without a win rate.
 */
export function standardMatrix(data: StandardMatchupsData, labelOf: (name: string, label?: string) => string): StandardMatrix {
  const columns = new Map(data.columns.map(column => [column.name, column]));
  const archetypes = data.rows.map(row => ({
    id: row.archetype,
    name: labelOf(row.archetype, row.archetypeLabel),
    classKey: row.classKey ?? columns.get(row.archetype)?.classKey ?? null,
    share: share(columns.get(row.archetype)?.popularity),
  }));
  const shareOf = new Map(archetypes.map(archetype => [archetype.id, archetype.share]));
  const counted = data.rows.some(row => row.cells.some(cell => cell.games !== undefined));
  const pairs: StandardMatrixPair[] = [];
  for (const row of data.rows) {
    for (const cell of row.cells) {
      if (cell.winrate === null || cell.opponent === row.archetype || !shareOf.has(cell.opponent)) continue;
      pairs.push({ a: row.archetype, b: cell.opponent, winRate: cell.winrate / 100,
        games: counted ? cell.games ?? 0
          : CONFIDENCE_RANK[pairConfidence(shareOf.get(row.archetype), shareOf.get(cell.opponent))] });
    }
  }
  return { archetypes, pairs, counted, minGames: counted ? CONFIDENCE_GAMES.medium : MATRIX_MIN_GAMES,
    minSample: data.minGames ?? matchupMinSample(data.sourceUrl) };
}
