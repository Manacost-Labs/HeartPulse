import { LineChart } from '../../../shared/ui/analytics/LineChart';
import { DataTable, type DataColumn } from '../../../shared/ui/analytics/DataTable';
import { formatChartValue } from '../../../shared/ui/analytics/analyticsModel';

type RoundRow = {
  combat_round: number; impact: number; combat_winrate: number; avg_placement_with: number;
  games_with_minion: number; wins: number; losses: number;
};
const METRICS = [
  { key: 'impact', title: 'Влияние по раундам', subtitle: 'Изменение среднего места при наличии существа', unit: '', color: '#967026' },
  { key: 'combat_winrate', title: 'Доля побед в боях', subtitle: 'Доля выигранных боёв в каждом раунде', unit: '%', color: '#2f7a3e' },
  { key: 'avg_placement_with', title: 'Среднее место', subtitle: 'Меньшее значение лучше · шкала от 1 до 8', unit: '', color: '#486c85' },
  { key: 'games_with_minion', title: 'Размер выборки', subtitle: 'Игры с существом в каждом раунде', unit: 'count', color: '#64416f' },
] as const;
const COLUMNS: DataColumn<RoundRow>[] = [
  { key: 'round', label: 'Раунд', value: row => row.combat_round, numeric: true },
  ...METRICS.map(metric => ({ key: metric.key, label: metric.title === 'Влияние по раундам' ? 'Влияние' : metric.title === 'Размер выборки' ? 'Игры с картой' : metric.title, numeric: true,
    value: (row: RoundRow) => row[metric.key], render: (row: RoundRow) => formatChartValue(row[metric.key], metric.unit) })),
  { key: 'wins', label: 'Победы', value: row => row.wins, render: row => formatChartValue(row.wins, 'count'), numeric: true },
  { key: 'losses', label: 'Поражения', value: row => row.losses, render: row => formatChartValue(row.losses, 'count'), numeric: true },
];

export function RoundAnalytics({ rows }: { rows: RoundRow[] }) {
  return <div className="grid gap-4">
    <div className="grid gap-4 lg:grid-cols-2">{METRICS.map(metric => <LineChart key={metric.key} title={metric.title} subtitle={metric.subtitle} unit={metric.unit} color={metric.color} xLabel="Раунд "
      domain={metric.key === 'games_with_minion' ? { minimum: 0 } : metric.key === 'avg_placement_with' ? { minimum: 1, maximum: 8 } : undefined}
      points={rows.map(row => ({ x: row.combat_round, y: row[metric.key] }))} />)}</div>
    <DataTable title="Статистика по раундам" rows={rows} columns={COLUMNS} pageSize={16} />
  </div>;
}
