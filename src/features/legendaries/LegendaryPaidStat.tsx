import { LockKeyhole } from 'lucide-react';
import { LEGENDARY_PAID_COLUMNS, formatLegendaryStat, type LegendaryPaidKey } from './legendaryStats';
import './LegendariesOpenLayer.css';

/**
 * One paid cell of a group. Every viewer sees the column name and what it
 * tells; the value only a subscriber (`unlocked`). A guest gets a button that
 * opens the subscription offer. The class is the one the page's JSON-LD names
 * as the closed part (`.paywalled-legendaries`). All states keep the cell's size.
 */
export function LegendaryPaidStat({ metric, value, tone, available, unlocked, loading, failed, onLocked }: {
  metric: LegendaryPaidKey;
  value: number | null | undefined;
  tone: string;
  /** The source has this figure at all. */
  available: boolean;
  unlocked: boolean;
  /** A subscriber's protected answer is on its way. */
  loading: boolean;
  failed: boolean;
  onLocked: (metric: LegendaryPaidKey) => void;
}) {
  const column = LEGENDARY_PAID_COLUMNS[metric];
  let body;
  if (!available) body = <div className="legendary-paid-stat__value text-[#8b6c42]">Нет данных</div>;
  else if (!unlocked) {
    body = <button type="button" className="legendary-paid-stat__lock" onClick={() => onLocked(metric)}
      aria-label={`${column.label}: доступно по подписке. Узнать, как открыть`}>
      <LockKeyhole size={13} aria-hidden="true" /><span>По подписке</span>
    </button>;
  } else if (loading) {
    body = <div className="legendary-paid-stat__value text-[#8b6c42]" aria-busy="true"><span aria-hidden="true">…</span><span className="sr-only">Загружаем</span></div>;
  } else {
    body = <div className={`legendary-paid-stat__value font-black ${tone}`}
      title={failed ? 'Не удалось загрузить платные показатели' : undefined}>
      {formatLegendaryStat(value, metric === 'score' ? 'score' : 'pct')}
    </div>;
  }
  return <div className="paywalled-legendaries legendary-paid-stat min-w-0 rounded px-1.5 py-1.5 text-center"
    data-metric={metric} data-state={!available ? 'none' : unlocked ? 'open' : 'locked'} title={column.hint}>
    <div className="truncate text-[11px] leading-tight text-[#735e49]">{column.label}</div>
    {body}
  </div>;
}
