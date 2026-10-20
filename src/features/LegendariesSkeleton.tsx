import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './LegendariesSkeleton.css';

// Two desktop rows of three groups; most groups pair the key card with three cards.
const GROUP_SLOTS = 6;
const COMPANION_SLOTS = 3;
const METRIC_SLOTS = 4;

/**
 * The initial loading state of the Arena legendary groups. It reuses the real
 * grid and group card classes: the key card render, its name and win rate
 * badge, the companion cards with two-line names and the four-metric footer.
 */
export function LegendariesSkeleton() {
  return <LoadingSurface label="Загружаем легендарные группы" quiet layout="rows"
    blocksClassName="legendary-groups-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: GROUP_SLOTS }, (_, group) => <div key={group}
      className="legendary-group-card legendary-group-card--loading rounded-2xl flex flex-col items-center p-4 gap-3">
      <LoadingBlock className="legendary-skeleton-key-card w-36" />
      <div className="flex flex-col items-center gap-1 w-full">
        <LoadingBlock className="legendary-skeleton-name" />
        <LoadingBlock className="legendary-skeleton-badge" />
      </div>
      <div className="legendary-group-divider w-full h-px" />
      <div className="flex gap-2 justify-center flex-wrap">
        {Array.from({ length: COMPANION_SLOTS }, (_, card) => <div key={card} className="flex flex-col items-center gap-0.5">
          <LoadingBlock className="legendary-skeleton-card w-20" />
          <span className="legendary-skeleton-card-name"><LoadingBlock /><LoadingBlock /></span>
        </div>)}
      </div>
      <div className="legendary-stats-footer w-full grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
        {Array.from({ length: METRIC_SLOTS }, (_, metric) => <div key={metric}
          className="legendary-skeleton-metric min-w-0 rounded px-1.5 py-1.5">
          <LoadingBlock className="legendary-skeleton-metric-label" />
          <LoadingBlock className="legendary-skeleton-metric-value" />
        </div>)}
      </div>
    </div>)}
  </LoadingSurface>;
}
