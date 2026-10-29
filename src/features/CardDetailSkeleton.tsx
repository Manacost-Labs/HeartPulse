import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { PendingStatsRows } from './ConstructedCardStatistics';
import '../shared/ui/LoadingSurface.css';
import './StandardCards.styles';
import './CardDetailSkeleton.css';

const FACTS = 10;

/**
 * The first load of a card page. The real breadcrumb, back control and hero
 * classes give the frame, the card art box and the identity/statistics
 * columns; placeholders stand in for text and controls only.
 */
export function CardDetailSkeleton() {
  return <LoadingSurface label="Загружаем карту" quiet layout="rows" className="card-detail-skeleton" blocksClassName="constructed-cards constructed-card-detail">
    <div className="constructed-card-detail__breadcrumb"><LoadingBlock className="card-detail-skeleton__breadcrumb" /></div>
    <LoadingBlock className="card-detail-skeleton__back" />
    <div className="constructed-card-detail__hero">
      <div className="constructed-card-detail__visual">
        <LoadingBlock className="card-detail-skeleton__art" />
        <LoadingBlock className="card-detail-skeleton__variants" />
      </div>
      <div className="constructed-card-detail__identity">
        <div className="constructed-card-detail__title">
          <LoadingBlock className="card-detail-skeleton__class" />
          <div className="card-detail-skeleton__name"><LoadingBlock /><LoadingBlock /></div>
        </div>
        <div className="constructed-card-detail__meta">
          {Array.from({ length: FACTS }, (_, index) => <div key={index}><LoadingBlock className="card-detail-skeleton__term" /><LoadingBlock className="card-detail-skeleton__value" /></div>)}
        </div>
        <div className="constructed-card-detail__copy card-detail-skeleton__copy"><LoadingBlock /><LoadingBlock /><LoadingBlock /></div>
      </div>
      <div className="constructed-card-detail__statistics">
        <div className="constructed-card-detail__statistics-head">
          <LoadingBlock className="card-detail-skeleton__stats-title" />
          <span className="constructed-card-detail__statistics-meta">
            <LoadingBlock className="card-detail-skeleton__stats-line" /><LoadingBlock className="card-detail-skeleton__stats-line" />
          </span>
        </div>
        <div className="constructed-card-detail__statistics-controls">
          <div className="constructed-card-detail__statistics-field"><span>Формат</span><LoadingBlock className="card-detail-skeleton__control" /></div>
          <div className="constructed-cards__filter"><span>Ранг</span><LoadingBlock className="card-detail-skeleton__control" /></div>
          <div className="constructed-cards__filter"><span>Период</span><LoadingBlock className="card-detail-skeleton__control" /></div>
        </div>
        {/* The labels and explanations are fixed text: only the values wait. */}
        <div className="card-detail-skeleton__stats"><PendingStatsRows /></div>
      </div>
    </div>
  </LoadingSurface>;
}
