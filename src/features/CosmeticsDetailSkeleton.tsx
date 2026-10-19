import type { CosmeticKind } from '../modules/cosmetics/public';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './Cosmetics.css';
import './CosmeticsDetailSkeleton.css';

export function CosmeticsDetailSkeleton({ kind }: { kind: CosmeticKind }) {
  return <LoadingSurface label="Загружаем предмет косметики" quiet layout="rows" className={`cosmetics-detail-skeleton cosmetics-detail-skeleton--${kind}`} blocksClassName="cosmetics-detail">
    <LoadingBlock className="cosmetics-detail-skeleton__back" />
    <LoadingBlock className="cosmetics-detail-skeleton__heading" />
    <div className="cosmetics-detail-hero" aria-hidden="true">
      <LoadingBlock className={`cosmetics-detail-primary-media${kind === 'coins' ? ' cosmetics-detail-crop' : ''}`} />
      <div className="cosmetics-detail-copy cosmetics-detail-skeleton__copy">
        <LoadingBlock /><LoadingBlock /><LoadingBlock /><LoadingBlock />
      </div>
    </div>
  </LoadingSurface>;
}
