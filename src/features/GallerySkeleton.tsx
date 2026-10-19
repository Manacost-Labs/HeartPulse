import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './GallerySkeleton.css';

export function GallerySkeleton() {
  return <LoadingSurface label="Загружаем галерею" quiet layout="rows" blocksClassName="gallery-grid">
    {Array.from({ length: 6 }, (_, index) => <div key={index} className="gallery-card gallery-card--loading" aria-hidden="true">
      <LoadingBlock className="gallery-card-image" />
      <div className="gallery-card-body">
        <div><LoadingBlock className="gallery-skeleton-tag" /><LoadingBlock className="gallery-skeleton-title" /><LoadingBlock className="gallery-skeleton-description" /></div>
        <LoadingBlock className="gallery-skeleton-meta" />
        <LoadingBlock className="gallery-download" />
      </div>
    </div>)}
  </LoadingSurface>;
}
