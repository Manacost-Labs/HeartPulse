import { KpiGroup, type KpiItem } from '../vendor/varylo-ui/data-display/KpiGroup';
import { historyKpiComparison } from './archetypeInsightsModel';
import '../vendor/varylo-ui/styles/index.css';
import './archetypeVaryloTheme.css';

type DossierItem = {
  winrate: number | null;
  popularity: number | null;
  games: number;
  deckCount: number;
  durationMinutes: number | null;
  turns: number | null;
};

type HistoryPoint = { recordedAt: string; winrate: number | null; popularity: number | null; games: number; patch?: string | null };

const DATE = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const PERCENT: Intl.NumberFormatOptions = { style: 'percent', maximumFractionDigits: 1 };
const LABELS = {
  increase: 'Рост',
  decrease: 'Снижение',
  unchanged: 'Без изменений',
  noData: 'Нет данных',
  loading: 'Загружаем статистику',
  ofTarget: (percent: string, target: string) => `${percent} от ${target}`,
};

function rate(value: number | null) {
  return value === null || !Number.isFinite(value) ? null : value / 100;
}

/** Percentage-point change: a rate going from 54% to 56% is +2, not +3.7%. */
function points(latest: number | null, previous: number | null): number | undefined {
  return latest === null || previous === null ? undefined : latest - previous;
}

/**
 * The dossier's statistics strip. Winrate, popularity and games gain their change and a
 * 7-day sparkline when the subscriber history arrives; every tile reserves that room, so
 * nothing below the header moves when it does (guests keep the plain values).
 */
export function ArchetypeDossierKpis({ item, history }: { item: DossierItem; history: readonly HistoryPoint[] }) {
  const comparison = historyKpiComparison(history);
  const since = comparison ? DATE.format(new Date(comparison.previous.recordedAt)) : '';
  const items: KpiItem[] = [
    {
      id: 'winrate', label: 'Винрейт', value: rate(item.winrate), format: PERCENT,
      delta: comparison ? points(comparison.latest.winrate, comparison.previous.winrate) : undefined,
      trend: comparison?.trend.map(point => point.winrate),
      caption: comparison ? `п. п. к ${since}` : undefined,
    },
    {
      id: 'popularity', label: 'Популярность', value: rate(item.popularity), format: PERCENT,
      delta: comparison ? points(comparison.latest.popularity, comparison.previous.popularity) : undefined,
      trend: comparison?.trend.map(point => point.popularity),
      caption: comparison ? `п. п. к ${since}` : undefined,
    },
    {
      id: 'games', label: 'Игры', value: item.games, format: { maximumFractionDigits: 0 },
      previous: comparison?.gamesPrevious?.games,
      trend: comparison?.gamesTrend.map(point => point.games),
      caption: comparison?.gamesPrevious ? `к ${since}` : undefined,
    },
    { id: 'builds', label: 'Сборки', value: item.deckCount },
    { id: 'match', label: 'Средний матч', value: item.durationMinutes, format: { style: 'unit', unit: 'minute', unitDisplay: 'short', maximumFractionDigits: 1 } },
    { id: 'turn', label: 'Средний ход', value: item.turns, format: { maximumFractionDigits: 1 } },
  ];
  return (
    <KpiGroup
      className="archetype-dossier__metrics hp-varylo hp-varylo--plate"
      items={items}
      minTileWidth={104}
      locale="ru-RU"
      labels={LABELS}
      data-winrate-tone={item.winrate === null ? undefined : item.winrate >= 52 ? 'strong' : item.winrate >= 49 ? 'even' : 'weak'}
    />
  );
}
