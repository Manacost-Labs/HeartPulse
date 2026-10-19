import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './Cosmetics.css';

export function CosmeticsGridSkeleton() {
  return <LoadingSurface label="Загружаем косметику" quiet layout="rows" blocksClassName="cosmetics-grid cosmetics-grid-loading">
    {Array.from({ length: 12 }, (_, index) => <div key={index} className="cosmetics-card cosmetics-skeleton" aria-hidden="true">
      <LoadingBlock className="cosmetics-card-media" />
      <span className="cosmetics-card-name cosmetics-skeleton-name"><LoadingBlock /><LoadingBlock /></span>
    </div>)}
  </LoadingSurface>;
}
