import { lazy, Suspense, useState, type ReactNode } from 'react';
import { ChartLine, ChevronDown } from 'lucide-react';
import { LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import type { ConstructedCardHistoryPanelProps } from './ConstructedCardHistoryPanel';
import './ConstructedCardHistoryChart.css';

// The chart, KPI tiles and switches load with the first opening: the disclosure starts closed,
// and its kit must not become part of the card page's (or a sibling route's) initial chunks.
const ConstructedCardHistoryPanel = lazy(() => import('./ConstructedCardHistoryPanel'));
const ConstructedCardHistoryLocked = lazy(() => import('./ConstructedCardHistoryLocked'));

type ConstructedCardHistoryChartProps = Partial<ConstructedCardHistoryPanelProps> & {
  /** A viewer without access gets this block as it is, with an empty chart frame and the lock in place of the data. */
  lock?: ReactNode;
  periodLabel: string;
  formatLabel: string;
  rankLabel: string;
  onOpenChange?: (open: boolean) => void;
};

export default function ConstructedCardHistoryChart({ periodLabel, formatLabel, rankLabel, onOpenChange, lock, ...panel }: ConstructedCardHistoryChartProps) {
  const [open, setOpen] = useState(false);
  return (
    <details className="constructed-card-history" onToggle={event => { setOpen(event.currentTarget.open); onOpenChange?.(event.currentTarget.open); }}>
      <summary className="constructed-card-history__header" data-tour-id="card-dynamics">
        <div className="constructed-card-history__heading">
          <span aria-hidden="true"><ChartLine size={22} /></span>
          <div>
            <h2 id="constructed-card-history-title">Динамика карты</h2>
            <p>{formatLabel} · {rankLabel} · {periodLabel}</p>
          </div>
        </div>
        <span className="constructed-card-history__disclosure">
          <span>Показать или скрыть график</span>
          <ChevronDown size={20} aria-hidden="true" />
        </span>
      </summary>
      {open && lock && <div className="constructed-card-history__locked">
        <Suspense fallback={<LoadingSurface label="Загружаем" layout="rows" className="constructed-card-history__pending" />}><ConstructedCardHistoryLocked /></Suspense>
        <div className="constructed-card-history__lock">{lock}</div>
      </div>}
      {open && !lock && <Suspense fallback={<LoadingSurface label="Загружаем историю" layout="rows" className="constructed-card-history__pending" />}>
        <ConstructedCardHistoryPanel {...panel as ConstructedCardHistoryPanelProps} />
      </Suspense>}
    </details>
  );
}
