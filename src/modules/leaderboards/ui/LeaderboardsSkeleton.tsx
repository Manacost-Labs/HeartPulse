import { CircleAlert, Hourglass } from 'lucide-react';
import { LEADERBOARD_MODE_LABELS, LEADERBOARD_REGION_LABELS } from '../model/leaderboardsView';
import type { LeaderboardMode, LeaderboardRegion } from '../model/types';
import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import '../../../shared/ui/LoadingSurface.css';
import './Leaderboards.css';

const GHOST = ' ';

/** Плитка сводки с пустым текстом в тех же классах: её высота — высота настоящей на любой ширине. */
function KpiSkeleton({ jump, wide }: { jump: boolean; wide?: boolean }) {
  const value = <strong>{GHOST}</strong>;
  return <div className={`loading-block leaderboards-kpi leaderboards-skeleton__kpi${wide ? ' leaderboards-kpi--jumps' : ''}`}>
    <dt className="leaderboards-label">{GHOST}</dt>
    <dd>{jump ? <span className="leaderboards-summary__jump">{value}</span> : value}</dd>
  </div>;
}

/**
 * Сводка в раскладке загруженной: плитки и гистограмма из тех же классов,
 * поэтому приход данных не сдвигает таблицу ни на телефоне, ни на ноутбуке
 * (высота сводки — от 69 до 222px в зависимости от режима и ширины).
 */
export function LeaderboardSummarySkeleton({ rated }: { rated: boolean }) {
  return <LoadingSurface label="Загружаем пороги таблицы" quiet layout="rows"
    blocksClassName={rated ? 'leaderboards-summary has-histogram' : 'leaderboards-summary'}>
    <dl className="leaderboards-kpis">
      <KpiSkeleton jump={false} />
      {rated ? [100, 1000, 5000].map(rank => <KpiSkeleton key={rank} jump />) : <KpiSkeleton jump wide />}
    </dl>
    {rated && <figure className="loading-block leaderboards-histogram leaderboards-skeleton__histogram">
      <figcaption className="leaderboards-label">{GHOST}</figcaption>
      <div className="leaderboards-histogram__bars" />
      <div className="leaderboards-histogram__ticks"><span>{GHOST}</span></div>
    </figure>}
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

/** Сезона из ссылки нет среди сохранённых: повтор запроса не поможет, нужна ссылка на текущий сезон. */
export function LeaderboardUnknownSeason({ season, href, onCurrent }: { season: number | null; href: string; onCurrent: () => void }) {
  return <div className="leaderboards-message" role="status">
    <CircleAlert aria-hidden="true" />
    <div>
      <h2>Сезона {season} нет в таблицах</h2>
      <p>Такого сезона нет среди сохранённых таблиц этого режима и региона — возможно, в ссылке опечатка.</p>
      <a className="leaderboards-chip leaderboards-message__action" href={href}
        onClick={event => { event.preventDefault(); onCurrent(); }}>Открыть текущий сезон</a>
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
