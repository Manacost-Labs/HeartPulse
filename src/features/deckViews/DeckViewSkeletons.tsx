import { LoadingBlock } from '../../shared/ui/LoadingSurface';
import { LoadingText } from '../../shared/ui/LoadingShapes';
import '../funDecks/FunDeckLayouts.css';

/** A typical deck code's length (the loaded one is about as long), so the placeholder wraps over the same lines. */
const CODE_SHAPE = 'A'.repeat(103);

/** The deck code line of an archetype build, as a text-shaped placeholder. */
export function DeckCodeSkeleton() {
  return <code className="fun-deck-code"><LoadingText className="archetype-skeleton__words">{CODE_SHAPE}</LoadingText></code>;
}

/** Placeholder of a tile column: the same shell the loaded deck has while its list loads. */
export function TileSkeleton({ code = false }: { code?: boolean }) {
  return <div className="fun-deck-tiles fun-deck-tiles--loading" aria-hidden="true">
    <div className="fun-deck-tiles__head"><LoadingBlock className="fun-deck-skeleton-icon" /><div><LoadingBlock /><LoadingBlock /></div></div>
    <LoadingBlock className="fun-deck-tiles-skeleton-stats" />
    <LoadingBlock className="fun-deck-tiles-skeleton-why" />
    <div className="fun-deck-tiles__deck"><div className="fun-deck-layout-state fun-deck-layout-state--tiles" /></div>
    <div className="fun-deck-tiles__foot">{code ? <DeckCodeSkeleton /> : null}<LoadingBlock className="fun-deck-tiles-skeleton-copy" /></div>
  </div>;
}

export function RowSkeleton({ code = false }: { code?: boolean }) {
  return <div className="fun-deck-rowcard fun-deck-rowcard--loading" aria-hidden="true">
    <LoadingBlock className="fun-deck-rows-skeleton-top" />
    <div className="fun-deck-rowcard__deck"><div className="fun-deck-layout-state fun-deck-layout-state--rows" />{code ? <DeckCodeSkeleton /> : null}</div>
  </div>;
}
