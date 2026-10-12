import '../shared/ui/analytics/Analytics.css';
import { LineChart } from '../shared/ui/analytics/LineChart';
import './ArchetypeHistoryChart.css';

export type HistoryPoint = { series_name: string; point_date: string; value: number | null };
const SERIES = [
  { key: 'winrates_over_time', label: 'Винрейт', color: '#2f7a3e' },
  { key: 'popularity_over_time', label: 'Популярность', color: '#64416f' },
] as const;

export default function ArchetypeHistoryChart({ history }: { history: HistoryPoint[] }) {
  return <div className="archetype-history-chart">{SERIES.map(series =>
    <LineChart key={series.key} title={series.label} unit="%" color={series.color}
      points={history.filter(point => point.series_name === series.key && Number.isFinite(Date.parse(point.point_date)))
        .sort((a, b) => a.point_date.localeCompare(b.point_date))
        .map(point => ({ x: Date.parse(point.point_date), y: point.value,
          label: new Date(point.point_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }) }))}
    />
  )}</div>;
}
