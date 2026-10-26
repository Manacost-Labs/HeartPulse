import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { Line } from './BattlegroundsSkeletons';
import '../shared/ui/LoadingSurface.css';
import './BattlegroundsSkeletons.css';
import './BattlegroundTierList.css';

// Loading state of the Battlegrounds tier lists (minions, spells, strategies,
// trinkets): one tier of the selected list with its real grid and entries.

type TierListKey = 'minions' | 'strategies' | 'spells' | 'trinkets';

function TierEntry({ list }: { list: TierListKey }) {
  if (list === 'strategies') {
    return (
      <div className="bg-tierlist-strategy">
        <Line className="bg-skeleton-w-title" />
        <p className="bg-tierlist-strategy__meta"><Line className="bg-skeleton-w-value" /></p>
        <div className="bg-tierlist-strategy__group">
          <p><Line className="bg-skeleton-w-value" /></p>
          <div className="bg-tierlist-strategy__cards">
            {Array.from({ length: 8 }, (_, index) => <LoadingBlock key={index} className="aspect-[3/4] w-full" />)}
          </div>
        </div>
      </div>
    );
  }
  if (list === 'trinkets') return <LoadingBlock className="bg-tier-skeleton__trinket" />;
  return (
    <div className="bg-tierlist-card">
      <LoadingBlock className="bg-tier-skeleton__art" />
      <div className="bg-tierlist-card__body">
        <Line className="bg-skeleton-w-title" />
        <LoadingBlock className="bg-tier-skeleton__chip" />
      </div>
    </div>
  );
}

/** One tier of the selected list while that list loads. */
export function BattlegroundTierListSkeleton({ list }: { list: TierListKey }) {
  const count = list === 'strategies' ? 4 : 6;
  return (
    <LoadingSurface label="Загружаем тир-лист" quiet layout="rows" blocksClassName="bg-tier-skeleton">
      <div className="bg-tierlist__tier">
        <div className="bg-tierlist__tier-head"><LoadingBlock className="bg-tier-skeleton__badge" /></div>
        <div className={list === 'trinkets' ? 'bg-trinket-tier-table' : `bg-tierlist__grid bg-tierlist__grid--${list}`}>
          {Array.from({ length: count }, (_, index) => <TierEntry key={index} list={list} />)}
        </div>
      </div>
    </LoadingSurface>
  );
}
