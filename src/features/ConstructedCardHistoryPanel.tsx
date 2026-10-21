import '../shared/ui/analytics/Analytics.css';
import '../vendor/varylo-ui/styles/index.css';
import { LineChart } from '../shared/ui/analytics/LineChart';
import { formatChartValue } from '../shared/ui/analytics/analyticsModel';
import { SegmentedControl } from '../vendor/varylo-ui/navigation/SegmentedControl';
import { useMemo, useState } from 'react';
import { CalendarDays, ChartLine, Hourglass } from 'lucide-react';
import {
  CONSTRUCTED_CARD_HISTORY_METRICS,
  CONSTRUCTED_CARD_REFERENCE_METRICS,
  cardHistoryRanges,
  cardHistoryView,
  formatHistoryMoment,
  type ConstructedCardHistoryMetric,
  type ConstructedCardHistoryPoint,
  type ConstructedCardHistoryReference,
} from './constructedCardHistoryModel';
import { ConstructedCardHistoryKpis } from './ConstructedCardHistoryKpis';
import { ConstructedCardHistorySkeleton } from './ConstructedCardHistorySkeleton';

export type ConstructedCardHistoryPanelProps = {
  points: ConstructedCardHistoryPoint[];
  /** First snapshot of the card in the slice; the first loaded point when the server omits it. */
  trackedSince?: string | null;
  references?: ConstructedCardHistoryReference[];
  days: number;
  onDaysChange: (days: number) => void;
  loading?: boolean;
  error?: string;
  /** Fixed clock for stories and tests; the page uses the current time. */
  now?: number;
};

const NO_REFERENCE = 'none';

function ShortHistory({ trackedSince, sampled, latest }: { trackedSince: number | null; sampled: boolean; latest: string | null }) {
  const since = trackedSince === null ? null : formatHistoryMoment(trackedSince, false);
  return (
    <div className="constructed-card-history__state" role="status">
      <Hourglass size={22} aria-hidden="true" />
      <div>
        <strong>{sampled ? 'Мало данных' : 'Мало игр'}{since ? `: карта отслеживается с ${since}` : ''}</strong>
        <span>{sampled
          ? 'Тренд появится через несколько дней, когда накопится больше обновлений.'
          : 'В выборке меньше 100 розыгрышей карты — значения ещё ненадёжны, тренд появится после релиза или роста популярности.'}</span>
      </div>
      {latest && <p><span>Сейчас</span><strong>{latest}</strong></p>}
    </div>
  );
}

/** Body of the opened «Динамика карты» disclosure; loaded only when it opens. */
export default function ConstructedCardHistoryPanel({
  points, trackedSince = null, references = [], days, onDaysChange, loading = false, error = '', now: fixedNow,
}: ConstructedCardHistoryPanelProps) {
  const [metric, setMetric] = useState<ConstructedCardHistoryMetric>('deckPopularity');
  const [referenceScope, setReferenceScope] = useState<string>(NO_REFERENCE);
  const definition = CONSTRUCTED_CARD_HISTORY_METRICS.find(item => item.id === metric) ?? CONSTRUCTED_CARD_HISTORY_METRICS[0];
  const comparable = CONSTRUCTED_CARD_REFERENCE_METRICS.has(metric) ? references : [];
  const reference = comparable.find(item => item.scope === referenceScope);
  const view = useMemo(() => cardHistoryView(points, metric, { reference: reference?.points }), [points, metric, reference]);
  const now = fixedNow ?? Date.now();
  const start = trackedSince ? Date.parse(trackedSince) : view.trackedSince;
  const ranges = cardHistoryRanges(Number.isFinite(start) ? start : null, now);
  const shownDays = ranges.find(range => range.days >= days && range.enabled)?.days
    ?? ranges.filter(range => range.enabled).at(-1)?.days ?? days;
  const unit = definition.unit === 'percent' ? '%' : 'count';
  const subtitle = [
    view.resolution === 'day' ? 'Последний снимок каждого дня' : 'Каждое обновление статистики',
    metric === 'winrateWhenPlayed' ? 'полоса — 95% интервал по числу розыгрышей' : '',
    view.sampledSince !== null && view.trackedSince !== view.sampledSince ? `до ${formatHistoryMoment(view.sampledSince, true)} карта почти не встречалась` : '',
  ].filter(Boolean).join('; ') + '.';

  return (
    <div className="constructed-card-history__body">
      <div className="constructed-card-history__toolbar">
        <SegmentedControl
          className="constructed-card-history__metrics" size="sm" aria-label="Показатель графика" value={metric}
          onValueChange={value => setMetric(value as ConstructedCardHistoryMetric)}
          options={CONSTRUCTED_CARD_HISTORY_METRICS.map(item => ({ value: item.id, ariaLabel: item.shortLabel, label: item.phoneLabel
            ? <><span className="constructed-card-history__label-long">{item.shortLabel}</span><span className="constructed-card-history__label-short">{item.phoneLabel}</span></>
            : item.shortLabel }))}
        />
        <div className="constructed-card-history__ranges">
          <CalendarDays size={16} aria-hidden="true" />
          {ranges.length > 0 && <SegmentedControl
            size="sm" aria-label="Диапазон истории" value={String(shownDays)} onValueChange={value => onDaysChange(Number(value))}
            options={ranges.map(range => ({ value: String(range.days), label: `${range.days} дн.`, disabled: !range.enabled }))}
          />}
          {start !== null && Number.isFinite(start) && <span>данные с {formatHistoryMoment(start, false)}</span>}
        </div>
      </div>
      {comparable.length > 0 && view.trend && !loading && !error && (
        <div className="constructed-card-history__compare">
          <span id="constructed-card-history-compare">Сравнить</span>
          <SegmentedControl
            size="sm" aria-labelledby="constructed-card-history-compare" value={reference ? referenceScope : NO_REFERENCE}
            onValueChange={setReferenceScope}
            options={[{ value: NO_REFERENCE, label: 'Нет' }, ...comparable.map(item => ({ value: item.scope, label: item.scope === 'class' ? 'Класс' : 'Формат' }))]}
          />
          {reference && <span className="constructed-card-history__legend" aria-hidden="true"><i /> {reference.label}</span>}
        </div>
      )}

      {loading ? (
        <ConstructedCardHistorySkeleton label={definition.label} />
      ) : error ? (
        <div className="constructed-card-history__state" role="status">
          <ChartLine size={22} aria-hidden="true" />
          <div><strong>История временно недоступна</strong><span>{error}</span></div>
        </div>
      ) : !view.trend ? (
        <ShortHistory
          trackedSince={start !== null && Number.isFinite(start) ? start : null}
          sampled={view.sampledSince !== null}
          latest={view.latest ? formatChartValue(view.latest.value, unit) : null}
        />
      ) : (
        <div className="constructed-card-history__content">
          <LineChart
            title={definition.label} subtitle={subtitle} points={view.points} unit={unit}
            domain={metric === 'deckPopularity' || metric === 'timesPlayed' ? { minimum: 0 } : undefined}
            bandLabel="95% интервал" referenceLabel={reference?.label}
          />
          <ConstructedCardHistoryKpis view={view} unit={definition.unit} trackedSince={start !== null && Number.isFinite(start) ? start : null} now={now} />
        </div>
      )}
    </div>
  );
}
