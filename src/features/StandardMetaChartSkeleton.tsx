import { MousePointer2 } from 'lucide-react';
import { LoadingBlock, LoadingSurface } from '../shared/ui/LoadingSurface';
import '../shared/ui/LoadingSurface.css';
import './StandardMetaChartSkeleton.css';

export function StandardMetaChartSkeleton({ formatLabel, rankLabel, count }: { formatLabel: string; rankLabel: string; count: number }) {
  return <LoadingSurface label="Загружаем карту меты" quiet layout="rows">
    <div inert aria-hidden="true" className="standard-meta-map">
      <header className="standard-meta-map__header">
        <div><h3>Популярность и винрейт</h3><p>{formatLabel} · {rankLabel} · {count} архетипов</p></div>
        <LoadingBlock className="meta-loading-switch" />
      </header>
      <div className="standard-meta-map__controls">
        <label><input type="checkbox" disabled /> Популярность от 0,5%</label>
        <p><MousePointer2 size={15} aria-hidden="true" /> Размер — число игр, цвет — класс. Нажмите на точку, чтобы открыть архетип.</p>
      </div>
      <LoadingBlock className="meta-loading-plot" />
    </div>
  </LoadingSurface>;
}
