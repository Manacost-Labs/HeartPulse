import { useState } from 'react';
import { ChartFrame } from './ChartFrame';
import { formatChartValue } from './analyticsModel';
import { usePlotWidth } from './usePlotWidth';

export type ColumnChartRow = { label: string; value: number; detail?: string; color?: string };

const HEIGHT = 196;
const TOP = 22;
const BOTTOM = HEIGHT - 26;

/** Vertical columns for a short ordered category (places, costs): the value sits on each column, the detail in a hover card. */
export function ColumnChart({ title, subtitle, rows, unit = '%', xLabel, tourId, color = '#8d171d' }: {
  title: string; subtitle?: string; rows: ColumnChartRow[]; unit?: string; xLabel?: string; tourId?: string; color?: string;
}) {
  const { ref, width } = usePlotWidth();
  const [active, setActive] = useState<number | null>(null);
  const valid = rows.filter(row => Number.isFinite(row.value));
  const max = Math.max(1e-9, ...valid.map(row => row.value)) * 1.08;
  const slot = width / Math.max(1, valid.length);
  const barWidth = Math.min(56, slot * 0.62);
  const y = (value: number) => BOTTOM - Math.max(0, value) / max * (BOTTOM - TOP);
  const current = active === null ? null : valid[active];
  return <ChartFrame title={title} subtitle={subtitle} tourId={tourId} exportable={valid.length > 0}>
    <div ref={ref} className="analytics-chart__plot">
      {!valid.length ? <p className="analytics-chart__empty">Для графика пока нет данных.</p> : <>
        <svg data-chart viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={`${title}${unit === '%' ? ', проценты' : ''}`} onPointerLeave={() => setActive(null)}>
          <line className="analytics-chart__baseline" x1="0" x2={width} y1={BOTTOM} y2={BOTTOM} />
          {valid.map((row, index) => {
            const center = slot * (index + 0.5);
            return <g key={`${row.label}-${index}`} onPointerEnter={() => setActive(index)}>
              <rect x={center - slot / 2} y="0" width={slot} height={HEIGHT} fill="transparent" />
              <rect className="analytics-chart__bar" data-active={active === index || undefined} x={center - barWidth / 2} y={y(row.value)} width={barWidth} height={BOTTOM - y(row.value)} rx="3" fill={row.color ?? color} />
              <text className="analytics-chart__bar-value" x={center} y={y(row.value) - 6} textAnchor="middle">{formatChartValue(row.value, unit, 1)}</text>
              <text className="analytics-chart__axis" x={center} y={HEIGHT - 8} textAnchor="middle">{row.label}</text>
            </g>;
          })}
        </svg>
        {xLabel && <p className="analytics-chart__axis-title">{xLabel}</p>}
        {current && <div className="analytics-chart__tooltip" aria-hidden="true"
          style={{ transform: `translate(${Math.round(Math.min(Math.max(0, slot * ((active ?? 0) + 0.5) + barWidth / 2 + 8), Math.max(0, width - 160)))}px, ${Math.round(Math.max(0, y(current.value) - 20))}px)` }}>
          <span>{current.detail ?? current.label}</span>
          <strong style={{ color: current.color ?? color }}>{formatChartValue(current.value, unit)}</strong>
        </div>}
        <table className="sr-only"><caption>{title}</caption><tbody>{valid.map((row, index) => <tr key={index}><th scope="row">{row.detail ?? row.label}</th><td>{formatChartValue(row.value, unit)}</td></tr>)}</tbody></table>
      </>}
    </div>
  </ChartFrame>;
}
