import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { usePlotWidth } from '../../../shared/ui/analytics/usePlotWidth';
import './PlayerStatsCharts.css';

const HEIGHT = 260;
const TOP = 16;
const BOTTOM = HEIGHT - 28;
const RIGHT_GAP = 12;
const CARD_WIDTH = 330;

export type TimelinePoint = { id: string; startedAt: number; value: number };

function niceTicks(low: number, high: number): number[] {
  const step = 10 ** Math.floor(Math.log10(Math.max(1, (high - low) / 3)));
  const spaced = [1, 2, 5, 10].map(factor => factor * step).find(value => (high - low) / value <= 5) ?? step * 10;
  const ticks: number[] = [];
  for (let value = Math.ceil(low / spaced) * spaced; value <= high; value += spaced) ticks.push(value);
  return ticks;
}

/**
 * A value after every game, one point per game in play order, like HSReplay's
 * «MMR Over Time». Pointer or arrow keys pick a game and `renderCard` shows it;
 * `describe` is the same game read to screen readers.
 */
export function GameTimeline<T extends TimelinePoint>({ points, label, formatValue, ticks, renderCard, describe, leftAxis = 52 }: {
  points: readonly T[];
  label: string;
  formatValue: (value: number) => string;
  /** Axis values for the visible range; defaults to round numbers. */
  ticks?: (low: number, high: number) => number[];
  renderCard: (point: T) => ReactNode;
  describe: (point: T) => string;
  leftAxis?: number;
}) {
  const { ref, width } = usePlotWidth();
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const geometry = useMemo(() => {
    const values = points.map(point => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = Math.max(2, (max - min) * 0.08);
    const low = min - padding;
    const high = max + padding;
    const right = width - RIGHT_GAP;
    const x = (index: number) => (points.length === 1 ? (leftAxis + right) / 2 : leftAxis + (index / (points.length - 1)) * (right - leftAxis));
    const y = (value: number) => BOTTOM - ((value - low) / Math.max(1e-9, high - low)) * (BOTTOM - TOP);
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join('');
    const dates = points.length <= 1 ? [0] : [...new Set([0, Math.round((points.length - 1) / 2), points.length - 1])];
    return { right, x, y, path, ticks: (ticks ?? niceTicks)(low, high).filter(tick => tick >= low && tick <= high), dates };
  }, [points, width, ticks, leftAxis]);

  if (!points.length) return null;
  const selected = active === null ? null : points[active];

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * width;
    const ratio = (position - leftAxis) / Math.max(1, geometry.right - leftAxis);
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
  };
  const step = (event: KeyboardEvent<SVGSVGElement>) => {
    const last = points.length - 1;
    const current = active ?? last + 1;
    const next = { ArrowLeft: current - 1, ArrowRight: active === null ? last : current + 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(Math.min(last, Math.max(0, next)));
  };
  const cardLeft = active === null ? 0 : Math.min(Math.max(geometry.x(active) - CARD_WIDTH / 2, 0), Math.max(0, width - CARD_WIDTH));

  return (
    <div ref={ref} className="player-stats-timeline">
      <svg
        role="img"
        tabIndex={0}
        aria-label={label}
        aria-describedby={`${id}-active`}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width={width}
        height={HEIGHT}
        onPointerMove={pick}
        onPointerDown={pick}
        // A touch ends with pointerleave; only a mouse that leaves the chart clears the picked game.
        onPointerLeave={event => { if (event.pointerType === 'mouse') setActive(null); }}
        onKeyDown={step}
        onBlur={() => setActive(null)}
      >
        {geometry.ticks.map(tick => (
          <g key={tick} className="player-stats-timeline__grid">
            <line x1={leftAxis} x2={geometry.right} y1={geometry.y(tick)} y2={geometry.y(tick)} />
            <text x={leftAxis - 8} y={geometry.y(tick) + 4} textAnchor="end">{formatValue(tick)}</text>
          </g>
        ))}
        {geometry.dates.map(index => (
          <text key={index} className="player-stats-timeline__date" x={geometry.x(index)} y={HEIGHT - 8}
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>
            {new Date(points[index].startedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
          </text>
        ))}
        <path className="player-stats-timeline__line" d={geometry.path} />
        {points.length === 1 ? <circle className="player-stats-timeline__dot" cx={geometry.x(0)} cy={geometry.y(points[0].value)} r={4} /> : null}
        {selected && active !== null ? (
          <g className="player-stats-timeline__cursor">
            <line x1={geometry.x(active)} x2={geometry.x(active)} y1={TOP} y2={BOTTOM} />
            <circle cx={geometry.x(active)} cy={geometry.y(selected.value)} r={5} />
          </g>
        ) : null}
      </svg>
      <p id={`${id}-active`} className="player-stats-visually-hidden" aria-live="polite">
        {selected ? describe(selected) : 'Стрелки влево и вправо выбирают игру'}
      </p>
      {selected ? (
        <div className="player-stats-timeline__card" style={{ left: cardLeft }} aria-hidden="true">
          {renderCard(selected)}
        </div>
      ) : null}
    </div>
  );
}
