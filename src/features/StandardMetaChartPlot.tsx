import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, MousePointer2 } from 'lucide-react';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import './StandardMetaChartPlot.css';

/** One plotted archetype: an item of the chart with both coordinates known. */
export type StandardMetaChartPoint = {
  id: string;
  slug: string;
  archetype: string;
  archetypeLabel: string;
  classKey: string | null;
  winrate: number;
  popularity: number;
  games: number | null;
  climbingSpeed: number | null;
};

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 500;
const PLOT = { left: 76, right: 30, top: 28, bottom: 62 };
const PLOT_WIDTH = VIEWBOX_WIDTH - PLOT.left - PLOT.right;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - PLOT.top - PLOT.bottom;

function formatPercent(value: number): string {
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function domain(values: number[], includeZero = false): [number, number] {
  if (!values.length) return [0, 5];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const lower = includeZero ? 0 : Math.floor((minimum - 1) / 5) * 5;
  const upper = Math.ceil((maximum + (includeZero ? 0 : 1)) / 5) * 5;
  return [lower, Math.max(lower + 5, upper)];
}

function ticks([minimum, maximum]: [number, number], count = 5): number[] {
  return Array.from({ length: count + 1 }, (_, index) => minimum + ((maximum - minimum) * index) / count);
}

function classIcon(classKey: string | null): string {
  return classKey ? `/class_icon/ui/${classKey}-64.webp` : '/class_icon/neutral.webp';
}

// Keyboard steps between points: arrows move by one, Home and End to the ends.
const POINT_KEY_STEPS: Partial<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: () => 1, ArrowDown: () => 1, ArrowLeft: () => -1, ArrowUp: () => -1,
  Home: index => -index, End: (index, count) => count - index - 1,
};

function ChartSelection({ item, format }: { item: StandardMetaChartPoint; format: 'standard' | 'wild' }) {
  return (
    <div className="standard-meta-chart__selection" aria-live="polite">
      <img src={classIcon(item.classKey)} alt="" width="46" height="46" loading="lazy" decoding="async" />
      <div className="standard-meta-chart__selection-title">
        <strong>{item.archetypeLabel}</strong>
        <span>{item.archetype}</span>
      </div>
      <dl>
        <div><dt>Винрейт</dt><dd>{formatPercent(item.winrate)}</dd></div>
        <div><dt>Популярность</dt><dd>{formatPercent(item.popularity)}</dd></div>
        <div><dt>Игры</dt><dd>{item.games?.toLocaleString('ru-RU') ?? '—'}</dd></div>
      </dl>
      <a
        className="standard-meta-chart__deck-action"
        href={canonicalPagePath(`/standard/archetypes/${format}/${item.slug}`)}
        aria-label={`Открыть страницу архетипа: ${item.archetypeLabel}`}
      >
        <span>Архетип</span>
        <ArrowRight size={17} aria-hidden="true" />
      </a>
    </div>
  );
}

/**
 * The expanded meta chart: the scatter plot and the selected archetype. It
 * loads when a reader opens the chart, so the collapsed chart in the first
 * paint carries neither its code nor its styles.
 */
