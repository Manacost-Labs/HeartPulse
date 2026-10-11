import { LockKeyhole, ShieldCheck } from 'lucide-react';

export function ConstructedCardsBanner({ rankLabel, periodLabel, hasStatsAccess, refreshing }: {
  rankLabel: string;
  periodLabel: string;
  hasStatsAccess: boolean;
  refreshing: boolean;
}) {
  return (
    <header className="constructed-cards__header">
      <div className="traditional-mode-banner__copy">
        <h1>Карты</h1>
        <p>
          {rankLabel} · <strong>{periodLabel}</strong>
          {refreshing && <span className="constructed-cards__refreshing"> · обновляем</span>}
        </p>
        <div className="constructed-cards__beta">
          <span>Бета</span>
          <span>
            {hasStatsAccess ? <ShieldCheck size={14} /> : <LockKeyhole size={14} />}
            Статистика {rankLabel}{!hasStatsAccess && ' · подписка Алмаз'}
          </span>
        </div>
      </div>
    </header>
  );
}
