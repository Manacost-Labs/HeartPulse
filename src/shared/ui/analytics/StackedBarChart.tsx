import { ChartFrame } from './ChartFrame';
import { formatChartValue } from './analyticsModel';
import { usePlotWidth } from './usePlotWidth';

export type StackSeries = { key: string; label: string; color: string };
export type StackRow = { label: string; values: Record<string, number> };

export function StackedBarChart({ title, subtitle, rows, series }: { title: string; subtitle?: string; rows: StackRow[]; series: StackSeries[] }) {
  const { ref, width } = usePlotWidth();
  const legendColumns = Math.max(1, Math.floor(width / 88));
  const legendHeight = Math.ceil(series.length / legendColumns) * 22;
  const left = 64;
  const plotWidth = width - left - 12;
  return <ChartFrame title={title} subtitle={subtitle} exportable={rows.length > 0}>
    <div ref={ref} className="analytics-chart__plot">
      {!rows.length ? <p className="analytics-chart__empty">Для графика пока нет данных.</p> : <svg data-chart viewBox={`0 0 ${width} ${rows.length * 34 + 30 + legendHeight}`} role="img" aria-label={title}>
        {series.map((item, index) => <g key={item.key} transform={`translate(${index % legendColumns * 88} ${Math.floor(index / legendColumns) * 22})`}><rect y="2" width="10" height="10" rx="2" fill={item.color} /><text x="16" y="12" className="analytics-chart__axis">{item.label}</text></g>)}
        {[0, 50, 100].map(value => <text key={value} className="analytics-chart__axis" x={left + plotWidth * value / 100} y={13 + legendHeight} textAnchor={value === 0 ? 'start' : value === 100 ? 'end' : 'middle'}>{value}%</text>)}
        {rows.map((row, index) => {
          let offset = 0;
          return <g key={row.label}><text className="analytics-chart__bar-label" x="0" y={index * 34 + 44 + legendHeight}>{row.label}</text><rect x={left} y={index * 34 + 28 + legendHeight} width={plotWidth} height="23" rx="3" fill="#e8dcc0" />
            {series.map(item => {
              const value = Number.isFinite(row.values[item.key]) ? Math.max(0, Math.min(100 - offset, row.values[item.key])) : 0;
              const start = offset;
              offset += value;
              return value > 0 ? <g key={item.key}><title>{row.label}, {item.label}: {formatChartValue(value, '%')}</title><rect x={left + start / 100 * plotWidth} y={index * 34 + 28 + legendHeight} width={value / 100 * plotWidth} height="23" fill={item.color} />{value > (width < 480 ? 20 : 12) && <text x={left + (start + value / 2) / 100 * plotWidth} y={index * 34 + 44 + legendHeight} textAnchor="middle" fill="#30251c" fontSize="12" fontWeight="600">{item.label}</text>}</g> : null;
            })}
          </g>;
        })}
      </svg>}
    </div>
    <details className="analytics-chart__data"><summary>Данные графика</summary><div className="analytics-table__scroll"><table><caption className="sr-only">{title}</caption><thead><tr><th scope="col">Ход</th>{series.map(item => <th scope="col" key={item.key}>{item.label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{series.map(item => <td key={item.key}>{formatChartValue(row.values[item.key] ?? null, '%')}</td>)}</tr>)}</tbody></table></div></details>
  </ChartFrame>;
}
