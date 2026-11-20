import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { Line } from './BattlegroundsSkeletons';
import '../shared/ui/LoadingSurface.css';
import './BattlegroundsSkeletons.css';

// The loading state of a library listing. The wrappers reuse the real tile classes; blocks only stand in for data.

const LIBRARY_TILES = 12;

/** A catalog section while its cards load: one group header and the real tile grid. */
export function BgLibraryListSkeleton() {
  return (
    <LoadingSurface label="Загружаем карты" quiet layout="rows" blocksClassName="bg-library-skeleton">
      <div className="mb-4 flex items-center gap-3">
        <LoadingBlock className="bg-library-skeleton__icon" />
        <p className="font-hs text-2xl text-[#26374f]"><Line className="bg-skeleton-w-title" /></p>
        <LoadingBlock className="bg-library-skeleton__count" />
        <div className="h-px flex-1 bg-[#cbd9ed]" />
      </div>
      <div className="grid overflow-visible grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {Array.from({ length: LIBRARY_TILES }, (_, index) => (
          <div key={index} className="bg-library-skeleton__tile relative block overflow-visible rounded-md p-1 text-center">
            <LoadingBlock className="relative mx-auto aspect-[0.72] w-full max-w-[240px]" />
            <div className="bg-library-card-caption mx-auto mt-2 max-w-[220px] px-2 py-1">
              <p className="font-hs text-sm leading-tight text-[#26374f]"><Line className="bg-skeleton-w-title" /></p>
              <p className="mt-1 text-xs leading-tight text-[#657893]"><Line className="bg-skeleton-w-value" /></p>
              <div className="mt-1 flex flex-wrap justify-center gap-1" />
            </div>
          </div>
        ))}
      </div>
    </LoadingSurface>
  );
}
