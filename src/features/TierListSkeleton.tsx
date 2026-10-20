import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './TierListSkeleton.css';

// «Все карты», eleven classes and neutral cards: the class row of the controls.
const CLASS_SLOTS = 13;
// Two full desktop rows per tier: the first viewport of the gallery.
const CARDS_PER_TIER = 12;
const TIER_SLOTS = 2;

/**
 * The initial loading state of the Arena tier list. It reuses the real
 * controls frame and the tier group, heading and card grid classes, so the
 * columns, card ratio, borders and spacing come from the loaded view's CSS.
 */
export function TierListSkeleton({ canUseTable = true }: { canUseTable?: boolean }) {
  return <LoadingSurface label="Загружаем тир-лист" quiet layout="rows" className="tierlist-skeleton"
    blocksClassName="tierlist-skeleton__blocks">
    <div className="arena-tier-controls">
      <div className="arena-tier-controls-top">
        <div className="arena-tier-classes">
          {Array.from({ length: CLASS_SLOTS }, (_, index) => <LoadingBlock key={index} className="tierlist-skeleton-class" />)}
        </div>
        <div className="arena-tier-search"><LoadingBlock className="tierlist-skeleton-search" /></div>
      </div>
      <div className="arena-tier-controls-bottom">
        <div className="arena-tier-selection"><LoadingBlock className="tierlist-skeleton-selection" /></div>
        <div className="arena-tier-filters">
          <LoadingBlock className="tierlist-skeleton-select tierlist-skeleton-select--rarity" />
          <LoadingBlock className="tierlist-skeleton-select tierlist-skeleton-select--mana" />
          {canUseTable && <LoadingBlock className="tierlist-skeleton-view" />}
        </div>
      </div>
    </div>
    <div className="tierlist-groups space-y-10">
      {Array.from({ length: TIER_SLOTS }, (_, tier) => <div key={tier} className="tierlist-group">
        <div className="tierlist-group-heading flex items-center gap-4 mb-5">
          <LoadingBlock className="tierlist-skeleton-badge" />
          <LoadingBlock className="tierlist-skeleton-tier-title" />
        </div>
        <div className="tierlist-card-grid">
          {Array.from({ length: CARDS_PER_TIER }, (_, card) => <div key={card} className="tierlist-skeleton-cell">
            <LoadingBlock className="tierlist-skeleton-card" />
          </div>)}
        </div>
      </div>)}
    </div>
  </LoadingSurface>;
}
