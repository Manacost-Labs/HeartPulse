import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './GuidesArchive.css';

export function GuidesArchiveSkeleton() {
  return <LoadingSurface label="Загружаем архив" quiet layout="rows" blocksClassName="guide-archive-grid">
    {Array.from({ length: 6 }, (_, index) => <div key={index} className="guide-archive-card guide-archive-card-skeleton" aria-hidden="true">
      <LoadingBlock className="guide-archive-card-media" />
      <span className="guide-archive-card-body">
        <LoadingBlock className="guide-archive-skeleton-meta" />
        <span className="guide-archive-skeleton-title"><LoadingBlock /><LoadingBlock /></span>
        <span className="guide-archive-skeleton-description"><LoadingBlock /><LoadingBlock /></span>
        <LoadingBlock className="guide-archive-skeleton-section" />
      </span>
    </div>)}
  </LoadingSurface>;
}

export function GuideDetailSkeleton() {
  return <LoadingSurface label="Загружаем гайд" quiet layout="rows" blocksClassName="guide-archive-detail guide-detail-skeleton">
    <LoadingBlock className="guide-detail-skeleton__back" />
    <LoadingBlock className="guide-detail-skeleton__banner" />
    <div className="guide-archive-detail-header" aria-hidden="true"><LoadingBlock /></div>
    <div className="guide-archive-reader guide-detail-skeleton__reader" aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => <LoadingBlock key={index} />)}
    </div>
  </LoadingSurface>;
}
