import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { ChartFrame } from '../shared/ui/analytics/ChartFrame';
import '../shared/ui/LoadingSurface.css';
import './ConstructedCardHistorySkeleton.css';

export function ConstructedCardHistorySkeleton({ label }: { label: string }) {
  return <LoadingSurface label="Загружаем историю" quiet layout="rows" className="constructed-card-history-loading">
    <div className="constructed-card-history__content" inert aria-hidden="true">
      <dl className="constructed-card-history__summary">{['Сейчас', 'Изменение', 'Снимков'].map(title =>
        <div key={title}><dt>{title}</dt><dd><LoadingBlock /></dd></div>)}</dl>
      <ChartFrame title={label} subtitle={`${label}. Обновляется вместе со статистикой выбранного периода.`}>
        <div className="analytics-chart__plot">
          <LoadingBlock className="history-loading-plot" />
          <div className="analytics-chart__selection"><LoadingBlock className="history-loading-value" /><LoadingBlock className="history-loading-scrubber" /></div>
        </div>
      </ChartFrame>
    </div>
  </LoadingSurface>;
}
