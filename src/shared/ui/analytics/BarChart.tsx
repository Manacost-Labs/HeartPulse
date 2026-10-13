import { useState } from 'react';
import { ChartFrame } from './ChartFrame';
import { formatChartValue } from './analyticsModel';
import { usePlotWidth } from './usePlotWidth';

export type BarChartRow = { label: string; value: number; detail?: string; color?: string };

export function BarChart({ title, subtitle, rows, unit = '%', maximum, tourId, onSelect }: {
  title: string; subtitle?: string; rows: BarChartRow[]; unit?: string; maximum?: number; tourId?: string; onSelect?: (index: number) => void;
}) {
  const { ref, width } = usePlotWidth();
  const [activeIndex, setActiveIndex] = useState(0);
  const valid = rows.filter(row => Number.isFinite(row.value));
  const max = maximum ?? (unit === '%' ? 100 : Math.max(1, ...valid.map(row => row.value)));
  const labelWidth = width < 480 ? 104 : 160;
  const plotWidth = Math.max(1, width - labelWidth - 70);
  const rowHeight = onSelect ? 44 : 36;
  const active = valid[Math.min(activeIndex, valid.length - 1)];
  return <ChartFrame title={title} subtitle={subtitle} tourId={tourId} exportable={valid.length > 0}>
    <div ref={ref} className="analytics-chart__plot">
      {!valid.length ? <p className="analytics-chart__empty">Для графика пока нет данных.</p> : <>
        <svg data-chart viewBox={`0 0 ${width} ${valid.length * rowHeight + 32}`} role={onSelect ? 'group' : 'img'} aria-label={title}>
          {[0, 0.5, 1].map(tick => <g key={tick}><line className="analytics-chart__grid" x1={labelWidth + plotWidth * tick} x2={labelWidth + plotWidth * tick} y1="24" y2={valid.length * rowHeight + 28} /><text className="analytics-chart__axis" x={labelWidth + plotWidth * tick} y="14" textAnchor="middle">{formatChartValue(max * tick, unit)}</text></g>)}
          {valid.map((row, index) => <g key={`${row.label}-${index}`} onPointerEnter={() => setActiveIndex(index)} role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={onSelect ? `${row.label}: ${formatChartValue(row.value, unit)}` : undefined} onClick={onSelect ? () => onSelect(index) : undefined} onKeyDown={onSelect ? event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(index); } } : undefined}>
            {onSelect && <rect x="0" y={index * rowHeight + 26} width={width} height={rowHeight} fill="transparent" aria-hidden="true" />}
            <title>{row.label}: {formatChartValue(row.value, unit)}{row.detail ? ` · ${row.detail}` : ''}</title>
            <text className="analytics-chart__bar-label" x="0" y={index * rowHeight + 47}>{row.label.length > (width < 480 ? 14 : 23) ? row.label.slice(0, width < 480 ? 13 : 22) + '…' : row.label}</text>
            <rect x={labelWidth} y={index * rowHeight + 32} width={plotWidth} height="20" rx="3" fill="#e8dcc0" />
            <rect x={labelWidth} y={index * rowHeight + 32} width={Math.max(0, Math.min(1, row.value / max)) * plotWidth} height="20" rx="3" fill={row.color ?? (index < 4 ? '#64416f' : '#957d63')} />
            <text className="analytics-chart__bar-value" x={width - 2} y={index * rowHeight + 47} textAnchor="end">{formatChartValue(row.value, unit)}</text>
          </g>)}
        </svg>
        {active?.detail && <p className="analytics-chart__note">{active.label} · {active.detail}</p>}
        <details className="analytics-chart__data"><summary>Данные графика</summary><dl>{valid.map((row, index) => <div key={index}><dt>{row.label}</dt><dd>{formatChartValue(row.value, unit)}{row.detail ? ` · ${row.detail}` : ''}</dd></div>)}</dl></details>
      </>}
    </div>
  </ChartFrame>;
}
