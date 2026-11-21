import type React from 'react';
import type { ReactNode } from 'react';
import { PaidMetricLock } from '../shared/ui/PaidLocks';
import { usePaidOffer } from '../shared/ui/paidOfferContext';
import FilterSelect from './ConstructedCardFilterSelect';
import '../shared/ui/LoadingSurface.css';
import { LoadingBlock } from '../shared/ui/LoadingSurface';
import { CONSTRUCTED_CARD_DETAIL_METRICS } from './constructedCardDetailMetrics';
import { number, percent, type CardFormat, type CardStats } from './constructedCardRecord';
import {
  CONSTRUCTED_CARD_RANK_OPTIONS, constructedCardPeriodOptions, type ConstructedCardPeriod, type ConstructedCardRank,
} from './constructedCardPeriods';
import { OPEN_STATISTICS_SLICE } from '../modules/constructedCards/public';
import type { ConstructedCardFilterOption } from './constructedCardFilterOptions';

// The statistics block of the card page. The card list shares only the hover
// summary and the notice (`ConstructedCardStats`), so it carries none of this.

const COUNTS = new Set(['averageTurnPlayed', 'averageCopies', 'timesPlayed']);
/** The numbers the anonymous card API opens for the open slice (`OPEN_STATISTICS_SLICE`); the other rows are paid. */
const OPEN_IDS = new Set<string>(['deckPopularity', 'deckWinrate', 'averageCopies']);

/**
 * How the rows stand for the viewer. `full`: every number. `locked` (a guest): the open numbers, a lock on the
 * place of each paid one. `waiting` (a subscriber whose paid numbers are on their way): the open numbers stay
 * and the paid places load, never a lock. `failed`: the open numbers stay, the paid places say no data.
 */
export type CardStatsMode = 'full' | 'locked' | 'waiting' | 'failed';

/**
 * The card page's rows: each metric's name and value, the same rows for everybody. A metric that gains a
 * comparison line takes one more `dd` after its value; the cell lays out any number of lines. What a number
 * counts is told once, folded, in `CardStatsAbout` (owner's rule 2026-11-20: no explanation sheet on the page).
 * `openPending`: the open numbers themselves are not here yet (another slice is loading).
 * `openSlice`: the shown slice is the open one; off it (another rank or period) a guest has a lock on every row.
 */
