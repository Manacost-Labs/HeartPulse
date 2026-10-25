import { CircleAlert } from 'lucide-react';
import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import '../../../shared/ui/LoadingSurface.css';
import './Leaderboards.css';

/** Плитки сводки в тех же рамках, что и загруженная сводка. */
export function LeaderboardSummarySkeleton() {
  return <LoadingSurface label="Загружаем пороги таблицы" quiet layout="rows" blocksClassName="leaderboards-summary leaderboards-summary--skeleton">
    <div className="leaderboards-summary__head"><LoadingBlock className="leaderboards-skeleton__title" /></div>
    <div className="leaderboards-tiles">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="leaderboards-tile">
        <LoadingBlock className="leaderboards-skeleton__label" />
        <LoadingBlock className="leaderboards-skeleton__value" />
      </div>)}
    </div>
  </LoadingSurface>;
}

/** Строки таблицы: высота одной страницы, чтобы приход данных не сдвигал страницу. */
export function LeaderboardTableSkeleton() {
  return <LoadingSurface label="Загружаем таблицу лидеров" quiet layout="rows" blocksClassName="leaderboards-table leaderboards-table--skeleton">
    <LoadingBlock className="leaderboards-skeleton__bar" />
    {Array.from({ length: 12 }, (_, index) => <LoadingBlock key={index} className="leaderboards-skeleton__row" />)}
  </LoadingSurface>;
}

export function LeaderboardsUnavailable({ onRetry }: { onRetry: () => void }) {
  return <div className="leaderboards-message" role="alert">
    <CircleAlert aria-hidden="true" />
    <div>
      <h2>Таблицы лидеров сейчас недоступны</h2>
      <p>Не удалось получить данные. Попробуйте ещё раз через минуту.</p>
      <button type="button" className="leaderboards-chip" onClick={onRetry}>Повторить</button>
    </div>
  </div>;
}

export function LeaderboardMissing() {
  return <div className="leaderboards-message" role="status">
    <CircleAlert aria-hidden="true" />
    <div>
      <h2>Эта таблица ещё не собрана</h2>
      <p>Прошлые сезоны дочитываются постепенно. Выберите другой сезон или загляните позже.</p>
    </div>
  </div>;
}
