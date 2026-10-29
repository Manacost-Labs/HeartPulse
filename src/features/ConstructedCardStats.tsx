import { LockKeyhole } from 'lucide-react';
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

const LIST_METRICS: ConstructedCardMetricId[] = ['deckPopularity', 'deckWinrate', 'winrateWhenPlayed', 'winrateWhenDrawn', 'keepPercentage', 'timesPlayed'];

/** The hover summary in the card list: the six metrics the list shows, names only. */
export function StatsRows({ stats }: { stats: CardStats | null }) {
  return (
    <dl className="constructed-cards__stats constructed-cards__stats--compact">
      {LIST_METRICS.map(id => (
        <div key={id} className="constructed-cards__stat">
          <dt>{CONSTRUCTED_CARD_METRICS[id].label}</dt>
          <dd className="constructed-cards__stat-value">{id === 'timesPlayed' ? number(stats?.[id]) : percent(stats?.[id])}</dd>
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
  return <StatsRows stats={LOCKED_STATS_PLACEHOLDER} />;
}
