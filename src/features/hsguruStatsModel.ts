import { standardMetaPeriodLabel } from './standardMetaFilterModel';
import type { StandardMetaPeriod } from '../../shared/standardMetaPeriods';
import type { ConstructedCardStat } from './ConstructedArchetypeCardStatsCells';

// The archetype page's HSGuru slice: /api/constructed-archetype-stats (docs/specs/archetype-hsguru-stats.md).

export type HsguruStatRank = 'all' | 'diamond_4to1' | 'diamond_to_legend' | 'legend' | 'top_5k' | 'top_legend';
export type HsguruStatCoin = 'any_player' | 'going_first' | 'on_coin';
export type HsguruSlice = { rank: HsguruStatRank; period: string; coin: HsguruStatCoin; opponentClass: string };
export type HsguruSliceEntry = HsguruSlice & { kind: 'cards' | 'matchups'; games: number | null; checkedAt: string | null };
export type HsguruPage<Row> = HsguruSlice & {
  games: number | null; winrate: number | null; changedAt: string | null; checkedAt: string | null;
  stale: boolean; sourceUrl: string; rows: Row[];
};
export type HsguruClassMatchup = { classKey: string; winrate: number; games: number; share: number | null };
export type HsguruStats = {
  slice: HsguruSlice;
  mulligan: HsguruPage<ConstructedCardStat> | null;
  classMatchups: HsguruPage<HsguruClassMatchup> | null;
  slices: HsguruSliceEntry[];
  coverage: { collected: number; planned: number } | null;
};
export type HsguruSliceField = 'rank' | 'period' | 'coin' | 'opponentClass';
export type HsguruOption = { id: string; label: string; collected: boolean };

export const HSGURU_RANKS: ReadonlyArray<{ id: HsguruStatRank; label: string }> = [
  { id: 'all', label: 'Все ранги' },
  { id: 'diamond_4to1', label: 'Алмаз 1–4' },
  { id: 'diamond_to_legend', label: 'Алмаз — Легенда' },
  { id: 'legend', label: 'Легенда' },
  { id: 'top_5k', label: 'Топ-5000' },
  { id: 'top_legend', label: 'Топ-1000' },
];
export const HSGURU_COINS: ReadonlyArray<{ id: HsguruStatCoin; label: string }> = [
  { id: 'any_player', label: 'Любая очерёдность' },
  { id: 'going_first', label: 'Первым ходом' },
  { id: 'on_coin', label: 'С монеткой' },
];
const CLASSES: ReadonlyArray<[string, string]> = [
  ['DEATHKNIGHT', 'Рыцарь смерти'], ['DEMONHUNTER', 'Охотник на демонов'], ['DRUID', 'Друид'], ['HUNTER', 'Охотник'],
  ['MAGE', 'Маг'], ['PALADIN', 'Паладин'], ['PRIEST', 'Жрец'], ['ROGUE', 'Разбойник'], ['SHAMAN', 'Шаман'],
  ['WARLOCK', 'Чернокнижник'], ['WARRIOR', 'Воин'],
];
export const HSGURU_OPPONENTS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'any', label: 'Любой соперник' },
  ...CLASSES.map(([id, label]) => ({ id, label: `Против: ${label}` })),
];
/** Windows HSGuru collects mulligans for, in its menu order; 3 and 6 hours are never planned. */
const PERIODS = ['black_empire_ban', 'black_empire', 'past_day', 'past_3_days', 'past_week', 'past_2_weeks', 'past_30_days'];

export function hsguruPeriodLabel(period: string): string {
  // `current` is asked for only before the source names its window.
  if (period === 'current') return 'Текущее дополнение';
  return standardMetaPeriodLabel(period as StandardMetaPeriod);
}

function sameExcept(entry: HsguruSlice, slice: HsguruSlice, field: HsguruSliceField): boolean {
  return (['rank', 'period', 'coin', 'opponentClass'] as const).every(key => key === field || entry[key] === slice[key]);
}

/**
 * Options of one filter with the values other filters keep: an option is
 * `collected` when its card page is stored. The period list adds the patch
 * windows the source has collected.
 */
export function hsguruOptions(field: HsguruSliceField, slice: HsguruSlice, slices: readonly HsguruSliceEntry[]): HsguruOption[] {
  const cards = slices.filter(entry => entry.kind === 'cards' && sameExcept(entry, slice, field));
  const collected = new Set(cards.map(entry => entry[field]));
  const base: ReadonlyArray<{ id: string; label: string }> = field === 'rank' ? HSGURU_RANKS
    : field === 'coin' ? HSGURU_COINS
      : field === 'opponentClass' ? HSGURU_OPPONENTS
        : [...new Set([...PERIODS, ...slices.map(entry => entry.period), slice.period])]
          .map(period => ({ id: period, label: hsguruPeriodLabel(period) }));
  return base.map(option => ({ ...option, collected: collected.has(option.id) }));
}

/** «Легенда · Баны» plus the coin and opponent when they narrow the slice. */
export function hsguruSliceLabel(slice: HsguruSlice, withOpponent = true): string {
  const parts = [HSGURU_RANKS.find(rank => rank.id === slice.rank)?.label ?? slice.rank, hsguruPeriodLabel(slice.period)];
  if (slice.coin !== 'any_player') parts.push(HSGURU_COINS.find(coin => coin.id === slice.coin)?.label ?? slice.coin);
  if (withOpponent && slice.opponentClass !== 'any') {
    parts.push(HSGURU_OPPONENTS.find(option => option.id === slice.opponentClass)?.label.toLocaleLowerCase('ru-RU') ?? slice.opponentClass);
  }
  return parts.join(' · ');
}

/** The request query of a slice; `null` asks the server for the best collected one. */
export function hsguruSliceQuery(slice: HsguruSlice | null): string {
  if (!slice) return '';
  return new URLSearchParams({ rank: slice.rank, period: slice.period, coin: slice.coin, opponent: slice.opponentClass }).toString();
}

/** «Собрано 200 из 8 289 страниц (2%)» — the whole pipeline, while its first load runs. */
export function hsguruCoverageText(coverage: HsguruStats['coverage']): string | null {
  if (!coverage || coverage.planned <= 0) return null;
  const share = Math.floor((coverage.collected / coverage.planned) * 100);
  return `собрано ${coverage.collected.toLocaleString('ru-RU')} из ${coverage.planned.toLocaleString('ru-RU')} срезов (${share}%)`;
}

/** Collected card slices nearest to the requested one, best first: what the empty state offers instead. */
export function nearestCollectedSlices(slice: HsguruSlice, slices: readonly HsguruSliceEntry[], limit = 3): HsguruSlice[] {
  const distance = (entry: HsguruSlice) => (['opponentClass', 'coin', 'rank', 'period'] as const)
    .reduce((total, key, index) => total + (entry[key] === slice[key] ? 0 : 1 + index), 0);
  return slices.filter(entry => entry.kind === 'cards')
    .map(entry => ({ entry, score: distance(entry) }))
    .sort((left, right) => left.score - right.score || (right.entry.games ?? 0) - (left.entry.games ?? 0))
    .slice(0, limit)
    .map(({ entry }) => ({ rank: entry.rank, period: entry.period, coin: entry.coin, opponentClass: entry.opponentClass }));
}
