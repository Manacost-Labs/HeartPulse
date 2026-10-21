import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { ChartFrame } from '../shared/ui/analytics/ChartFrame';
import { KpiGroup } from '../vendor/varylo-ui/data-display/KpiGroup';
import '../shared/ui/LoadingSurface.css';
import './ConstructedCardHistorySkeleton.css';

// The loaded tiles' own structure: a caption line in each and the sparkline of the first, so the
// frame keeps their height at every width; values, captions and the line itself stay hidden.
const KPI_FRAME = [
  { id: 'latest', label: 'Сейчас', value: null, caption: '\u00a0', trend: [0, 0] },
  { id: 'minimum', label: 'Минимум', value: null, caption: '\u00a0' },
  { id: 'maximum', label: 'Максимум', value: null, caption: '\u00a0' },
  { id: 'tracked', label: 'История', value: null, caption: '\u00a0' },
];

export function ConstructedCardHistorySkeleton({ label }: { label: string }) {
  return <LoadingSurface label="Загружаем историю" quiet layout="rows" className="constructed-card-history-loading">
    <div className="constructed-card-history__content" inert aria-hidden="true">
      <ChartFrame title={label} subtitle="Последний снимок каждого дня.">
        <div className="analytics-chart__plot">
          <LoadingBlock className="history-loading-plot" />
          <div className="analytics-chart__selection"><LoadingBlock className="history-loading-value" /><LoadingBlock className="history-loading-scrubber" /></div>
        </div>
      </ChartFrame>
      <KpiGroup className="constructed-card-history__kpis history-loading-kpis" items={KPI_FRAME} minTileWidth={150} locale="ru-RU" />
    </div>
  </LoadingSurface>;
}
