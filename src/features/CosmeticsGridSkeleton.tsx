import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './Cosmetics.css';
import './CosmeticsGridSkeleton.css';

/** Heroes per catalog page (the server's default `per_page`): the skeleton reserves a whole first page. */
export const COSMETICS_FIRST_PAGE = 48;

export function CosmeticsGridSkeleton() {
  return <>
    {/* The results line above the loaded grid («N объектов»): same row, no fabricated count. */}
    <div className="cosmetics-results-meta" aria-hidden="true"><LoadingBlock className="cosmetics-skeleton-results" /></div>
    <LoadingSurface label="Загружаем косметику" quiet layout="rows" blocksClassName="cosmetics-grid cosmetics-grid-loading">
      {Array.from({ length: COSMETICS_FIRST_PAGE }, (_, index) => <div key={index} className="cosmetics-card cosmetics-skeleton" aria-hidden="true">
        <LoadingBlock className="cosmetics-card-media" />
        <span className="cosmetics-card-name cosmetics-skeleton-name"><LoadingBlock /><LoadingBlock /></span>
      </div>)}
    </LoadingSurface>
  </>;
}
