import { LockKeyhole } from 'lucide-react';
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

export type StatsGateProps = Pick<StandardCardsProps, 'statsAccessLoading' | 'authUser' | 'onRefreshSubscription'>;

export function StatsRows({ stats, compact = false }: { stats: CardStats | null; compact?: boolean }) {
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
    <dl className={`constructed-cards__stats${compact ? ' constructed-cards__stats--compact' : ''}`}>
      {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
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

export function LockedStatsRows({ compact = false }: { compact?: boolean }) {
  return <StatsRows stats={LOCKED_STATS_PLACEHOLDER} compact={compact} />;
}
