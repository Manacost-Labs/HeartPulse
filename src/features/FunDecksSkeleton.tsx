import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './FunDecksPage.css';
import './FunDecksSkeleton.css';

/** The first screen of the selection shows six decks (FunDecksPage `visibleCount`); the skeleton reserves all six. */
export const FUN_DECKS_FIRST_PAGE = 6;

export function FunDecksSkeleton() {
  return <LoadingSurface label="Загружаем фан-колоды" quiet layout="rows" blocksClassName="fun-decks-grid">
    {Array.from({ length: FUN_DECKS_FIRST_PAGE }, (_, index) => <div key={index} className="fun-deck-card fun-deck-card--loading" aria-hidden="true">
      <div className="fun-deck-card__identity"><LoadingBlock /><LoadingBlock /></div>
      <LoadingBlock className="fun-deck-skeleton-why" />
      <LoadingBlock className="fun-deck-skeleton-metrics" />
      <div className="fun-deck-card__deck"><LoadingBlock className="fun-deck-skeleton-preview" /><LoadingBlock className="fun-deck-card__copy" /></div>
      <LoadingBlock className="fun-deck-skeleton-source" />
    </div>)}
  </LoadingSurface>;
}
