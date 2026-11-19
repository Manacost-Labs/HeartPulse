import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import type { FunDeckLayout } from './funDecks/FunDeckLayoutSwitch';
import '../shared/ui/LoadingSurface.css';
import './FunDecksPage.css';
import './FunDecksSkeleton.css';
import './funDecks/FunDeckLayouts.css';

/** The skeleton reserves the first screen's worth of decks; the loaded list shows all of them. */
export const FUN_DECKS_FIRST_PAGE = 6;

const decks = Array.from({ length: FUN_DECKS_FIRST_PAGE }, (_, index) => index);

/** Placeholder of a tile column: the same shell the loaded deck has while its list loads. */
function TileSkeleton() {
  return <div className="fun-deck-tiles fun-deck-tiles--loading" aria-hidden="true">
    <div className="fun-deck-tiles__head"><LoadingBlock className="fun-deck-skeleton-icon" /><div><LoadingBlock /><LoadingBlock /></div></div>
    <LoadingBlock className="fun-deck-tiles-skeleton-stats" />
    <LoadingBlock className="fun-deck-tiles-skeleton-why" />
    <div className="fun-deck-tiles__deck"><div className="fun-deck-layout-state fun-deck-layout-state--tiles" /></div>
    <div className="fun-deck-tiles__foot"><LoadingBlock className="fun-deck-tiles-skeleton-copy" /></div>
  </div>;
}

function RowSkeleton() {
  return <div className="fun-deck-rowcard fun-deck-rowcard--loading" aria-hidden="true">
    <LoadingBlock className="fun-deck-rows-skeleton-top" />
    <div className="fun-deck-rowcard__deck"><div className="fun-deck-layout-state fun-deck-layout-state--rows" /></div>
  </div>;
}

function PictureSkeleton() {
  return <div className="fun-deck-card fun-deck-card--loading" aria-hidden="true">
    <div className="fun-deck-card__identity"><LoadingBlock /><LoadingBlock /></div>
    <LoadingBlock className="fun-deck-skeleton-why" />
    <LoadingBlock className="fun-deck-skeleton-metrics" />
    <div className="fun-deck-card__deck"><LoadingBlock className="fun-deck-skeleton-preview" /><LoadingBlock className="fun-deck-card__copy" /></div>
  </div>;
}

const VIEWS: Record<FunDeckLayout, { grid: string; Deck: () => React.JSX.Element }> = {
  tiles: { grid: 'fun-decks-tiles-grid', Deck: TileSkeleton },
  rows: { grid: 'fun-decks-rows', Deck: RowSkeleton },
  images: { grid: 'fun-decks-grid', Deck: PictureSkeleton },
};

export function FunDecksSkeleton({ layout = 'tiles' }: { layout?: FunDeckLayout }) {
  const { grid, Deck } = VIEWS[layout];
  return <LoadingSurface label="Загружаем фан-колоды" quiet layout="rows" blocksClassName={grid}>
    {decks.map(index => <Deck key={index} />)}
  </LoadingSurface>;
}
