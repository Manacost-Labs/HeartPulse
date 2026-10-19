import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './MatchupsSkeleton.css';

export function MatchupsSkeleton() {
  return <LoadingSurface label="Загружаем матчапы" quiet layout="rows" blocksClassName="matchups-skeleton-body">
    <LoadingBlock className="matchups-skeleton-view" />
    <div className="standard-matchups__picker matchups-skeleton-picker mb-4 rounded-xl border border-[#d7b56e]/60 bg-white/55 p-3 sm:p-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="matchups-skeleton-heading"><h3 className="font-hs text-xl">Быстрый просмотр матчапов</h3><p className="text-sm">Выберите архетип и сразу смотрите удобные, ровные и сложные пары.</p></div>
        <LoadingBlock className="matchups-skeleton-select w-full md:w-[320px]" />
      </div>
      <LoadingBlock className="matchups-skeleton-quick" />
      <div className="matchups-skeleton-tools"><LoadingBlock /><LoadingBlock /></div>
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">{[0, 1, 2].map(index => <div key={index} className="matchups-skeleton-group"><LoadingBlock /><LoadingBlock /></div>)}</div>
    </div>
  </LoadingSurface>;
}
