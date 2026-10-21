import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChartFrame } from './ChartFrame';
import { axisTickIndexes, axisTicks, chartDomain, formatChartValue, lineCoordinates, lineRuns, placeSegmentLabels, segmentStarts, type ChartPoint, type DomainOptions } from './analyticsModel';
import { usePlotWidth } from './usePlotWidth';

type LineChartProps = {
  title: string; subtitle?: string; points: ChartPoint[]; unit?: string; color?: string;
  domain?: DomainOptions; invert?: boolean; xLabel?: string; tourId?: string;
  /** Readable name of a point's `segment`, shown on its boundary and in the tooltip. */
  segmentLabel?: (segment: string) => string;
  /** Tooltip name of the `low`–`high` band. */
  bandLabel?: string;
  /** Name of the points' `reference` values; without it they are not drawn. */
  referenceLabel?: string;
};

const HEIGHT = 240;
const TOP = 26;
const BOTTOM = HEIGHT - 34;
const GAP = 14;

/** Shared line chart: one line, area and optional interval band per period segment, a hover card and a keyboard scrubber. */
export function LineChart({ title, subtitle, points, unit = '', color = '#8d171d', domain, invert = false, xLabel = '', tourId, segmentLabel, bandLabel, referenceLabel }: LineChartProps) {
  const { ref, width } = usePlotWidth();
  const id = useId();
  const gradientId = `${id.replace(/:/g, '')}-area`;
  const data = useMemo(() => lineCoordinates(points), [points]);
  const [selection, setSelection] = useState<number | null>(null);
  const [hovering, setHovering] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const observed = data.filter(point => point.y !== null);
  const latest = observed.at(-1);
  const activeIndex = Math.min(selection ?? data.lastIndexOf(latest ?? data[data.length - 1]), data.length - 1);
  const active = data[activeIndex];
  const [low, high] = chartDomain(data.flatMap(point => [point.y, point.low ?? null, point.high ?? null, referenceLabel ? point.reference ?? null : null]), domain);
  const axisDigits = unit === 'count' ? 0 : Math.min(6, Math.max(2, Math.ceil(-Math.log10((high - low) / 4))));
  const axisValues = [...new Set(axisTicks(low, high, unit === 'count').map(value => Number(value.toFixed(axisDigits))))].filter(value => value >= low && value <= high);
  const axisLabels = axisValues.map(value => formatChartValue(value, unit, axisDigits));
  const left = Math.max(unit === 'count' ? 64 : 48, ...axisLabels.map(label => label.length * 7 + 12));
  const right = width - 16;
  const x = (position: number) => left + position * (right - left);
  const y = (value: number) => TOP + (invert ? (value - low) / (high - low) : 1 - (value - low) / (high - low)) * (BOTTOM - TOP);
  const runs = lineRuns(data);
  const referenceRuns = referenceLabel ? lineRuns(data.map(point => ({ ...point, y: Number.isFinite(point.reference) ? point.reference as number : null }))) : [];
  const line = (run: typeof data) => run.map((point, index) => `${index ? 'L' : 'M'}${x(point.position).toFixed(1)},${y(point.y as number).toFixed(1)}`).join(' ');
  const area = (run: typeof data) => `${line(run)} L${x(run[run.length - 1].position).toFixed(1)},${BOTTOM} L${x(run[0].position).toFixed(1)},${BOTTOM} Z`;
  const band = (run: typeof data) => {
    const bounded = run.filter(point => Number.isFinite(point.low) && Number.isFinite(point.high));
    if (bounded.length < 2) return '';
    const upper = bounded.map((point, index) => `${index ? 'L' : 'M'}${x(point.position).toFixed(1)},${y(point.high as number).toFixed(1)}`).join(' ');
    const lower = [...bounded].reverse().map(point => `L${x(point.position).toFixed(1)},${y(point.low as number).toFixed(1)}`).join(' ');
    return `${upper} ${lower} Z`;
  };
  // A boundary sits between the last point of a period and the first of the next one. Its name
  // goes right of it when it fits inside the period, the last one may lean left; others rely on the tooltip.
  const starts = segmentStarts(data);
  const boundaries = starts.map(index => ({ index, at: x((data[index - 1].position + data[index].position) / 2), segment: data[index].segment ?? '' }));
  const nameOf = (segment: string) => segmentLabel?.(segment) ?? segment;
  const boundaryLabels = placeSegmentLabels([
    ...(starts.length && data[0].segment ? [{ index: 0, at: left, label: nameOf(data[0].segment), line: false }] : []),
    ...boundaries.map(boundary => ({ ...boundary, label: nameOf(boundary.segment), line: true })),
  ], left, right);
  const tickIndexes = axisTickIndexes(data, Math.max(2, Math.floor((right - left) / 96)), 64 / Math.max(1, right - left));
  const tickText = (point: (typeof data)[number]) => point.tick ?? point.label ?? `${xLabel}${point.x}`;
  const selectFromPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) * width / bounds.width - left) / (right - left);
    let nearest = 0;
    data.forEach((point, index) => { if (Math.abs(point.position - position) < Math.abs(data[nearest].position - position)) nearest = index; });
    setSelection(nearest);
    setHovering(true);
  };
  const showCard = hovering && active && active.y !== null;
  // The card sits beside the point, never on it: right of it, or left near the right edge.
  useLayoutEffect(() => {
    const element = card.current;
    if (!element || !showCard) return;
    const pointX = x(active.position);
    const pointY = y(active.y as number);
    const cardLeft = pointX + GAP + element.offsetWidth > width ? pointX - GAP - element.offsetWidth : pointX + GAP;
    const cardTop = Math.max(0, Math.min(pointY - element.offsetHeight / 2, BOTTOM - element.offsetHeight));
    element.style.transform = `translate(${Math.round(Math.max(0, cardLeft))}px, ${Math.round(cardTop)}px)`;
  });
  const exportable = observed.length > 0;
  const segmentName = (point: (typeof data)[number]) => point.segment ? nameOf(point.segment) : '';
  return <ChartFrame title={title} subtitle={subtitle} tourId={tourId} exportable={exportable}>
    <div ref={ref} className="analytics-chart__plot" style={{ ['--analytics-series' as string]: color }}>
      {!exportable ? <p className="analytics-chart__empty">Для графика пока нет данных.</p> : <>
        <svg data-chart viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={`${title}${unit === '%' ? ', проценты' : ''}`}
          onPointerMove={selectFromPointer} onPointerDown={selectFromPointer} onPointerLeave={() => setHovering(false)}>
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.26" />
              <stop offset="1" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {axisValues.map((value, index) => {
            return <g key={value}><line className="analytics-chart__grid" x1={left} x2={right} y1={y(value)} y2={y(value)} /><text className="analytics-chart__axis" x={left - 8} y={y(value) + 4} textAnchor="end">{axisLabels[index]}</text></g>;
          })}
          <line className="analytics-chart__baseline" x1={left} x2={right} y1={BOTTOM} y2={BOTTOM} />
          {runs.map((run, index) => <g key={index}>
            {band(run) && <path className="analytics-chart__band" d={band(run)} fill={color} />}
            {run.length > 1 && !band(run) && <path d={area(run)} fill={`url(#${gradientId})`} />}
            <path d={line(run)} fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
          </g>)}
          {referenceRuns.map((run, index) => run.length > 1 && <path key={index} className="analytics-chart__reference" d={line(run)} />)}
          {boundaryLabels.map(boundary => <g key={boundary.index} className="analytics-chart__boundary">
            {boundary.line && <line x1={boundary.at} x2={boundary.at} y1={TOP - 14} y2={BOTTOM} />}
            {boundary.shown && <text x={boundary.anchorEnd ? boundary.at - 4 : boundary.at + 4} y={TOP - 6} textAnchor={boundary.anchorEnd ? 'end' : 'start'}>{boundary.label}</text>}
          </g>)}
          {data.map((point, index) => point.y !== null && (data.length <= 24 || runs.some(run => run.length === 1 && run[0] === point))
            ? <circle key={index} cx={x(point.position)} cy={y(point.y)} r="3" fill={color} stroke="#fbf3de" strokeWidth="1.5" /> : null)}
          {latest && latest.y !== null && <g className="analytics-chart__latest">
            <circle cx={x(latest.position)} cy={y(latest.y)} r="8" fill={color} opacity="0.18" />
            <circle cx={x(latest.position)} cy={y(latest.y)} r="4.5" fill={color} stroke="#fbf3de" strokeWidth="2" />
          </g>}
          {active && active.y !== null && (selection !== null || hovering) && <>
            <line className="analytics-chart__guide" x1={x(active.position)} x2={x(active.position)} y1={TOP} y2={BOTTOM} />
            <circle cx={x(active.position)} cy={y(active.y)} r="5" fill="#fbf3de" stroke={color} strokeWidth="2.5" />
          </>}
          {tickIndexes.map((index, tick) => <text key={index} className="analytics-chart__axis" x={x(data[index].position)} y={HEIGHT - 10} textAnchor={tick === 0 ? 'start' : tick === tickIndexes.length - 1 ? 'end' : 'middle'}>{tickText(data[index])}</text>)}
        </svg>
        {showCard && <div ref={card} className="analytics-chart__tooltip" aria-hidden="true">
          <span>{active.label ?? `${xLabel}${active.x}`}</span>
          <strong>{formatChartValue(active.y, unit)}</strong>
          {Number.isFinite(active.low) && Number.isFinite(active.high) && <span>{bandLabel ?? 'Интервал'}: {formatChartValue(active.low ?? null, unit)}–{formatChartValue(active.high ?? null, unit)}</span>}
          {active.detail && <span>{active.detail}</span>}
          {referenceLabel && Number.isFinite(active.reference) && <span>{referenceLabel}: {formatChartValue(active.reference ?? null, unit)}</span>}
          {segmentName(active) && <em>{segmentName(active)}</em>}
        </div>}
        <div className="analytics-chart__selection">
          <output htmlFor={id}>{active ? <><span>{active.label ?? `${xLabel}${active.x}`}</span><strong>{formatChartValue(active.y, unit)}</strong>{active.detail && <span>{active.detail}</span>}</> : '—'}</output>
          <div className="analytics-chart__scrubber"><input id={id} type="range" min="0" max={Math.max(0, data.length - 1)} value={Math.max(0, activeIndex)} onChange={event => setSelection(Number(event.target.value))} aria-label={`Выбрать точку: ${title}`} aria-valuetext={active ? `${active.label ?? active.x}: ${formatChartValue(active.y, unit)}` : 'Нет данных'} /><div aria-hidden="true"><span>{tickText(data[0])}</span><span>{tickText(data[data.length - 1])}</span></div></div>
        </div>
      </>}
    </div>
  </ChartFrame>;
}
