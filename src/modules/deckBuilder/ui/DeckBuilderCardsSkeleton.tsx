import { LoadingBlock } from '../../../shared/ui/LoadingSurface';
import '../../../shared/ui/LoadingSurface.css';

/**
 * Placeholder cards of the collection grid: the real `.hp-builder-card` box
 * (1 px border, 8 px bottom padding) with the 360:497 image and the 32 px
 * action. The gallery heading keeps the single loading status, so this grid
 * stays hidden from assistive technology.
 */
export function DeckBuilderCardsSkeleton({ count = 12 }: { count?: number }) {
  return <div className="hp-builder-card-grid hp-builder-skeletons" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <div key={index} className="hp-builder-card hp-builder-card--loading">
      <LoadingBlock className="hp-builder-card-skeleton__image" />
      <LoadingBlock className="hp-builder-card-skeleton__action" />
    </div>)}
  </div>;
}
