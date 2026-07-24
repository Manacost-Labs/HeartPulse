import React, { useMemo, useState } from 'react';
import './ArchetypeHistoryChart.css';

type HistoryPoint = { series_name: string; point_date: string; value: number | null };

const WIDTH = 760;
const HEIGHT = 230;
const PLOT = { left: 48, right: 16, top: 18, bottom: 36 };
const PLOT_WIDTH = WIDTH - PLOT.left - PLOT.right;
const PLOT_HEIGHT = HEIGHT - PLOT.top - PLOT.bottom;

const SERIES = [
  { key: 'winrates_over_time', label: 'Винрейт', color: '#9c2025' },
  { key: 'popularity_over_time', label: 'Популярность', color: '#b47b16' },
] as const;

function percentage(value: number | null | undefined) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : '—';
}

function dateLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function ArchetypeHistoryChart({ history }: { history: HistoryPoint[] }) {
  const [selectedDate, setSelectedDate] = useState('');
  const data = useMemo(() => SERIES.map(series => ({
    ...series,
    points: history
      .filter(point => point.series_name === series.key && typeof point.value === 'number')
      .sort((a, b) => a.point_date.localeCompare(b.point_date)),
  })), [history]);
  const dates = useMemo(() => [...new Set(history.map(point => point.point_date))].sort(), [history]);
  const activeDate = selectedDate || dates[dates.length - 1] || '';

  if (!dates.length) return <p>Исторические точки пока не найдены.</p>;

  return (
    <div className="archetype-history-chart">
      {data.map(series => {
        const values = series.points.map(point => point.value as number);
        if (!values.length) return null;
        const low = Math.floor((Math.min(...values) - 1) * 2) / 2;
        const high = Math.ceil((Math.max(...values) + 1) * 2) / 2;
        const domain = Math.max(high - low, 1);
        const x = (index: number) => PLOT.left + (index / Math.max(dates.length - 1, 1)) * PLOT_WIDTH;
        const y = (value: number) => PLOT.top + PLOT_HEIGHT - ((value - low) / domain) * PLOT_HEIGHT;
        const byDate = new Map<string, number>(
          series.points.map(point => [point.point_date, point.value as number] as const),
        );
        const path = dates
          .map((date, index) => byDate.has(date) ? `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(byDate.get(date)!)}` : '')
          .filter(Boolean)
          .join(' ');
        const activeValue = byDate.get(activeDate);
        const activeIndex = dates.indexOf(activeDate);
        return (
          <section className="archetype-history-chart__series" key={series.key}>
            <header><span style={{ backgroundColor: series.color }} />{series.label}<strong>{percentage(activeValue)}</strong></header>
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${series.label} по дням`}>
              <line className="archetype-history-chart__grid" x1={PLOT.left} x2={WIDTH - PLOT.right} y1={PLOT.top} y2={PLOT.top} />
              <line className="archetype-history-chart__grid" x1={PLOT.left} x2={WIDTH - PLOT.right} y1={PLOT.top + PLOT_HEIGHT / 2} y2={PLOT.top + PLOT_HEIGHT / 2} />
              <line className="archetype-history-chart__grid" x1={PLOT.left} x2={WIDTH - PLOT.right} y1={PLOT.top + PLOT_HEIGHT} y2={PLOT.top + PLOT_HEIGHT} />
              <text x={PLOT.left - 8} y={PLOT.top + 4} textAnchor="end">{percentage(high)}</text>
              <text x={PLOT.left - 8} y={PLOT.top + PLOT_HEIGHT + 4} textAnchor="end">{percentage(low)}</text>
              <path d={path} className="archetype-history-chart__line" style={{ stroke: series.color }} />
              {activeValue !== undefined && activeIndex >= 0 && (
                <>
                  <line className="archetype-history-chart__cursor" x1={x(activeIndex)} x2={x(activeIndex)} y1={PLOT.top} y2={PLOT.top + PLOT_HEIGHT} />
                  <circle cx={x(activeIndex)} cy={y(activeValue)} r="5" fill={series.color} />
                </>
              )}
              {dates.map((date, index) => (
                <rect key={date} x={x(index) - PLOT_WIDTH / Math.max(dates.length - 1, 1) / 2} y={PLOT.top} width={PLOT_WIDTH / Math.max(dates.length - 1, 1)} height={PLOT_HEIGHT} fill="transparent" onMouseEnter={() => setSelectedDate(date)} />
              ))}
              <text x={PLOT.left} y={HEIGHT - 10}>{dateLabel(dates[0])}</text>
              <text x={WIDTH - PLOT.right} y={HEIGHT - 10} textAnchor="end">{dateLabel(dates[dates.length - 1])}</text>
            </svg>
          </section>
        );
      })}
      <p className="archetype-history-chart__date">{dateLabel(activeDate)} · наведите на график, чтобы сравнить значения</p>
    </div>
  );
}
