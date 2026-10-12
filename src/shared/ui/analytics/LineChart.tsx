import { useId, useMemo, useState } from 'react';
import { ChartFrame } from './ChartFrame';
import { chartDomain, formatChartValue, lineCoordinates, type ChartPoint, type DomainOptions } from './analyticsModel';
import { usePlotWidth } from './usePlotWidth';

type LineChartProps = {
  title: string; subtitle?: string; points: ChartPoint[]; unit?: string; color?: string;
  domain?: DomainOptions; invert?: boolean; xLabel?: string; tourId?: string;
};

export function LineChart({ title, subtitle, points, unit = '', color = '#64416f', domain, invert = false, xLabel = '', tourId }: LineChartProps) {
  const { ref, width } = usePlotWidth();
  const id = useId();
  const data = useMemo(() => lineCoordinates(points), [points]);
  const [selection, setSelection] = useState<number | null>(null);
  const activeIndex = Math.min(selection ?? data.length - 1, data.length - 1);
  const active = data[activeIndex];
  const [low, high] = chartDomain(data.map(point => point.y), domain);
  const axisDigits = unit === 'count' ? 0 : Math.min(6, Math.max(2, Math.ceil(-Math.log10((high - low) / 4))));
  const axisValues = [...new Set([0, 1, 2, 3, 4].map(index => {
    const value = low + index * (high - low) / 4;
    return Number(value.toFixed(axisDigits));
  }))].filter(value => value >= low && value <= high);
  const axisLabels = axisValues.map(value => formatChartValue(value, unit, axisDigits));
  const height = 240;
  const left = Math.max(unit === 'count' ? 76 : 64, ...axisLabels.map(label => label.length * 7 + 14));
  const right = width - 20;
  const bottom = height - 38;
  const top = 16;
  const x = (position: number) => left + position * (right - left);
  const y = (value: number) => top + (invert ? (value - low) / (high - low) : 1 - (value - low) / (high - low)) * (bottom - top);
  let connected = false;
  const path = data.map(point => {
    if (point.y === null) { connected = false; return ''; }
    const segment = `${connected ? 'L' : 'M'}${x(point.position).toFixed(2)},${y(point.y).toFixed(2)}`;
    connected = true;
    return segment;
  }).join(' ');
  const tickIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].filter(index => index >= 0);
  const selectFromPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - bounds.left) * width / bounds.width - left) / (right - left);
    let nearest = 0;
    data.forEach((point, index) => { if (Math.abs(point.position - position) < Math.abs(data[nearest].position - position)) nearest = index; });
    setSelection(nearest);
  };
  return <ChartFrame title={title} subtitle={subtitle} tourId={tourId} exportable={data.some(point => point.y !== null)}>
    <div ref={ref} className="analytics-chart__plot">
      {!data.some(point => point.y !== null) ? <p className="analytics-chart__empty">Для графика пока нет данных.</p> : <>
        <svg data-chart viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}${unit === '%' ? ', проценты' : ''}`} onPointerMove={selectFromPointer} onPointerDown={selectFromPointer}>
          {axisValues.map((value, index) => {
            return <g key={value}><line className="analytics-chart__grid" x1={left} x2={right} y1={y(value)} y2={y(value)} /><text className="analytics-chart__axis" x={left - 10} y={y(value) + 4} textAnchor="end">{axisLabels[index]}</text></g>;
          })}
          <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {data.length <= 24 && data.map((point, index) => point.y !== null ? <circle key={index} cx={x(point.position)} cy={y(point.y)} r="3" fill={color} stroke="#fbf3de" strokeWidth="1.5" /> : null)}
          {active && active.y !== null && <>
            <line x1={x(active.position)} x2={x(active.position)} y1={top} y2={bottom} stroke="#735e49" strokeDasharray="3 5" opacity="0.5" />
            <circle cx={x(active.position)} cy={y(active.y)} r="5" fill={color} stroke="#fbf3de" strokeWidth="2" />
          </>}
          {tickIndexes.map((index, tick) => <text key={index} className="analytics-chart__axis" x={x(data[index].position)} y={height - 12} textAnchor={tick === 0 ? 'start' : tick === tickIndexes.length - 1 ? 'end' : 'middle'}>{data[index].label ?? `${xLabel}${data[index].x}`}</text>)}
        </svg>
        <div className="analytics-chart__selection">
          <output htmlFor={id}>{active ? <><span>{active.label ?? `${xLabel}${active.x}`}</span><strong>{formatChartValue(active.y, unit)}</strong>{active.detail && <span>{active.detail}</span>}</> : '—'}</output>
          <div className="analytics-chart__scrubber"><input id={id} type="range" min="0" max={Math.max(0, data.length - 1)} value={Math.max(0, activeIndex)} onChange={event => setSelection(Number(event.target.value))} aria-label={`Выбрать точку: ${title}`} aria-valuetext={active ? `${active.label ?? active.x}: ${formatChartValue(active.y, unit)}` : 'Нет данных'} /><div aria-hidden="true"><span>{data[0]?.label ?? `${xLabel}${data[0]?.x ?? ''}`}</span><span>{data.at(-1)?.label ?? `${xLabel}${data.at(-1)?.x ?? ''}`}</span></div></div>
        </div>
      </>}
    </div>
  </ChartFrame>;
}
