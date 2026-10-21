import { useMemo } from 'react';
import { LineChart } from '../shared/ui/analytics/LineChart';
import { useViewerTimeZone } from '../shared/ui/useViewerTimeZone';
import { archetypeHistoryCharts, historyPeriodLabel } from './archetypeInsightsModel';

type HistoryPoint = { recordedAt: string; winrate: number | null; popularity: number | null; games: number; patch?: string | null };

/** Winrate with its interval, popularity and games per day; a dashed line marks each change of HSGuru period. */
export function ArchetypeHistoryCharts({ history }: { history: readonly HistoryPoint[] }) {
  const timeZone = useViewerTimeZone();
  const charts = useMemo(() => archetypeHistoryCharts(history.filter(point => Number.isFinite(Date.parse(point.recordedAt)))
    .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)), timeZone), [history, timeZone]);
  const subtitle = `${history.length} срезов · пунктир — смена периода HSGuru`;
  return <div className="archetype-history__charts">
    <LineChart title="Винрейт" subtitle={`${subtitle} · полоса — 95% интервал`} unit="%" color="#8d171d" points={charts.winrate}
      segmentLabel={historyPeriodLabel} bandLabel="95% интервал" />
    <LineChart title="Популярность" subtitle={subtitle} unit="%" color="#2f6c9e" domain={{ minimum: 0 }} points={charts.popularity}
      segmentLabel={historyPeriodLabel} />
    <LineChart title="Игр за сутки" subtitle="Прирост игр за 24 часа внутри периода HSGuru" unit="count" color="#8a5b24" domain={{ minimum: 0 }}
      points={charts.dailyGames} segmentLabel={historyPeriodLabel} />
  </div>;
}
