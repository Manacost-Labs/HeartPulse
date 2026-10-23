import { useState } from 'react';
import { ChartFrame } from './ChartFrame';
import { formatChartValue } from './analyticsModel';
import { usePlotWidth } from './usePlotWidth';

/** `textColor` keeps the in-bar label readable on dark series. */
export type StackSeries = { key: string; label: string; color: string; textColor?: string };
export type StackRow = { label: string; values: Record<string, number> };

const ROW = 26;
const BAR = 18;
const LEGEND_ITEM = 72;

/** 100% bars, one row per category; hovering a row lists its shares in a card under it. */
export function StackedBarChart({ title, subtitle, rows, series, tourId }: { title: string; subtitle?: string; rows: StackRow[]; series: StackSeries[]; tourId?: string }) {
  const { ref, width } = usePlotWidth();
  const [active, setActive] = useState<number | null>(null);
  const legendColumns = Math.max(1, Math.floor(width / LEGEND_ITEM));
  const legendHeight = Math.ceil(series.length / legendColumns) * 20 + 6;
  const left = 56;
  const plotWidth = width - left;
  const top = legendHeight + 20;
  const value = (row: StackRow, key: string) => (Number.isFinite(row.values[key]) ? Math.max(0, row.values[key]) : 0);
  const current = active === null ? null : rows[active];
  const row = active ?? 0;
  // Rows in the lower half get the card above them, so it never leaves the plot.
  const above = active !== null && active >= rows.length / 2;
  return <ChartFrame title={title} subtitle={subtitle} tourId={tourId} exportable={rows.length > 0}>
    <div ref={ref} className="analytics-chart__plot">
      {!rows.length ? <p className="analytics-chart__empty">Для графика пока нет данных.</p> : <>
        <svg data-chart viewBox={`0 0 ${width} ${top + rows.length * ROW}`} role="img" aria-label={title} onPointerLeave={() => setActive(null)}>
          {series.map((item, index) => <g key={item.key} transform={`translate(${index % legendColumns * LEGEND_ITEM} ${Math.floor(index / legendColumns) * 20})`}><rect y="2" width="10" height="10" rx="2" fill={item.color} /><text x="16" y="12" className="analytics-chart__axis">{item.label}</text></g>)}
          {[0, 50, 100].map(tick => <g key={tick}>
            <line className="analytics-chart__grid" x1={left + plotWidth * tick / 100} x2={left + plotWidth * tick / 100} y1={top - 4} y2={top + rows.length * ROW} />
            <text className="analytics-chart__axis" x={left + plotWidth * tick / 100} y={top - 8} textAnchor={tick === 0 ? 'start' : tick === 100 ? 'end' : 'middle'}>{tick}%</text>
          </g>)}
          {rows.map((row, index) => {
            const y = top + index * ROW + (ROW - BAR) / 2;
            let offset = 0;
            return <g key={row.label} className="analytics-chart__stack-row" data-active={active === index || undefined} onPointerEnter={() => setActive(index)}>
              <rect x="0" y={top + index * ROW} width={width} height={ROW} fill="transparent" />
              <text className="analytics-chart__bar-label" x="0" y={y + BAR - 5}>{row.label}</text>
              {series.map(item => {
                const share = Math.min(100 - offset, value(row, item.key));
                const start = offset;
                offset += share;
                return share > 0 ? <g key={item.key}>
                  <rect x={left + start / 100 * plotWidth} y={y} width={share / 100 * plotWidth} height={BAR} fill={item.color} />
                  {share / 100 * plotWidth > 30 && <text x={left + (start + share / 2) / 100 * plotWidth} y={y + BAR - 5} textAnchor="middle" fill={item.textColor ?? '#30251c'} fontSize="11" fontWeight="700">{item.label}</text>}
                </g> : null;
              })}
            </g>;
          })}
        </svg>
        {current && <div className="analytics-chart__tooltip" aria-hidden="true"
          style={{ transform: `translate(${Math.round(Math.max(0, Math.min(width - 170, left + plotWidth / 2)))}px, ${Math.round(above ? top + row * ROW - 4 : top + (row + 1) * ROW + 4)}px)${above ? ' translateY(-100%)' : ''}` }}>
          <span>{current.label}</span>
          {series.filter(item => value(current, item.key) > 0).map(item => <span key={item.key} className="analytics-chart__tooltip-row"><i style={{ background: item.color }} />{item.label}<b>{formatChartValue(value(current, item.key), '%')}</b></span>)}
        </div>}
        <table className="sr-only"><caption>{title}</caption><thead><tr><th scope="col">Строка</th>{series.map(item => <th scope="col" key={item.key}>{item.label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{series.map(item => <td key={item.key}>{formatChartValue(row.values[item.key] ?? null, '%')}</td>)}</tr>)}</tbody></table>
      </>}
    </div>
  </ChartFrame>;
}