export function CardStatsRows({ stats, pending = false, mode = 'full', openPending = false, openSlice = true }: {
  stats: Partial<CardStats> | null; pending?: boolean; mode?: CardStatsMode; openPending?: boolean; openSlice?: boolean;
}) {
  const values = stats;
  return (
    <dl className="constructed-cards__stats" data-stats-mode={mode} aria-label={pending ? 'Загружаем статистику' : undefined}
      aria-busy={pending || mode === 'waiting' || openPending || undefined}>
      {CONSTRUCTED_CARD_DETAIL_METRICS.map(({ id, label }) => {
        const open = OPEN_IDS.has(id) && (openSlice || mode !== 'locked');
        const loading = pending || (open ? openPending : mode === 'waiting');
        return (
          <div key={id} className="constructed-cards__stat">
            <dt>{label}</dt>
            <dd className="constructed-cards__stat-value">
              {loading ? <LoadingBlock className="constructed-cards__stat-pending" />
                : mode === 'locked' && !open ? <PaidMetricLock label={label} variant="icon" />
                  : (COUNTS.has(id) ? number : percent)(mode === 'full' || open ? values?.[id as keyof CardStats] : null)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** A message under the rows with its action: «Повторить» after a failed load, «Повторить проверку» after a failed access check. */
export function StatsNotice({ message, action, busy = false, busyLabel, onAction }: {
  message: string; action: string; busy?: boolean; busyLabel?: string; onAction: () => void;
}) {
  return (
    <div className="constructed-card-detail__statistics-unavailable">
      <p role="alert">{message}</p>
      <button type="button" disabled={busy} onClick={onAction}>{busy ? busyLabel ?? action : action}</button>
    </div>
  );
}

/** «Что значат цифры»: the one-sentence meaning of every metric, closed until the reader opens it. */
export function CardStatsAbout() {
  return (
    <details className="constructed-card-detail__stats-about">
      <summary>Что значат цифры</summary>
      <dl>
        {CONSTRUCTED_CARD_DETAIL_METRICS.map(({ id, label, hint }) => <div key={id}><dt>{label}</dt><dd>{hint}</dd></div>)}
      </dl>
    </details>
  );
}

export type StatisticsFormatOption = { id: string; label: string; icon: string };

export const STATISTICS_FORMATS = {
  standard: { id: 'standard', label: 'Стандарт', icon: '/card-format-standard.webp' },
  wild: { id: 'wild', label: 'Вольный', icon: '/assets/card-format-wild-128.webp' },
} satisfies Record<string, StatisticsFormatOption>;
type SelectOption = ConstructedCardFilterOption;

/** The statistics block's title row: the rank in the heading, the slice and its freshness beside it. */
export function StatisticsHead({ rankLabel, scope, note }: { rankLabel: string; scope: string; note: ReactNode }) {
  return (
    <div className="constructed-card-detail__statistics-head" data-tour-id="card-statistics">
      <h2>Статистика · {rankLabel}</h2>
      <span className="constructed-card-detail__statistics-meta"><span>{scope}</span>{note && <span>{note}</span>}</span>
    </div>
  );
}

/**
 * Format, rank and period of the statistics. One segment per format in a
 * grid with equal columns, so a third format only adds an option. The same selects for everybody: a choice
 * closed to the viewer is an option with a lock (`locked`), the caller decides what picking it does.
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

function formatDate(value: string | null | undefined, timeZone?: string): string {
  if (!value) return 'нет данных';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone })
    : value;
}

/**
 * The statistics block of the card page, the same for everybody: head, slice controls, rows, notices.
 * `full`: the paid numbers are here. `canChoose`: the viewer may pick any rank and period. A guest has the same
 * selects: the open slice's rank and period are plain options, every other one carries a lock and opens the offer.
 * A guest on another slice (an old `?rank=legend` link) sees that slice with a lock on every row.
 */
export function CardStatisticsPanel({ stats, updatedAt, sourceUrl, mode, openPending, full, canChoose, format, formatLabel,
  standardAvailable, rank, rankLabel, period, periodLabel, currentPatch, timeZone, onChange, loadFailed, onRetry,
  accessUnavailable, accessChecking, onRefreshAccess }: {
  stats: Partial<CardStats> | null; updatedAt?: string | null; sourceUrl?: string | null;
  mode: CardStatsMode; openPending: boolean; full: boolean; canChoose: boolean;
  format: CardFormat; formatLabel: string; standardAvailable: boolean;
  rank: ConstructedCardRank; rankLabel: string; period: ConstructedCardPeriod; periodLabel: string; currentPatch: string | null;
  timeZone?: string;
  onChange: (next: { format?: CardFormat; rank?: ConstructedCardRank; period?: ConstructedCardPeriod }) => void;
  /** Why the load failed (a readable message), null when it did not. */
  loadFailed: string | null; onRetry: () => void;
  accessUnavailable: boolean; accessChecking: boolean; onRefreshAccess: () => Promise<unknown>;
}) {
  const openOffer = usePaidOffer();
  const periodOptions = constructedCardPeriodOptions(currentPatch)
    .map(option => ({ value: option.id, label: option.label, locked: !canChoose && option.id !== OPEN_STATISTICS_SLICE.period }));
  const rankOptions = CONSTRUCTED_CARD_RANK_OPTIONS
    .map(option => ({ value: option.id, label: option.label, locked: !canChoose && option.id !== OPEN_STATISTICS_SLICE.rank }));
  const pick = (options: SelectOption[], value: string, apply: () => void) => {
    if (options.find(option => option.value === value)?.locked) openOffer?.();
    else apply();
  };
  const openSlice = period === OPEN_STATISTICS_SLICE.period && rank === OPEN_STATISTICS_SLICE.rank;
  const updated = updatedAt ? `обновлено ${formatDate(updatedAt, timeZone)}` : '';
  return (
    <div className="constructed-card-detail__statistics">
      <StatisticsHead rankLabel={rankLabel} scope={`${formatLabel} · ${periodLabel}`}
        note={full ? `обновлено ${formatDate(updatedAt, timeZone)}` : stats && updated ? <>
          {updated}{sourceUrl && <> · <a href={sourceUrl} target="_blank" rel="noopener noreferrer">источник</a></>}
        </> : ''} />
      <StatisticsControls
        formats={standardAvailable ? [STATISTICS_FORMATS.standard, STATISTICS_FORMATS.wild] : [STATISTICS_FORMATS.wild]}
        format={format} onFormatChange={value => onChange({ format: value as CardFormat })}
        rank={rank} rankOptions={rankOptions}
        onRankChange={value => pick(rankOptions, value, () => onChange({ rank: value as ConstructedCardRank }))}
        period={period} periodOptions={periodOptions}
        onPeriodChange={value => pick(periodOptions, value, () => onChange({ period: value as ConstructedCardPeriod }))} />
      <CardStatsRows stats={stats} mode={mode} openPending={openPending && openSlice} openSlice={openSlice} />
      {full && !stats && <p className="constructed-card-detail__no-stats">Карта есть в библиотеке, но в выборке «{formatLabel} · {rankLabel} · {periodLabel}» недостаточно данных.</p>}
      {loadFailed && <StatsNotice message={loadFailed} action="Повторить" onAction={onRetry} />}
      {accessUnavailable && <StatsNotice message="Не удалось проверить доступ к статистике." action="Повторить проверку"
        busy={accessChecking} busyLabel="Проверяем…" onAction={() => { void onRefreshAccess(); }} />}
      <CardStatsAbout />
    </div>
  );
}
