import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { Line } from './BattlegroundsSkeletons';
import '../shared/ui/LoadingSurface.css';
import './BattlegroundsSkeletons.css';

// Loading state of the Battlegrounds tier lists (minions, spells, strategies,
// trinkets): one tier panel with the selected list's real grid and cards.

type TierListKey = 'minions' | 'strategies' | 'spells' | 'trinkets';
const TIER_GRID: Record<TierListKey, string> = {
  minions: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
  spells: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
  strategies: 'grid gap-3 lg:grid-cols-2',
  trinkets: 'bg-trinket-tier-table',
};

function TierEntry({ list }: { list: TierListKey }) {
  if (list === 'strategies') {
    return (
      <div className="bg-tier-strategy-card rounded-lg border p-3 shadow-sm">
        <p className="font-hs text-[15px] leading-tight text-[#3d2a1e]"><Line className="bg-skeleton-w-title" /></p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#74552f]"><Line className="bg-skeleton-w-value" /></p>
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#8b6c42]"><Line className="bg-skeleton-w-value" /></p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
            {Array.from({ length: 8 }, (_, index) => <LoadingBlock key={index} className="aspect-[3/4] w-full" />)}
          </div>
        </div>
      </div>
    );
  }
  if (list === 'trinkets') return <LoadingBlock className="bg-tier-skeleton__trinket" />;
  return (
    <div className="bg-tier-entry-card flex min-h-[132px] gap-3 rounded-lg border border-[#c4a46a]/50 bg-[#fff8ea]/95 p-3 text-left shadow-sm">
      <LoadingBlock className="h-[108px] w-[80px] flex-shrink-0" />
      <div className="min-w-0 flex-1 py-1">
        <p className="font-hs text-[15px] leading-tight text-[#2f2118]"><Line className="bg-skeleton-w-title" /></p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <LoadingBlock className="bg-tier-skeleton__chip" />
          <LoadingBlock className="bg-tier-skeleton__chip" />
        </div>
      </div>
    </div>
  );
}

/** One tier of the selected list while that list loads. */
export function BattlegroundTierListSkeleton({ list }: { list: TierListKey }) {
  const count = list === 'strategies' ? 4 : 6;
  return (
    <LoadingSurface label="Загружаем тир-лист" quiet layout="rows" className="mt-4" blocksClassName="bg-tier-skeleton">
      <div className="bg-tier-rank-panel rounded-lg border p-3">
        <div className="mb-3 flex items-center gap-3">
          <LoadingBlock className="bg-skeleton-badge" />
          <div>
            <p className="font-hs text-lg text-[#3d2a1e]"><Line className="bg-skeleton-w-value" /></p>
            <p className="text-xs text-[#8b6c42]"><Line className="bg-skeleton-w-value" /></p>
          </div>
        </div>
        <div className={TIER_GRID[list]}>
          {Array.from({ length: count }, (_, index) => <TierEntry key={index} list={list} />)}
        </div>
      </div>
    </LoadingSurface>
  );
}
