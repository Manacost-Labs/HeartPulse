import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import '../../../shared/ui/LoadingSurface.css';
import './ContestsSkeleton.css';

export function ContestsSkeleton() {
  return <LoadingSurface label="Загружаем конкурсы" quiet layout="rows" blocksClassName="contest-grid">
    {Array.from({ length: 3 }, (_, index) => <div key={index} className="contest-card contest-card--loading" aria-hidden="true">
      <LoadingBlock className="contest-card-image" />
      <div className="contest-card-body">
        <LoadingBlock className="contest-skeleton-kicker" />
        <LoadingBlock className="contest-skeleton-title" />
        <LoadingBlock className="contest-skeleton-description" />
        <LoadingBlock className="contest-skeleton-meta" />
        <LoadingBlock className="contest-skeleton-action" />
      </div>
    </div>)}
  </LoadingSurface>;
}
