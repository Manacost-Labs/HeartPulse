import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import '../../../shared/ui/LoadingSurface.css';
import { ROW_CLASS_NAME, ROW_STYLE } from './arenaClassRow';
import './ArenaClassesBoard.css';

/** The leader frame and eleven ledger rows of the class ranking, then the closed chart disclosure below it. */
export function ArenaClassesSkeleton() {
  return <LoadingSurface label="Загружаем статистику классов" quiet layout="rows" blocksClassName="arena-classes-skeleton">
    <div className="arena-classes-board arena-classes-loading space-y-2.5 sm:space-y-3 relative">
      {Array.from({ length: 11 }, (_, index) => <div key={index} className={ROW_CLASS_NAME} style={ROW_STYLE} data-rank={index + 1}>
        <LoadingBlock className="arena-class-rank" />
        <LoadingBlock className="arena-class-placeholder-icon w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0 rounded-full" />
        <div className="min-w-0 sm:flex-shrink-0 sm:w-40"><LoadingBlock className="block h-4 w-24" /></div>
        <LoadingBlock className="arena-class-meter arena-class-meter--loading relative h-7 sm:h-8 rounded-full overflow-hidden sm:flex-grow" />
      </div>)}
    </div>
    <div className="arena-classes-chart arena-classes-chart--loading"><LoadingBlock /></div>
  </LoadingSurface>;
}
