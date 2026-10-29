import type React from 'react';
import FilterSelect from './ConstructedCardFilterSelect';
import { LOCKED_STATS_PLACEHOLDER, StatsRows, StatsUnlockNotice, type StatsGateProps } from './ConstructedCardStats';
import { CONSTRUCTED_CARD_METRIC_HINTS } from './constructedCardMetricHints';
import type { CardStats } from './constructedCardRecord';

// The statistics block of the card page. The card list shares only the rows and
// the notice (`ConstructedCardStats`), so it carries none of this.

/** The card page's rows: each metric with its one-sentence explanation under the value. */
export function CardStatsRows({ stats, pending = false }: { stats: CardStats | null; pending?: boolean }) {
  return <StatsRows stats={stats} pending={pending} hints={CONSTRUCTED_CARD_METRIC_HINTS} />;
}

export type StatisticsFormatOption = { id: string; label: string; icon: string };

export const STATISTICS_FORMATS = {
  standard: { id: 'standard', label: 'Стандарт', icon: '/card-format-standard.webp' },
  wild: { id: 'wild', label: 'Вольный', icon: '/assets/card-format-wild-128.webp' },
} satisfies Record<string, StatisticsFormatOption>;
type SelectOption = { value: string; label: string };

/** The statistics block's title row: the rank in the heading, the slice and its freshness beside it. */
export function StatisticsHead({ rankLabel, scope, note }: { rankLabel: string; scope: string; note: string }) {
  return (
    <div className="constructed-card-detail__statistics-head" data-tour-id="card-statistics">
      <h2>Статистика · {rankLabel}</h2>
      <span className="constructed-card-detail__statistics-meta"><span>{scope}</span>{note && <span>{note}</span>}</span>
    </div>
  );
}

/**
 * Format, rank and period of the statistics. One segment per format in a
 * grid with equal columns, so a third format only adds an option.
 */
export function StatisticsControls({ formats, format, onFormatChange, rank, rankOptions, onRankChange, period, periodOptions, onPeriodChange }: {
  formats: StatisticsFormatOption[];
  format: string;
  onFormatChange: (format: string) => void;
  rank: string;
  rankOptions: SelectOption[];
  onRankChange: (rank: string) => void;
  period: string;
  periodOptions: SelectOption[];
  onPeriodChange: (period: string) => void;
}) {
  return (
    <div className="constructed-card-detail__statistics-controls" role="group" aria-label="Выбор статистики карты"
      style={{ '--statistics-formats': formats.length } as React.CSSProperties}>
      <div className="constructed-card-detail__statistics-field">
        <span aria-hidden="true">Формат</span>
        <div className="constructed-card-detail__statistics-format" role="group" aria-label="Формат статистики">
          {formats.map(option => (
            <button key={option.id} type="button" aria-pressed={format === option.id} onClick={() => onFormatChange(option.id)}>
              <img src={option.icon} alt="" />{option.label}
            </button>
          ))}
        </div>
      </div>
      <FilterSelect label="Ранг" value={rank} onChange={onRankChange} options={rankOptions} />
      <FilterSelect label="Период" value={period} onChange={onPeriodChange} options={periodOptions} />
    </div>
  );
}

/**
 * The statistics' place while access is checked or a subscriber's statistics
 * are on their way: the same rows with loading values, never the lock.
 */
export function PendingStatsRows() {
  return <CardStatsRows stats={null} pending />;
}

/**
 * The lock belongs to a confirmed answer without access. While access is
 * checked, or a subscriber's statistics are on their way (`loadedWithAccess`:
 * the access the shown card was requested with), the panel stays pending.
 */
export function statisticsPending({ open, failed, statsAccessLoading, statsAccess, loadedWithAccess }: {
  open: boolean; failed: boolean; statsAccessLoading: boolean; statsAccess: boolean; loadedWithAccess: boolean | null;
}): boolean {
  return !open && !failed && (statsAccessLoading || (statsAccess && loadedWithAccess !== true));
}

/**
 * The card page's statistics for a viewer without access: sample rows behind
 * the notice. When the access check failed instead, the rows wait for a retry.
 */
export function LockedStatsPanel(gate: StatsGateProps) {
  if (gate.statsAccessUnavailable) {
    return (
      <div className="constructed-card-detail__statistics-unavailable">
        <PendingStatsRows />
        <p role="alert">Не удалось проверить доступ к статистике.</p>
        <button type="button" disabled={gate.statsAccessLoading} onClick={() => { void gate.onRefreshSubscription(); }}>
          {gate.statsAccessLoading ? 'Проверяем…' : 'Повторить проверку'}
        </button>
      </div>
    );
  }
  return (
    <div className="constructed-card-detail__statistics-gate">
      <div className="constructed-card-detail__statistics-blur" aria-hidden="true" inert><CardStatsRows stats={LOCKED_STATS_PLACEHOLDER} /></div>
      <StatsUnlockNotice {...gate} />
    </div>
  );
}
