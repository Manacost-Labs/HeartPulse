import { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import '../../../shared/ui/analytics/Analytics.css';
import { SubscriptionMetricsError } from '../api/subscriptionMetricsClient';
import { formatDataAge, lastPollAgeMs } from '../model/subscriptionFreshness';
import { DailyPaidChart, SubscriptionChartsSkeleton, WeeklyAccessChart } from './SubscriptionCharts';
import { SubscriptionTiles, SubscriptionTilesSkeleton } from './SubscriptionTiles';
import { useLiveSubscriptionMetrics, useNow, type LiveSubscriptionMetrics } from './useLiveSubscriptionMetrics';
import './subscriptionAnalytics.css';

export const SUBSCRIPTION_PERIODS = [30, 92, 180, 365] as const;
export const DEFAULT_SUBSCRIPTION_PERIOD = 92;

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const pad = (value: number) => String(value).padStart(2, '0');

/** «11 ноя, 19:25 UTC». */
export function formatUtcMoment(ms: number, seconds = false): string {
  const date = new Date(ms);
  const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}${seconds ? `:${pad(date.getUTCSeconds())}` : ''}`;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}, ${time} UTC`;
}

/** Строка живого индикатора: тикает раз в секунду и не двигает остальную вёрстку. */
export function LiveStatus({ live }: { live: LiveSubscriptionMetrics }) {
  const now = useNow(1000);
  const failed = live.error !== null && live.metrics !== undefined;
  const state = failed ? 'failed' : live.stale ? 'stale' : live.refreshing ? 'busy' : 'ok';
  const updated = live.updatedAt === null ? null : formatDataAge(now - live.updatedAt);
  const pollAge = live.metrics ? lastPollAgeMs(live.metrics, now) : null;
  const pollAgeText = formatDataAge(pollAge);
  return <p className="sa-live" data-testid="live-status" data-state={state}>
    <span>
      <i className="sa-live__dot" data-state={state} aria-hidden="true" />
      <span role="status" className="sa-live__age">{live.refreshing ? 'Обновляем…' : updated ? `Обновлено ${updated}` : 'Ждём данные'}</span>
    </span>
    {live.lastPollAt !== null && <span data-testid="last-poll">Последний опрос Boosty: {formatUtcMoment(live.lastPollAt)}{pollAgeText ? `, ${pollAgeText}` : ''}</span>}
    {failed && live.updatedAt !== null && <span data-testid="update-failed">Не удалось обновить, показаны данные от {formatUtcMoment(live.updatedAt, true)}</span>}
  </p>;
}

function UnavailableState({ live }: { live: LiveSubscriptionMetrics }) {
  const error = live.error;
  const incompatible = error instanceof SubscriptionMetricsError && error.incompatible;
  const forbidden = live.errorKind === 'forbidden';
  const title = forbidden ? 'Недостаточно прав' : live.errorKind === 'unavailable' ? 'Источник аналитики недоступен' : 'Не удалось загрузить аналитику';
  const detail = forbidden
    ? 'Аналитика подписок доступна администраторам с полным доступом.'
    : incompatible
      ? 'Версия источника не совпадает с ожидаемой. Страница заработает, когда источник обновят.'
      : live.errorKind === 'unavailable'
        ? 'Повторим через минуту — страница обновится сама.'
        : `${error?.message ?? 'Нет соединения с сервером.'} Повторим через минуту.`;
  return <div className="sa-state" role="alert" data-testid="unavailable-state">
    <h3>{title}</h3>
    <p>{detail}</p>
    {!forbidden && <button type="button" className="sa-refresh" onClick={() => void live.reload()} disabled={live.refreshing}>
      <RefreshCw size={16} aria-hidden="true" data-spin={live.refreshing || undefined} /> Повторить
    </button>}
  </div>;
}

/** Страница без запросов: всё состояние приходит параметрами (так её собирают сторис). */
export function SubscriptionAnalyticsView({ live, days, onDaysChange }: {
  live: LiveSubscriptionMetrics;
  days: number;
  onDaysChange: (days: number) => void;
}) {
  const { metrics } = live;
  const busy = live.loading || live.refreshing;
  return <div className="subscription-analytics" aria-busy={busy || undefined}>
    <header className="sa-head">
      <div className="sa-head__row">
        <div>
          <h2>Платные подписчики Boosty</h2>
          <p>Наблюдаемое состояние подписчиков, без выручки</p>
        </div>
        <div className="sa-head__row">
          <div className="sa-periods" role="group" aria-label="Период">
            {SUBSCRIPTION_PERIODS.map(period => <button key={period} type="button" aria-pressed={period === days} onClick={() => onDaysChange(period)}>{period} дн.</button>)}
          </div>
          <button type="button" className="sa-refresh" onClick={() => void live.reload()} disabled={live.refreshing}>
            <RefreshCw size={16} aria-hidden="true" data-spin={live.refreshing || undefined} /> Обновить
          </button>
        </div>
      </div>
      <LiveStatus live={live} />
    </header>

    {metrics && live.stale && <div className="sa-banner" role="alert" data-testid="stale-warning">
      <AlertTriangle size={16} aria-hidden="true" />
      <strong>Данные могли устареть.</strong>
      <span>Последний принятый опрос Boosty был больше 15 минут назад: сбор данных мог остановиться.</span>
    </div>}

    {!metrics && live.loading && <>
      <SubscriptionTilesSkeleton />
      <SubscriptionChartsSkeleton />
    </>}
    {!metrics && !live.loading && live.error && <UnavailableState live={live} />}
    {metrics && <>
      <SubscriptionTiles tiles={live.tiles} />
      <div className="sa-charts">
        <DailyPaidChart metrics={metrics} />
        <WeeklyAccessChart metrics={metrics} />
      </div>
      {/* Срез 3 (#362): сюда встают тарифы и переходы, когорты 30/60/90, отток по месяцам, деньги, конверсия и «что нельзя посчитать». */}
      <div className="sa-more" data-slot="more" />
      <p className="sa-footnote">Цифры — наблюдаемое состояние подписчиков: мы видим, кто платит в момент опроса Boosty. Даты и месяцы — по UTC.</p>
    </>}
  </div>;
}

/** Раздел админки «Аналитика подписок»: период выбирается здесь, обновление идёт само. */
export function SubscriptionAnalyticsPage() {
  const [days, setDays] = useState<number>(DEFAULT_SUBSCRIPTION_PERIOD);
  const live = useLiveSubscriptionMetrics(days);
  return <SubscriptionAnalyticsView live={live} days={days} onDaysChange={setDays} />;
}
