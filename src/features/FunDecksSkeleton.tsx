import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import type { DeckLayout } from './deckViews/DeckLayoutSwitch';
import { RowSkeleton, TileSkeleton } from './deckViews/DeckViewSkeletons';
import '../shared/ui/LoadingSurface.css';
import './FunDecksPage.css';
import './FunDecksSkeleton.css';
import './funDecks/FunDeckLayouts.css';

/** The skeleton reserves the first screen's worth of decks; the loaded list shows all of them. */
export const FUN_DECKS_FIRST_PAGE = 6;

const decks = Array.from({ length: FUN_DECKS_FIRST_PAGE }, (_, index) => index);



function PictureSkeleton() {
  return <div className="fun-deck-card fun-deck-card--loading" aria-hidden="true">
    <div className="fun-deck-card__identity"><LoadingBlock /><LoadingBlock /></div>
    <LoadingBlock className="fun-deck-skeleton-why" />
    <LoadingBlock className="fun-deck-skeleton-metrics" />
    <div className="fun-deck-card__deck"><LoadingBlock className="fun-deck-skeleton-preview" /><LoadingBlock className="fun-deck-card__copy" /></div>
  </div>;
}

const VIEWS: Record<DeckLayout, { grid: string; Deck: () => React.JSX.Element }> = {
  tiles: { grid: 'fun-decks-tiles-grid', Deck: () => <TileSkeleton funDeck /> },
  rows: { grid: 'fun-decks-rows', Deck: () => <RowSkeleton /> },
  images: { grid: 'fun-decks-grid', Deck: PictureSkeleton },
};

export function FunDecksSkeleton({ layout = 'tiles' }: { layout?: DeckLayout }) {
  const { grid, Deck } = VIEWS[layout];
  return <LoadingSurface label="Загружаем фан-колоды" quiet layout="rows" blocksClassName={grid}>
    {decks.map(index => <Deck key={index} />)}
  </LoadingSurface>;
}
