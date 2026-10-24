import { resolveStandardMetaRequestPeriod, type StandardMetaPeriod } from '../shared/standardMetaPeriods.js';

export type StandardMetaFormat = 'standard' | 'wild';
export type StandardMetaRank = 'all' | 'diamond' | 'diamond_legend' | 'legend'
  | 'top_5k' | 'top_legend';
export type { StandardMetaPeriod };
export type StandardMetaCoin = 'any_player' | 'on_coin' | 'going_first';
export type StandardMetaMinGames = 100 | 250 | 500 | 1000 | 2500 | 5000;

const FORMATS = new Set<StandardMetaFormat>(['standard', 'wild']);
const RANKS = new Set<StandardMetaRank>([
  'all', 'diamond', 'diamond_legend', 'legend', 'top_5k', 'top_legend',
]);
const COINS = new Set<StandardMetaCoin>(['any_player', 'on_coin', 'going_first']);
const MIN_GAMES = new Set<StandardMetaMinGames>([100, 250, 500, 1000, 2500, 5000]);

export function readFormat(value: unknown): StandardMetaFormat | null {
  const format = String(value ?? 'standard') as StandardMetaFormat;
  return FORMATS.has(format) ? format : null;
}

export function readRank(value: unknown): StandardMetaRank | null {
  const rank = String(value ?? 'diamond') as StandardMetaRank;
  return RANKS.has(rank) ? rank : null;
}

export function readPeriod(value: unknown): StandardMetaPeriod | null {
  return resolveStandardMetaRequestPeriod(String(value ?? 'past_day'));
}

export function readCoin(value: unknown): StandardMetaCoin | null {
  const coin = String(value ?? 'any_player') as StandardMetaCoin;
  return COINS.has(coin) ? coin : null;
}

export function readMinGames(value: unknown): StandardMetaMinGames | null {
  const minGames = Number(value ?? 100) as StandardMetaMinGames;
  return MIN_GAMES.has(minGames) ? minGames : null;
}


/** The five filters of a meta slice, or null when any of them is unknown (HTTP 400). */
export function readStandardMetaSliceQuery(query: Record<string, unknown>) {
  const format = readFormat(query.format);
  const rank = readRank(query.rank);
  const period = readPeriod(query.period);
  const coin = readCoin(query.coin);
  const minGames = readMinGames(query.min_games);
  return format && rank && period && coin && minGames ? { format, rank, period, coin, minGames } : null;
}
