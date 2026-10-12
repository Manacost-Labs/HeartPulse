import { useMemo, type ReactNode } from 'react';
import { BarChart } from '../../../shared/ui/analytics/BarChart';
import { LineChart } from '../../../shared/ui/analytics/LineChart';
import { StackedBarChart } from '../../../shared/ui/analytics/StackedBarChart';
import { DataTable, type DataColumn } from '../../../shared/ui/analytics/DataTable';
import { formatChartValue } from '../../../shared/ui/analytics/analyticsModel';
import { heroAnalyticsNumber, heroTavernDistribution, type HeroAnalyticsRow } from '../model/heroAnalytics';
import { battlegroundMinionIconByRussianName } from '../model/minionTypeIcons';

const TAVERN_SERIES = ['#dbc47e', '#8fc3cd', '#a6bf88', '#d8a57e', '#bfa6cc', '#82b3aa', '#d6b4c3'].map((color, index) => ({ key: String(index + 1), label: `Т${index + 1}`, color }));

export function HeroBarChart({ title, rows, tourId }: {
  title: string; rows: Array<{ label: string; value: number; sub?: string; icon?: string }>; tourId?: string;
}) {
  const placement = title === 'Распределение по местам';
  const topFour = rows.slice(0, 4).reduce((total, row) => total + row.value, 0);
  return <BarChart title={title} rows={rows.map(row => ({ label: row.sub ? `${row.label} · ${row.sub.split(' · ')[0]}` : row.label, value: row.value, detail: row.sub }))} tourId={tourId}
    subtitle={placement ? `Доля игр на каждом месте · топ-4: ${formatChartValue(topFour, '%')}` : 'Самый частый уровень таверны на каждом ходу'} />;
}

export function HeroPowerChart({ rows }: { rows: HeroAnalyticsRow[] }) {
  const points = useMemo(() => rows.map(row => ({
    x: heroAnalyticsNumber(row.turn) ?? NaN, y: heroAnalyticsNumber(row.invoked_rate),
    label: `Ход ${row.turn}`, detail: `${formatChartValue(heroAnalyticsNumber(row.total_data_points), 'count')} наблюдений`,
  })).filter(point => Number.isFinite(point.x)).sort((a, b) => a.x - b.x), [rows]);
  return <LineChart title="Когда прожимать силу героя" subtitle="Доля наблюдений с применением силы героя · по ходам" points={points} unit="%" domain={{ minimum: 0 }} />;
}

export function HeroTavernChart({ rows }: { rows: HeroAnalyticsRow[] }) {
  const data = useMemo(() => heroTavernDistribution(rows), [rows]);
  return <StackedBarChart title="Таверна по ходам" subtitle="Доля игроков на каждом уровне таверны" rows={data} series={TAVERN_SERIES} />;
}

export function HeroDataTable({ title, rows, columns, tourId }: {
  title: string; rows: HeroAnalyticsRow[]; tourId?: string;
  columns: Array<{ key: string; label: string; render?: (row: HeroAnalyticsRow) => ReactNode }>;
}) {
  const definitions = useMemo(() => columns.map(column => ({
    ...column, numeric: true, value: (row: HeroAnalyticsRow) => heroAnalyticsNumber(row[column.key]),
  })), [columns]);
  return <DataTable title={title} rows={rows} columns={definitions} tourId={tourId} pageSize={12} />;
}

const COMPOSITION_COLUMNS: DataColumn<HeroAnalyticsRow>[] = [
  { key: 'name', label: 'Состав', value: row => String(row.name ?? ''), render: row => {
    const name = row.name === 'Aberrations' ? 'Аберрации' : String(row.name ?? 'Состав');
    const icon = battlegroundMinionIconByRussianName[name];
    return <span className="inline-flex items-center gap-2">{icon && <img src={icon} alt="" width="24" height="24" loading="lazy" />}{name}</span>;
  } },
  { key: 'avg_placement', label: 'Среднее место ↓', numeric: true, value: row => heroAnalyticsNumber(row.avg_placement), render: row => formatChartValue(heroAnalyticsNumber(row.avg_placement)) },
  { key: 'popularity', label: 'Выбор', numeric: true, value: row => heroAnalyticsNumber(row.popularity), render: row => formatChartValue(heroAnalyticsNumber(row.popularity), '%') },
  { key: 'popularity_top_4', label: 'Доля в топ-4', numeric: true, value: row => heroAnalyticsNumber(row.popularity_top_4), render: row => formatChartValue(heroAnalyticsNumber(row.popularity_top_4), '%') },
  { key: 'num_games', label: 'Игры', numeric: true, value: row => heroAnalyticsNumber(row.num_games), render: row => formatChartValue(heroAnalyticsNumber(row.num_games), 'count') },
];

export function HeroCompositionAnalytics({ rows }: { rows: HeroAnalyticsRow[] }) {
  if (!rows.length) return null;
  return <div className="grid gap-4">
    <BarChart title="Топ составы героя" subtitle="Частота выбора · сравнение по единой шкале" rows={rows.map(row => ({
      label: row.name === 'Aberrations' ? 'Аберрации' : String(row.name ?? 'Состав'),
      value: heroAnalyticsNumber(row.popularity) ?? NaN,
      detail: `Среднее место ${formatChartValue(heroAnalyticsNumber(row.avg_placement))} · ${formatChartValue(heroAnalyticsNumber(row.num_games), 'count')} игр`,
    }))} />
    <DataTable title="Сравнение составов" rows={rows} columns={COMPOSITION_COLUMNS} />
  </div>;
}
