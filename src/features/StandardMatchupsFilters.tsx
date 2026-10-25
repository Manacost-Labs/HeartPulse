import {
  STANDARD_MATCHUPS_MIN_GAMES, STANDARD_MATCHUPS_RANKS,
  type StandardMatchupsAvailable, type StandardMatchupsRank, type StandardMatchupsSlice,
} from '../modules/standardMatchups/public';
import type { StandardMetaPeriod } from '../../shared/standardMetaContract';
import { orderStandardMetaPeriods, standardMetaPeriodLabel } from './standardMetaFilterModel';
import './StandardMatchupsFilters.css';

export const STANDARD_MATCHUPS_RANK_LABEL: Record<StandardMatchupsRank, string> = {
  all: 'Все ранги',
  top_legend: 'Топ-1000',
  top_5k: 'Топ-5000',
  legend: 'Легенда',
  diamond_to_legend: 'Алмаз — Легенда',
  diamond_4to1: 'Алмаз 4–1',
  bronze_plat: 'Бронза — Платина',
};

/**
 * Rank, period and minimum games of the HSGuru slice. Periods come from the
 * served payload (HSGuru's menu: the Bans window first); until it arrives the
 * period shows the default «Баны» and waits.
 */
export function StandardMatchupsFilters({ slice, period, available, onChange }: {
  slice: StandardMatchupsSlice;
  /** The period on screen: the reader's pick, else the one the source served. */
  period: string | null;
  available: StandardMatchupsAvailable | undefined;
  onChange: (patch: Partial<StandardMatchupsSlice>) => void;
}) {
  const periods = available?.periods.length
    ? orderStandardMetaPeriods(available.periods as StandardMetaPeriod[],
      (available.currentPeriod ?? null) as StandardMetaPeriod | null, null)
    : [];
  const selectedPeriod = slice.period ?? period ?? available?.defaultPeriod ?? '';
  return (
    <div className="standard-matchups-filters" aria-label="Срез матчапов" role="group" data-tour-id="matchups-filters">
      <label className="standard-matchups-filters__field">
        <span>Рейтинг</span>
        <select value={slice.rank} onChange={event => onChange({ rank: event.target.value as StandardMatchupsRank })}>
          {STANDARD_MATCHUPS_RANKS.map(rank => <option key={rank} value={rank}>{STANDARD_MATCHUPS_RANK_LABEL[rank]}</option>)}
        </select>
      </label>
      <label className="standard-matchups-filters__field">
        <span>Период</span>
        <select value={selectedPeriod} disabled={!periods.length}
          onChange={event => onChange({ period: event.target.value || null })}>
          {periods.length
            ? periods.map(option => <option key={option} value={option}>{standardMetaPeriodLabel(option)}</option>)
            : <option value={selectedPeriod}>{selectedPeriod ? standardMetaPeriodLabel(selectedPeriod as StandardMetaPeriod) : 'Баны'}</option>}
        </select>
      </label>
      <label className="standard-matchups-filters__field">
        <span>Минимум игр в паре</span>
        <select value={slice.minGames} onChange={event => onChange({ minGames: Number(event.target.value) })}>
          {STANDARD_MATCHUPS_MIN_GAMES.map(value => <option key={value} value={value}>{value.toLocaleString('ru-RU')}</option>)}
        </select>
      </label>
    </div>
  );
}
