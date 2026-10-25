import { CircleAlert } from 'lucide-react';
import { LoadingBlock, LoadingSurface } from '../../../shared/ui/LoadingSurface';
import '../../../shared/ui/LoadingSurface.css';
import './RadarView.css';

/** Сводка и три карточки кандидатов в тех же рамках, что и загруженный радар. */
export function RadarSkeleton() {
  return <LoadingSurface label="Загружаем радар" quiet layout="rows" blocksClassName="radar-skeleton">
    <div className="radar-section radar-summary">
      <div className="radar-section__heading">
        <LoadingBlock className="radar-skeleton__line radar-skeleton__line--short" />
        <LoadingBlock className="radar-skeleton__title" />
        <LoadingBlock className="radar-skeleton__line" />
      </div>
      <div className="radar-section__body">
        <LoadingBlock className="radar-skeleton__paragraph" />
      </div>
    </div>
    <div className="radar-section radar-board">
      <div className="radar-board__bar"><LoadingBlock className="radar-skeleton__bar" /></div>
      <div className="radar-board__panel">
        <div className="radar-list">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="radar-candidate">
            <div className="radar-candidate__head">
              <LoadingBlock className="radar-skeleton__art" />
              <LoadingBlock className="radar-skeleton__meter" />
            </div>
            <LoadingBlock className="radar-skeleton__paragraph" />
          </div>)}
        </div>
      </div>
    </div>
  </LoadingSurface>;
}

export function RadarUnavailable({ onRetry }: { onRetry: () => void }) {
  return <div className="radar-section radar-failure" role="alert">
    <CircleAlert aria-hidden="true" />
    <div>
      <h2>Радар сейчас недоступен</h2>
      <p>Не удалось получить свежий прогноз. Попробуйте ещё раз через минуту.</p>
      <button type="button" className="radar-chip" onClick={onRetry}>Повторить</button>
    </div>
  </div>;
}
