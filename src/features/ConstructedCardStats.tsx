import { LockKeyhole } from 'lucide-react';
import '../shared/ui/LoadingSurface.css';
import { LoadingBlock } from '../shared/ui/LoadingSurface';
import { CONSTRUCTED_CARD_METRICS, type ConstructedCardMetricId } from './constructedCardMetrics';
import { number, percent, type CardStats, type StandardCardsProps } from './constructedCardRecord';

// Sample values shown blurred behind the subscription notice, never real statistics.
export const LOCKED_STATS_PLACEHOLDER: CardStats = {
  deckPopularity: 18.7,
  deckWinrate: 53.4,
  averageCopies: 1.8,
  timesPlayed: 12480,
  winrateWhenPlayed: 56.2,
  winrateWhenDrawn: 54.1,
  keepPercentage: 42.6,
  openingHandWinrate: 52.8,
  averageTurnsInHand: 2.4,
  averageTurnPlayed: 5.3,
};

export type StatsGateProps = Pick<StandardCardsProps, 'statsAccessLoading' | 'statsAccessUnavailable' | 'authUser' | 'onRefreshSubscription'>;

type MetricRow = { id: ConstructedCardMetricId; format: (stats: CardStats | null) => string };

const percentOf = (key: keyof CardStats) => (stats: CardStats | null) => percent(stats?.[key]);
const numberOf = (key: keyof CardStats) => (stats: CardStats | null) => number(stats?.[key]);

const COMPACT_ROWS: MetricRow[] = [
  { id: 'deckPopularity', format: percentOf('deckPopularity') },
  { id: 'deckWinrate', format: percentOf('deckWinrate') },
  { id: 'winrateWhenPlayed', format: percentOf('winrateWhenPlayed') },
  { id: 'winrateWhenDrawn', format: percentOf('winrateWhenDrawn') },
  { id: 'keepPercentage', format: percentOf('keepPercentage') },
  { id: 'timesPlayed', format: numberOf('timesPlayed') },
];

const DETAIL_ROWS: MetricRow[] = [
  ...COMPACT_ROWS.slice(0, 5),
  { id: 'openingHandWinrate', format: percentOf('openingHandWinrate') },
  { id: 'averageTurnPlayed', format: numberOf('averageTurnPlayed') },
  { id: 'averageCopies', format: numberOf('averageCopies') },
  COMPACT_ROWS[5],
];

/**
 * The card's numbers. The card page passes `hints` and prints a one-line
 * explanation under each value; the hover summary (`compact`) keeps the names
 * only. A metric that gains a comparison line takes one more `dd` between its
 * value and hint; the cell lays out any number of lines. The hints come from
 * the card page's own module so the card list does not carry them.
 */
export function StatsRows({ stats, compact = false, pending = false, hints }: {
  stats: CardStats | null; compact?: boolean; pending?: boolean; hints?: Record<ConstructedCardMetricId, string>;
}) {
  return (
    <dl className={`constructed-cards__stats${compact ? ' constructed-cards__stats--compact' : ''}`}
      aria-busy={pending || undefined} aria-label={pending ? 'Загружаем статистику' : undefined}>
      {(compact ? COMPACT_ROWS : DETAIL_ROWS).map(({ id, format }) => (
        <div key={id} className="constructed-cards__stat">
          <dt>{CONSTRUCTED_CARD_METRICS[id].label}</dt>
          <dd className="constructed-cards__stat-value">{pending ? <LoadingBlock className="constructed-cards__stat-pending" /> : format(stats)}</dd>
          {hints && <dd className="constructed-cards__stat-hint">{hints[id]}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function StatsUnlockNotice({ statsAccessLoading, authUser, onRefreshSubscription, compact = false }: StatsGateProps & { compact?: boolean }) {
  return (
    <div className={`constructed-cards__stats-lock${compact ? ' constructed-cards__stats-lock--compact' : ''}`}>
      <LockKeyhole size={compact ? 18 : 24} aria-hidden="true" />
      <div>
        <strong>Статистика доступна с тарифом «Алмаз»</strong>
        {!compact && <span>Популярность, винрейт и игровые показатели откроются после проверки подписки.</span>}
      </div>
      {!compact && (!authUser ? (
        <a href="/?login">Войти</a>
      ) : (
        <button type="button" disabled={statsAccessLoading} onClick={() => { void onRefreshSubscription(); }}>
          {statsAccessLoading ? 'Проверяем…' : 'Проверить доступ'}
        </button>
      ))}
    </div>
  );
}

export function LockedStatsRows() {
  return <StatsRows stats={LOCKED_STATS_PLACEHOLDER} compact />;
}
