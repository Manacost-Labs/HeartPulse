import { useId, useMemo, useState } from 'react';
import { CalendarDays, ChartLine, ChevronDown, TrendingDown, TrendingUp } from 'lucide-react';
import {
  CONSTRUCTED_CARD_HISTORY_METRICS,
  constructedCardHistoryDelta,
  constructedCardHistoryDomain,
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

const WIDTH = 760;
const HEIGHT = 300;
const PLOT = { left: 64, right: 22, top: 24, bottom: 50 };
const PLOT_WIDTH = WIDTH - PLOT.left - PLOT.right;
const PLOT_HEIGHT = HEIGHT - PLOT.top - PLOT.bottom;
const DAY_OPTIONS = [30, 90, 180] as const;

function formatMetric(value: number, unit: 'percent' | 'count', signed = false): string {
  const prefix = signed && value > 0 ? '+' : '';
  if (unit === 'count') {
    return `${prefix}${Math.round(value).toLocaleString('ru-RU')}`;
  }
  return `${prefix}${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
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
  const gradientId = `constructed-card-history-${useId().replace(/[^a-z0-9_-]/gi, '')}`;
  const metricDefinition = CONSTRUCTED_CARD_HISTORY_METRICS.find(item => item.id === metric)
    ?? CONSTRUCTED_CARD_HISTORY_METRICS[0];
  const series = useMemo(() => constructedCardHistorySeries(points, metric), [metric, points]);
  const domain = useMemo(() => constructedCardHistoryDomain(series.map(item => item.value)), [series]);
  const delta = constructedCardHistoryDelta(series);
  const latest = series.at(-1) ?? null;
  const yTicks = Array.from({ length: 5 }, (_, index) => domain[0] + ((domain[1] - domain[0]) * index) / 4);
  const xTickIndexes = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])]
    .filter(index => index >= 0);
  const xPosition = (timestamp: number) => {
    const first = series[0]?.timestamp ?? timestamp;
    const last = series.at(-1)?.timestamp ?? timestamp;
    return PLOT.left + (last === first ? PLOT_WIDTH / 2 : ((timestamp - first) / (last - first)) * PLOT_WIDTH);
  };
  const yPosition = (value: number) => (
    PLOT.top + PLOT_HEIGHT - ((value - domain[0]) / (domain[1] - domain[0])) * PLOT_HEIGHT
  );
  const linePath = series.map((item, index) => `${index ? 'L' : 'M'} ${xPosition(item.timestamp)} ${yPosition(item.value)}`).join(' ');
  const areaPath = series.length
    ? `${linePath} L ${xPosition(series.at(-1)!.timestamp)} ${PLOT.top + PLOT_HEIGHT} L ${xPosition(series[0].timestamp)} ${PLOT.top + PLOT_HEIGHT} Z`
    : '';

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

          <figure className="constructed-card-history__figure">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={`${gradientId}-title ${gradientId}-description`}>
              <title id={`${gradientId}-title`}>{metricDefinition.label} — динамика карты</title>
              <desc id={`${gradientId}-description`}>
                Линейный график за {days} дней. Последнее значение {latest ? formatMetric(latest.value, metricDefinition.unit) : 'не указано'}.
              </desc>
              <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#704b8f" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#704b8f" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {yTicks.map(value => {
                const y = yPosition(value);
                return (
                  <g key={value} className="constructed-card-history__tick">
                    <line x1={PLOT.left} x2={PLOT.left + PLOT_WIDTH} y1={y} y2={y} />
                    <text x={PLOT.left - 10} y={y + 4} textAnchor="end">{formatMetric(value, metricDefinition.unit)}</text>
                  </g>
                );
              })}
              {xTickIndexes.map(index => {
                const item = series[index];
                const x = xPosition(item.timestamp);
                return (
                  <g key={`${item.recordedAt}-${index}`} className="constructed-card-history__tick constructed-card-history__tick--x">
                    <line x1={x} x2={x} y1={PLOT.top} y2={PLOT.top + PLOT_HEIGHT} />
                    <text x={x} y={PLOT.top + PLOT_HEIGHT + 28} textAnchor="middle">{formatDate(item.recordedAt)}</text>
                  </g>
                );
              })}
              <path className="constructed-card-history__area" d={areaPath} fill={`url(#${gradientId})`} />
              <path className="constructed-card-history__line" d={linePath} />
              {series.map((item, index) => (
                <circle
                  key={item.recordedAt}
                  className={index === series.length - 1 ? 'constructed-card-history__point is-current' : 'constructed-card-history__point'}
                  cx={xPosition(item.timestamp)}
                  cy={yPosition(item.value)}
                  r={index === series.length - 1 ? 6 : 3.5}
                />
              ))}
            </svg>
            <figcaption>{metricDefinition.label}. Обновляется вместе со статистикой выбранного периода.</figcaption>
          </figure>
          <ol className="sr-only">
            {series.map(item => (
              <li key={item.recordedAt}>{formatDate(item.recordedAt)}: {formatMetric(item.value, metricDefinition.unit)}</li>
            ))}
          </ol>
          </div>
        )}
      </div>
    </details>
  );
}
