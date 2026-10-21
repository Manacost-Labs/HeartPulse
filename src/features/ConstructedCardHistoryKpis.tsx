import { KpiGroup, type KpiItem } from '../vendor/varylo-ui/data-display/KpiGroup';
import { formatHistoryMoment, type CardHistoryView } from './constructedCardHistoryModel';

const LABELS = {
  increase: 'Рост',
  decrease: 'Снижение',
  unchanged: 'Без изменений',
  noData: 'Нет данных',
  loading: 'Загружаем статистику',
  ofTarget: (percent: string, target: string) => `${percent} от ${target}`,
};
const PERCENT: Intl.NumberFormatOptions = { style: 'percent', maximumFractionDigits: 2 };
const COUNT: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };
const DAYS: Intl.NumberFormatOptions = { style: 'unit', unit: 'day', unitDisplay: 'short', maximumFractionDigits: 0 };
const DAY_MS = 24 * 60 * 60_000;

/**
 * Current value with its change since the first real value of the range and a sparkline, the
 * range's extremes and how long the card has been tracked. Percentages change in points (54% → 56%
 * is +2), counts relatively.
 */
export function ConstructedCardHistoryKpis({ view, unit, trackedSince, now }: {
  view: CardHistoryView; unit: 'percent' | 'count'; trackedSince: number | null; now: number;
}) {
  const percent = unit === 'percent';
  const scaled = (value: number | undefined) => value === undefined ? null : percent ? value / 100 : value;
  const withTime = view.resolution === 'snapshot';
  const moment = (timestamp: number | undefined) => timestamp === undefined ? undefined : formatHistoryMoment(timestamp, withTime);
  const first = view.points.find(point => point.y !== null);
  const since = first ? moment(first.x) : undefined;
  const items: KpiItem[] = [
    {
      id: 'latest', label: 'Сейчас', value: scaled(view.latest?.value), format: percent ? PERCENT : COUNT,
      ...(percent ? { delta: view.change ?? undefined } : { previous: first?.y ?? null }),
      trend: view.points.map(point => point.y),
      caption: since ? `${percent ? 'п. п. ' : ''}с ${since}` : undefined,
    },
    { id: 'minimum', label: 'Минимум', value: scaled(view.minimum?.value), format: percent ? PERCENT : COUNT, caption: moment(view.minimum?.timestamp) },
    { id: 'maximum', label: 'Максимум', value: scaled(view.maximum?.value), format: percent ? PERCENT : COUNT, caption: moment(view.maximum?.timestamp) },
    {
      id: 'tracked', label: 'История', format: DAYS,
      value: trackedSince === null ? null : Math.max(1, Math.round((now - trackedSince) / DAY_MS)),
      caption: trackedSince === null ? undefined : `с ${formatHistoryMoment(trackedSince, false)}`,
    },
  ];
  return <KpiGroup className="constructed-card-history__kpis" items={items} minTileWidth={150} locale="ru-RU" labels={LABELS} />;
}
