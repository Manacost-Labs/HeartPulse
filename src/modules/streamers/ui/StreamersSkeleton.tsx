import { CircleAlert } from 'lucide-react';
import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import '../../../shared/ui/LoadingSurface.css';
import './Streamers.css';

export function StreamerCardsSkeleton({ count = 6 }: { count?: number }) {
  return <ul className="streamers-cards" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <li key={index} className="streamers-card">
      <div className="streamers-card__head">
        <LoadingBlock className="streamers-skeleton__avatar" />
        <div className="streamers-card__identity"><LoadingBlock className="streamers-skeleton__line" /></div>
      </div>
      <ul className="streamers-decks">
        {Array.from({ length: 3 }, (_, row) => <li key={row} className="streamers-deck" data-compact="">
          <LoadingBlock className="streamers-skeleton__row" />
        </li>)}
      </ul>
    </li>)}
  </ul>;
}

export function StreamerDecksSkeleton({ count = 8 }: { count?: number }) {
  return <ul className="streamers-decks streamers-decks--full" aria-hidden="true">
    {Array.from({ length: count }, (_, index) => <li key={index} className="streamers-deck">
      <LoadingBlock className="streamers-skeleton__row" />
    </li>)}
  </ul>;
}

/** Эфиры и каталог в тех же рамках, что и загруженная страница. */
export function StreamersSkeleton() {
  return <LoadingSurface label="Загружаем стримеров" quiet layout="rows" blocksClassName="streamers-skeleton">
    <div className="streamers-section streamers-section--live">
      <div className="streamers-section__heading streamers-section__heading--row"><LoadingBlock className="streamers-skeleton__title" /></div>
      <ul className="streamers-live">
        {Array.from({ length: 4 }, (_, index) => <li key={index} className="streamers-live__item">
          <LoadingBlock className="streamers-live__thumb" />
          <LoadingBlock className="streamers-skeleton__line" />
        </li>)}
      </ul>
    </div>
    <div className="streamers-section">
      <div className="streamers-section__heading">
        <LoadingBlock className="streamers-skeleton__title" />
        <LoadingBlock className="streamers-skeleton__line streamers-skeleton__line--short" />
        <LoadingBlock className="streamers-skeleton__toolbar" />
      </div>
      <StreamerCardsSkeleton count={4} />
    </div>
  </LoadingSurface>;
}

export function StreamersUnavailable({ onRetry }: { onRetry: () => void }) {
  return <div className="streamers-section streamers-failure" role="alert">
    <CircleAlert aria-hidden="true" />
    <div>
      <h2>Стримеры сейчас недоступны</h2>
      <p>Не удалось получить данные HSGuru. Попробуйте ещё раз через минуту.</p>
      <button type="button" className="streamers-chip" onClick={onRetry}>Повторить</button>
    </div>
  </div>;
}
