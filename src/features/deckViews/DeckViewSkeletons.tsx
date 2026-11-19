import { LoadingBlock } from '../../shared/ui/LoadingSurface';
import '../funDecks/FunDeckLayouts.css';

/** Placeholder of a tile column: the same shell the loaded deck has while its list loads. */
export function TileSkeleton() {
  return <div className="fun-deck-tiles fun-deck-tiles--loading" aria-hidden="true">
    <div className="fun-deck-tiles__head"><LoadingBlock className="fun-deck-skeleton-icon" /><div><LoadingBlock /><LoadingBlock /></div></div>
    <LoadingBlock className="fun-deck-tiles-skeleton-stats" />
    <LoadingBlock className="fun-deck-tiles-skeleton-why" />
    <div className="fun-deck-tiles__deck"><div className="fun-deck-layout-state fun-deck-layout-state--tiles" /></div>
    <div className="fun-deck-tiles__foot"><LoadingBlock className="fun-deck-tiles-skeleton-copy" /></div>
  </div>;
}

export function RowSkeleton() {
  return <div className="fun-deck-rowcard fun-deck-rowcard--loading" aria-hidden="true">
    <LoadingBlock className="fun-deck-rows-skeleton-top" />
    <div className="fun-deck-rowcard__deck"><div className="fun-deck-layout-state fun-deck-layout-state--rows" /></div>
  </div>;
}
