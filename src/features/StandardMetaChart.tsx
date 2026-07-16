import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChartScatter, ChevronDown, ChevronUp, MousePointer2, Sparkles } from 'lucide-react';
import './StandardMetaChart.css';

export type StandardMetaChartItem = {
  id: string;
  archetype: string;
  archetypeLabel: string;
  classKey: string | null;
  winrate: number | null;
  popularity: number | null;
  games: number | null;
  climbingSpeed: number | null;
};

type StandardMetaChartProps = {
  items: StandardMetaChartItem[];
  formatLabel: string;
  rankLabel: string;
  onOpenDeck: (itemId: string) => void;
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

export default function StandardMetaChart({ items, formatLabel, rankLabel, onOpenDeck }: StandardMetaChartProps) {
  const points = useMemo(
    () => items.filter((item): item is StandardMetaChartItem & { winrate: number; popularity: number } => (
      Number.isFinite(item.winrate) && Number.isFinite(item.popularity)
    )),
    [items],
  );
  const popularPoints = useMemo(
    () => [...points].sort((left, right) => right.popularity - left.popularity),
    [points],
  );
  const [expanded, setExpanded] = useState(true);
  const [selectedId, setSelectedId] = useState('');
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

  if (points.length < 2) return null;

  const xPosition = (value: number) => PLOT.left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * PLOT_WIDTH;
  const yPosition = (value: number) => PLOT.top + PLOT_HEIGHT - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * PLOT_HEIGHT;

  const moveFocus = (index: number, direction: number) => {
    const nextIndex = Math.max(0, Math.min(points.length - 1, index + direction));
    const next = points[nextIndex];
    setSelectedId(next.id);
    window.requestAnimationFrame(() => pointRefs.current.get(next.id)?.focus());
  };

  return (
    <section className="standard-meta-chart" aria-labelledby="standard-meta-chart-title">
      <header className="standard-meta-chart__header">
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
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedId(item.id);
                      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        moveFocus(index, 1);
                      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        moveFocus(index, -1);
                      } else if (event.key === 'Home') {
                        event.preventDefault();
                        moveFocus(index, -index);
                      } else if (event.key === 'End') {
                        event.preventDefault();
                        moveFocus(index, points.length - index - 1);
                      }
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

          {selectedItem && (
            <div className="standard-meta-chart__selection" aria-live="polite">
              <img src={classIcon(selectedItem.classKey)} alt="" width="46" height="46" loading="lazy" decoding="async" />
              <div className="standard-meta-chart__selection-title">
                <strong>{selectedItem.archetypeLabel}</strong>
                <span>{selectedItem.archetype}</span>
              </div>
              <dl>
                <div><dt>Винрейт</dt><dd>{formatPercent(selectedItem.winrate)}</dd></div>
                <div><dt>Популярность</dt><dd>{formatPercent(selectedItem.popularity)}</dd></div>
                <div><dt>Игры</dt><dd>{selectedItem.games?.toLocaleString('ru-RU') ?? '—'}</dd></div>
              </dl>
              <button type="button" onClick={() => onOpenDeck(selectedItem.id)}><Sparkles size={17} /> Показать колоду</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
