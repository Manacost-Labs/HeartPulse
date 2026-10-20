import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './StandardCards.styles';
import './CardCatalogSkeleton.css';

const GALLERY_CARDS = 18;
const TABLE_ROWS = 10;

/**
 * The first load of the card catalog results. It reuses the real gallery
 * grid, tile padding and 0.72 card art, or the real table frame and row
 * heights, so the swap to cards does not move the page.
 */
export function CardCatalogSkeleton({ view = 'gallery' }: { view?: 'gallery' | 'table' }) {
  if (view === 'table') {
    return <LoadingSurface label="Загружаем библиотеку карт" quiet layout="rows" blocksClassName="constructed-cards__table-wrap card-catalog-skeleton__table">
      <LoadingBlock className="card-catalog-skeleton__table-tools" />
      <LoadingBlock className="card-catalog-skeleton__table-head" />
      <div className="card-catalog-skeleton__table-rows">
        {Array.from({ length: TABLE_ROWS }, (_, index) => <LoadingBlock key={index} />)}
      </div>
    </LoadingSurface>;
  }
  return <LoadingSurface label="Загружаем библиотеку карт" quiet layout="rows" blocksClassName="constructed-cards__gallery">
    {Array.from({ length: GALLERY_CARDS }, (_, index) => <div key={index} className="constructed-cards__gallery-card card-catalog-skeleton__card">
      <div className="constructed-cards__gallery-card-link">
        <LoadingBlock className="constructed-cards__gallery-image" />
        <LoadingBlock className="card-catalog-skeleton__name" />
        <span className="constructed-cards__gallery-stat"><LoadingBlock className="card-catalog-skeleton__stat" /></span>
      </div>
    </div>)}
  </LoadingSurface>;
}
