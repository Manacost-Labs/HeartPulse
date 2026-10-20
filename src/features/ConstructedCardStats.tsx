import { LockKeyhole } from 'lucide-react';
import '../shared/ui/LoadingSurface.css';
import { LoadingBlock } from '../shared/ui/LoadingSurface';
import { number, percent, type CardStats, type StandardCardsProps } from './constructedCardRecord';

// Sample values shown blurred behind the subscription notice, never real statistics.
const LOCKED_STATS_PLACEHOLDER: CardStats = {
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

export function StatsRows({ stats, compact = false, pending = false }: { stats: CardStats | null; compact?: boolean; pending?: boolean }) {
  const rows = [
    ['В % колод', percent(stats?.deckPopularity)],
    ['Победы колод', percent(stats?.deckWinrate)],
    ['Победы при розыгрыше', percent(stats?.winrateWhenPlayed)],
    ['Победы при получении', percent(stats?.winrateWhenDrawn)],
    ['Оставлено на старте', percent(stats?.keepPercentage)],
    ...(!compact ? [
      ['Победы со стартовой рукой', percent(stats?.openingHandWinrate)],
      ['Средний ход розыгрыша', number(stats?.averageTurnPlayed)],
      ['Среднее копий', number(stats?.averageCopies)],
    ] : []),
    ['Сыграно партий', number(stats?.timesPlayed)],
  ];
  return (
    <dl className={`constructed-cards__stats${compact ? ' constructed-cards__stats--compact' : ''}`}
      aria-busy={pending || undefined} aria-label={pending ? 'Загружаем статистику' : undefined}>
      {rows.map(([label, value]) => <div key={label}><dt>{label}</dt>
        <dd>{pending ? <LoadingBlock className="constructed-cards__stat-pending" /> : value}</dd></div>)}
    </dl>
  );
}

export function StatsUnlockNotice({ statsAccessLoading, authUser, onRefreshSubscription, compact = false }: StatsGateProps & { compact?: boolean }) {
  return (
    <div className={`constructed-cards__stats-lock${compact ? ' constructed-cards__stats-lock--compact' : ''}`}>
      <LockKeyhole size={compact ? 18 : 24} aria-hidden="true" />
      <div>
        <strong>Статистика доступна с тарифом «Алмаз»</strong>
        {!compact && <span>Процент колод, винрейт и игровые показатели откроются после проверки подписки.</span>}
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

/**
 * The statistics' place while access is checked or a subscriber's statistics
 * are on their way: the same rows with loading values, never the lock.
 */
export function PendingStatsRows() {
  return <StatsRows stats={null} pending />;
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
      <div className="constructed-card-detail__statistics-blur" aria-hidden="true" inert><LockedStatsRows /></div>
      <StatsUnlockNotice {...gate} />
    </div>
  );
}

export function LockedStatsRows({ compact = false }: { compact?: boolean }) {
  return <StatsRows stats={LOCKED_STATS_PLACEHOLDER} compact={compact} />;
}
