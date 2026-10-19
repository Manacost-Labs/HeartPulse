import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './FunDecksPage.css';
import './FunDecksSkeleton.css';

export function FunDecksSkeleton() {
  return <LoadingSurface label="Собираем фан-колоды" quiet layout="rows" blocksClassName="fun-decks-grid">
    {Array.from({ length: 3 }, (_, index) => <div key={index} className="fun-deck-card fun-deck-card--loading" aria-hidden="true">
      <div className="fun-deck-card__identity"><LoadingBlock /><LoadingBlock /></div>
      <LoadingBlock className="fun-deck-skeleton-metrics" />
      <div className="fun-deck-card__deck"><LoadingBlock className="fun-deck-skeleton-preview" /><LoadingBlock className="fun-deck-card__copy" /></div>
      <LoadingBlock className="fun-deck-skeleton-source" />
    </div>)}
  </LoadingSurface>;
}
