import '../shared/ui/analytics/Analytics.css';
import { LineChart } from '../shared/ui/analytics/LineChart';
import { formatChartValue } from '../shared/ui/analytics/analyticsModel';
import { useMemo, useState } from 'react';
import { CalendarDays, ChartLine, ChevronDown, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CONSTRUCTED_CARD_HISTORY_METRICS,
  constructedCardHistoryDelta,
  constructedCardHistorySeries,
  type ConstructedCardHistoryMetric,
  type ConstructedCardHistoryPoint,
} from './constructedCardHistoryModel';
import './ConstructedCardHistoryChart.css';

type ConstructedCardHistoryChartProps = {
  points: ConstructedCardHistoryPoint[];
  periodLabel: string;
  formatLabel: string;
  rankLabel: string;
  days: number;
  onDaysChange: (days: number) => void;
  loading?: boolean;
  error?: string;
  onOpenChange?: (open: boolean) => void;
};

const DAY_OPTIONS = [30, 90, 180] as const;

function formatMetric(value: number, unit: 'percent' | 'count', signed = false): string {
  const prefix = signed && value > 0 ? '+' : '';
  if (unit === 'count') {
    return `${prefix}${Math.round(value).toLocaleString('ru-RU')}`;
  }
  return `${prefix}${formatChartValue(value, '%')}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
    : '—';
}

export default function ConstructedCardHistoryChart({
  points,
  periodLabel,
  formatLabel,
  rankLabel,
  days,
  onDaysChange,
  loading = false,
  error = '',
  onOpenChange,
}: ConstructedCardHistoryChartProps) {
  const [metric, setMetric] = useState<ConstructedCardHistoryMetric>('deckPopularity');
  const metricDefinition = CONSTRUCTED_CARD_HISTORY_METRICS.find(item => item.id === metric)
    ?? CONSTRUCTED_CARD_HISTORY_METRICS[0];
  const series = useMemo(() => constructedCardHistorySeries(points, metric), [metric, points]);
  const plotPoints = useMemo(() => {
    const observations = new Map<number, { x: number; y: number | null; label: string }>();
    points.forEach(point => {
      const timestamp = Date.parse(point.recordedAt);
      if (!Number.isFinite(timestamp)) return;
      const value = point[metric];
      observations.set(timestamp, { x: timestamp, y: typeof value === 'number' && Number.isFinite(value) ? value : null, label: formatDate(point.recordedAt) });
    });
    return [...observations.values()].sort((a, b) => a.x - b.x);
  }, [points, metric]);
  const delta = constructedCardHistoryDelta(series);
  const latest = series.at(-1) ?? null;

  return (
    <details
      className="constructed-card-history"
      onToggle={event => onOpenChange?.(event.currentTarget.open)}
    >
      <summary className="constructed-card-history__header">
        <div className="constructed-card-history__heading">
          <span aria-hidden="true"><ChartLine size={22} /></span>
          <div>
            <h2 id="constructed-card-history-title">Динамика карты</h2>
            <p>{formatLabel} · {rankLabel} · {periodLabel}</p>
          </div>
        </div>
        <span className="constructed-card-history__disclosure">
          <span>Показать или скрыть график</span>
          <ChevronDown size={20} aria-hidden="true" />
        </span>
      </summary>

      <div className="constructed-card-history__body">
        <div className="constructed-card-history__ranges" aria-label="Диапазон истории">
          <CalendarDays size={17} aria-hidden="true" />
          {DAY_OPTIONS.map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => onDaysChange(option)}
            >
              {option} дн.
            </button>
          ))}
        </div>

        <div className="constructed-card-history__metrics" aria-label="Показатель графика">
          {CONSTRUCTED_CARD_HISTORY_METRICS.map(item => (
            <button
              key={item.id}
              type="button"
              aria-pressed={metric === item.id}
              onClick={() => setMetric(item.id)}
            >
              {item.shortLabel}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="constructed-card-history__state" aria-busy="true">
            <span className="constructed-card-history__skeleton" />
            <strong>Загружаем историю</strong>
          </div>
        ) : error ? (
          <div className="constructed-card-history__state" role="status">
            <ChartLine size={28} />
            <strong>История временно недоступна</strong>
            <span>{error}</span>
          </div>
        ) : series.length < 2 ? (
          <div className="constructed-card-history__state">
            <ChartLine size={28} />
            <strong>История начинает накапливаться</strong>
            <span>Для линии нужны минимум два обновления. Текущий снимок уже сохранён автоматически.</span>
          </div>
        ) : (
          <div className="constructed-card-history__content">
          <dl className="constructed-card-history__summary">
            <div>
              <dt>Сейчас</dt>
              <dd>{latest ? formatMetric(latest.value, metricDefinition.unit) : '—'}</dd>
            </div>
            <div>
              <dt>Изменение</dt>
              <dd className={delta === null ? '' : delta > 0 ? 'is-positive' : delta < 0 ? 'is-negative' : ''}>
                {delta !== null && delta > 0 ? <TrendingUp size={17} /> : delta !== null && delta < 0 ? <TrendingDown size={17} /> : null}
                {delta === null ? '—' : formatMetric(delta, metricDefinition.unit, true)}
              </dd>
            </div>
            <div>
              <dt>Снимков</dt>
              <dd>{series.length.toLocaleString('ru-RU')}</dd>
            </div>
          </dl>

          <LineChart
            title={metricDefinition.label}
            subtitle={`${metricDefinition.label}. Обновляется вместе со статистикой выбранного периода.`}
            points={plotPoints}
            unit={metricDefinition.unit === 'percent' ? '%' : 'count'}
            domain={{ minimum: 0 }}
          />

          </div>
        )}
      </div>
    </details>
  );
}
