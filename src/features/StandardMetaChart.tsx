import React, { useMemo, useState } from 'react';
import { ChartScatter, ChevronDown, ChevronUp } from 'lucide-react';
import { LoadingSurface } from '../shared/ui/LoadingSurface';
import type { StandardMetaChartPoint } from './StandardMetaChartPlot';

export type StandardMetaChartItem = {
  id: string;
  slug: string;
  archetype: string;
  archetypeLabel: string;
  classKey: string | null;
  winrate: number | null;
  popularity: number | null;
  games: number | null;
  climbingSpeed: number | null;
};


// The plot loads when a reader opens the chart; the collapsed chart is in
// the server HTML with its own small stylesheet, so no loader precedes it.
const StandardMetaChartPlot = React.lazy(() => import('./StandardMetaChartPlot'));

type StandardMetaChartProps = {
  items: StandardMetaChartItem[];
  format: 'standard' | 'wild';
  formatLabel: string;
  rankLabel: string;
};

export default function StandardMetaChart({ items, format, formatLabel, rankLabel }: StandardMetaChartProps) {
  const points = useMemo(
    () => items.filter((item): item is StandardMetaChartPoint => (
      Number.isFinite(item.winrate) && Number.isFinite(item.popularity)
    )),
    [items],
  );
  const popularPoints = useMemo(
    () => [...points].sort((left, right) => right.popularity - left.popularity),
    [points],
  );
  const [expanded, setExpanded] = useState(false);

  if (points.length < 2) return null;

  return (
    <section className="standard-meta-chart" aria-labelledby="standard-meta-chart-title">
      <header className="standard-meta-chart__header" data-tour-id="meta-chart">
        <div className="standard-meta-chart__heading">
          <span className="standard-meta-chart__icon" aria-hidden="true"><ChartScatter size={22} /></span>
          <div>
            <h2 id="standard-meta-chart-title">Карта меты</h2>
            <p>Винрейт и популярность архетипов · {formatLabel} · {rankLabel}</p>
          </div>
        </div>
        <div className="standard-meta-chart__header-actions">
          <span>{points.length} точек</span>
          <button type="button" aria-expanded={expanded} aria-controls="standard-meta-chart-content" onClick={() => setExpanded(value => !value)}>
            {expanded ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
            {expanded ? 'Свернуть' : 'Показать'}
          </button>
        </div>
      </header>

      {expanded && (
        <div id="standard-meta-chart-content" className="standard-meta-chart__content">
          <React.Suspense fallback={<LoadingSurface label="Загружаем карту меты" layout="rows" count={1} className="standard-meta-chart__loading" />}>
            <StandardMetaChartPlot points={points} popularPoints={popularPoints} format={format}
              formatLabel={formatLabel} rankLabel={rankLabel} />
          </React.Suspense>
        </div>
      )}
    </section>
  );
}
