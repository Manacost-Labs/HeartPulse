import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import { ChartFrame } from '../shared/ui/analytics/ChartFrame';
import '../shared/ui/LoadingSurface.css';
import './StandardMetaChartSkeleton.css';

export function StandardMetaChartSkeleton({ formatLabel, rankLabel, count }: { formatLabel: string; rankLabel: string; count: number }) {
  return <LoadingSurface label="Загружаем карту меты" quiet layout="rows">
    <div inert aria-hidden="true">
      <ChartFrame title="Винрейт и популярность" subtitle={`${formatLabel} · ${rankLabel} · ${count} архетипов`} className="meta-loading-frame">
        <div className="meta-loading-controls"><LoadingBlock /><LoadingBlock /></div>
        <p className="meta-loading-hint"><span aria-hidden="true" />Наведите или выберите точку. Чем выше и правее, тем популярнее и сильнее архетип.</p>
        <LoadingBlock className="meta-loading-viewport" />
        <LoadingBlock className="meta-loading-selection" />
      </ChartFrame>
    </div>
  </LoadingSurface>;
}