export default function StandardMetaChartPlot({ points, popularPoints, format, formatLabel, rankLabel }: {
  points: StandardMetaChartPoint[];
  popularPoints: StandardMetaChartPoint[];
  format: 'standard' | 'wild';
  formatLabel: string;
  rankLabel: string;
}) {
  const [selectedId, setSelectedId] = useState(popularPoints[0]?.id ?? '');
  const [hoveredId, setHoveredId] = useState('');
  const pointRefs = useRef(new Map<string, SVGGElement>());

  useEffect(() => {
    setSelectedId(popularPoints[0]?.id ?? '');
    setHoveredId('');
  }, [formatLabel, rankLabel, popularPoints]);

  const selectedItem = points.find(item => item.id === (hoveredId || selectedId)) ?? popularPoints[0] ?? null;
  const xDomain = useMemo(() => domain(points.map(item => item.winrate)), [points]);
  const yDomain = useMemo(() => domain(points.map(item => item.popularity), true), [points]);
  const xTicks = useMemo(() => ticks(xDomain), [xDomain]);
  const yTicks = useMemo(() => ticks(yDomain), [yDomain]);
  const labelIds = useMemo(() => new Set(popularPoints.slice(0, 3).map(item => item.id)), [popularPoints]);

  const xPosition = (value: number) => PLOT.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * PLOT_WIDTH;
  const yPosition = (value: number) => PLOT.top + PLOT_HEIGHT - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * PLOT_HEIGHT;

  const moveFocus = (index: number, direction: number) => {
    const nextIndex = Math.max(0, Math.min(points.length - 1, index + direction));
    const next = points[nextIndex];
    setSelectedId(next.id);
    window.requestAnimationFrame(() => pointRefs.current.get(next.id)?.focus());
  };

  return (
    <>
    <p className="standard-meta-chart__hint"><MousePointer2 size={15} /> Наведите или выберите точку. Чем выше и правее, тем популярнее и сильнее архетип.</p>
    <div className="standard-meta-chart__viewport" tabIndex={0} aria-label="Интерактивный график; на узком экране прокручивается по горизонтали">
      <svg className="standard-meta-chart__plot" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} aria-labelledby="standard-meta-chart-svg-title standard-meta-chart-svg-desc">
        <title id="standard-meta-chart-svg-title">Винрейт и популярность архетипов</title>
        <desc id="standard-meta-chart-svg-desc">По горизонтали указан винрейт, по вертикали популярность. Точки доступны с клавиатуры.</desc>

        {yTicks.map(value => {
          const y = yPosition(value);
          return (
            <g key={`y-${value}`} className="standard-meta-chart__axis-tick">
              <line x1={PLOT.left} x2={PLOT.left + PLOT_WIDTH} y1={y} y2={y} />
              <text x={PLOT.left - 12} y={y + 4} textAnchor="end">{formatPercent(value)}</text>
            </g>
          );
        })}
        {xTicks.map(value => {
          const x = xPosition(value);
          return (
            <g key={`x-${value}`} className="standard-meta-chart__axis-tick">
              <line x1={x} x2={x} y1={PLOT.top} y2={PLOT.top + PLOT_HEIGHT} />
              <text x={x} y={PLOT.top + PLOT_HEIGHT + 28} textAnchor="middle">{formatPercent(value)}</text>
            </g>
          );
        })}
        {xDomain[0] < 50 && xDomain[1] > 50 && (
          <g className="standard-meta-chart__reference">
            <line x1={xPosition(50)} x2={xPosition(50)} y1={PLOT.top} y2={PLOT.top + PLOT_HEIGHT} />
            <text x={xPosition(50) + 8} y={PLOT.top + 16}>50% винрейта</text>
          </g>
        )}
        <line className="standard-meta-chart__axis" x1={PLOT.left} x2={PLOT.left} y1={PLOT.top} y2={PLOT.top + PLOT_HEIGHT} />
        <line className="standard-meta-chart__axis" x1={PLOT.left} x2={PLOT.left + PLOT_WIDTH} y1={PLOT.top + PLOT_HEIGHT} y2={PLOT.top + PLOT_HEIGHT} />
        <text className="standard-meta-chart__axis-title" x={PLOT.left + PLOT_WIDTH / 2} y={VIEWBOX_HEIGHT - 10} textAnchor="middle">Винрейт</text>
        <text className="standard-meta-chart__axis-title" transform={`translate(19 ${PLOT.top + PLOT_HEIGHT / 2}) rotate(-90)`} textAnchor="middle">Популярность</text>

        {points.map((item, index) => {
          const active = selectedItem?.id === item.id;
          const labelled = labelIds.has(item.id) || active;
          const x = xPosition(item.winrate);
          const y = yPosition(item.popularity);
          return (
            <g
              key={item.id}
              ref={element => {
                if (element) pointRefs.current.set(item.id, element);
                else pointRefs.current.delete(item.id);
              }}
              className={`standard-meta-chart__point${active ? ' standard-meta-chart__point--active' : ''}`}
              role="button"
              tabIndex={selectedId === item.id ? 0 : -1}
              aria-label={`${item.archetypeLabel}: винрейт ${formatPercent(item.winrate)}, популярность ${formatPercent(item.popularity)}, игр ${item.games?.toLocaleString('ru-RU') ?? 'нет данных'}`}
              transform={`translate(${x} ${y})`}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId('')}
              onClick={() => setSelectedId(item.id)}
              onFocus={() => setSelectedId(item.id)}
              onKeyDown={event => {
                const step = POINT_KEY_STEPS[event.key];
                if (event.key !== 'Enter' && event.key !== ' ' && !step) return;
                event.preventDefault();
                if (step) moveFocus(index, step(index, points.length));
                else setSelectedId(item.id);
              }}
            >
              <circle className="standard-meta-chart__point-halo" r={active ? 16 : 13} />
              <circle className="standard-meta-chart__point-core" r={active ? 8 : 6} />
              {labelled && <text x="11" y="-10">{item.archetypeLabel}</text>}
            </g>
          );
        })}
      </svg>
    </div>

    {selectedItem && <ChartSelection item={selectedItem} format={format} />}
    </>
  );
}
