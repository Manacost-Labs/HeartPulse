import { CircleAlert, Hourglass } from 'lucide-react';
import { LEADERBOARD_MODE_LABELS, LEADERBOARD_REGION_LABELS } from '../model/leaderboardsView';
import type { LeaderboardMode, LeaderboardRegion } from '../model/types';
import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import '../../../shared/ui/LoadingSurface.css';
import './Leaderboards.css';

/** Строка сводки той же высоты, что и загруженная. */
export function LeaderboardSummarySkeleton() {
  return <LoadingSurface label="Загружаем пороги таблицы" quiet layout="rows">
    <LoadingBlock className="leaderboards-skeleton__summary" />
  </LoadingSurface>;
}

/** Строки таблицы: высота одной страницы, чтобы приход данных не сдвигал страницу. */
export function LeaderboardTableSkeleton() {
  return <LoadingSurface label="Загружаем таблицу лидеров" quiet layout="rows" blocksClassName="leaderboards-table leaderboards-table--skeleton">
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

/** У режима в этом регионе ещё нет ни одного сохранённого сезона: таблицу только начали собирать. */
export function LeaderboardCollecting({ mode, region }: { mode: LeaderboardMode; region: LeaderboardRegion }) {
  return <div className="leaderboards-message" role="status">
    <Hourglass aria-hidden="true" />
    <div>
      <h2>Данные собираются</h2>
      <p>Таблица «{LEADERBOARD_MODE_LABELS[mode]}» ({LEADERBOARD_REGION_LABELS[region]}) появится здесь после первого снимка Blizzard. Загляните позже.</p>
    </div>
  </div>;
}
