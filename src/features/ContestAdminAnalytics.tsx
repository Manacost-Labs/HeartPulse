import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarRange, RefreshCw } from 'lucide-react';
import {
  analyticsQueryRange,
  defaultAnalyticsDateRange,
  formatAnalyticsDate,
  formatRub,
  type AnalyticsDateRange,
} from './boostyAnalyticsModel';
import { ContestAdminBoostySales } from './ContestAdminBoostySales';
import './ContestAdminAnalytics.css';

export type AnalyticsMetrics = {
  newSubscriptions: number;
  renewals: number;
  revenueRub: number;
  observedDecreaseRub: number;
};

export type AnalyticsPlan = {
  planId: string;
  planName: string;
  newSubscriptions: number;
  renewals: number;
  revenueRub: number;
  source: 'boosty' | 'tribute';
};

export type RetentionMetric = {
  days: number;
  eligible: number;
  evaluated: number;
  retained: number;
  unknown: number;
  rate: number | null;
};

export type BoostySalesMetrics = {
  donations: number;
  postPurchases: number;
  donationRevenueRub: number;
  postRevenueRub: number;
  totalRevenueRub: number;
};

export type BoostySalesAnalyticsSource = {
  semantics: 'exact_boosty_sales_rows';
  summary: BoostySalesMetrics & { uniqueBuyers: number };
  buyers: Array<{
    userId: string;
    name: string;
    email: string;
    donations: number;
    postPurchases: number;
    donationRevenueRub: number;
    postRevenueRub: number;
    totalRevenueRub: number;
    lastPurchaseAt: string;
  }>;
  posts: Array<{
    postId: string;
    title: string;
    purchases: number;
    uniqueBuyers: number;
    revenueRub: number;
  }>;
  transactions: Array<{
    eventKey: string;
    type: 'donation' | 'post_purchase';
    createdAt: string;
    amountRub: number;
    currency: 'RUB';
    feePaid: boolean;
    user: { id: string; name: string; email: string };
    post: { id: string; title: string } | null;
    targetId: string;
  }>;
  coverage: {
    latestImportAt: string | null;
    imports: number;
    donationRows: number;
    postRows: number;
    complete: boolean;
  };
  reconciliationMatches: boolean | null;
  limitations: string[];
};

export type ArticleAnalyticsInterval = {
  article: {
    id: string;
    title: string;
    url: string;
    publishedAt: string;
  };
  from: string;
  to: string;
  metrics: AnalyticsMetrics;
  sales: BoostySalesMetrics;
  plans: AnalyticsPlan[];
};

export type BoostyArticleAnalyticsPayload = {
  semantics: 'combined_subscription_events';
  from: string;
  to: string;
  summary: AnalyticsMetrics;
  plans: AnalyticsPlan[];
  retention: RetentionMetric[];
  coverage: {
    baselineAt: string | null;
    lastAcceptedPollAt: string | null;
    acceptedPolls: number;
    maxPollGapSeconds: number | null;
    complete: boolean;
  };
  articleIntervals: ArticleAnalyticsInterval[];
  generatedAt: string;
  limitations: string[];
  sourceBreakdown: Array<{
    id: 'boosty' | 'tribute';
    label: string;
    semantics: 'observed_cumulative_delta' | 'exact_webhook_events';
    summary: AnalyticsMetrics;
    retention: RetentionMetric[];
    coverage: {
      baselineAt: string | null;
      lastAcceptedPollAt: string | null;
      acceptedPolls: number;
      maxPollGapSeconds: number | null;
      complete: boolean;
    };
  }>;
  sales: BoostySalesAnalyticsSource | null;
};

type ContestAdminAnalyticsViewProps = {
  payload: BoostyArticleAnalyticsPayload | null;
  loading: boolean;
  error: string;
  range: AnalyticsDateRange;
  onRangeChange: (range: AnalyticsDateRange) => void;
  onReload: () => void;
};

export function ContestAdminAnalytics() {
  const [range, setRange] = useState(defaultAnalyticsDateRange);
  const [payload, setPayload] = useState<BoostyArticleAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    const queryRange = analyticsQueryRange(range);
    if (!queryRange) {
      setError('Проверьте даты: период должен быть не длиннее 366 дней.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams(queryRange);
      const response = await fetch(`/api/admin/boosty/analytics?${params}`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
      });
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Не удалось загрузить аналитику подписок',
        );
      }
      setPayload(data as BoostyArticleAnalyticsPayload);
    } catch (loadError) {
      if ((loadError as Error).name !== 'AbortError') {
        setError((loadError as Error).message);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return (
    <ContestAdminAnalyticsView
      payload={payload}
      loading={loading}
      error={error}
      range={range}
      onRangeChange={setRange}
      onReload={() => void load()}
    />
  );
}

export function ContestAdminAnalyticsView({
  payload,
  loading,
  error,
  range,
  onRangeChange,
  onReload,
}: ContestAdminAnalyticsViewProps) {
  const plans = payload?.plans ?? [];
  const intervals = payload?.articleIntervals ?? [];
  const retention = payload?.retention ?? [];
  const sourceBreakdown = payload?.sourceBreakdown ?? [];
  const maxPlanRevenue = Math.max(1, ...plans.map(plan => plan.revenueRub));

  return (
    <div className="contest-admin-card admin-full-card boosty-analytics" aria-busy={loading}>
      <div className="contest-users-head boosty-analytics-head">
        <div>
          <h2>Статьи → подписки и продажи</h2>
          <p className="contest-muted">
            Подписки Boosty/Tribute, донаты и покупки постов между публикациями.
          </p>
        </div>
        <button
          type="button"
          className="contest-secondary-button"
          onClick={onReload}
          disabled={loading}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {loading ? 'Обновляем…' : 'Обновить'}
        </button>
      </div>

      <div className="boosty-analytics-toolbar" aria-label="Период аналитики">
        <CalendarRange size={20} aria-hidden="true" />
        <label>
          С
          <input
            type="date"
            value={range.from}
            onChange={event => onRangeChange({ ...range, from: event.target.value })}
          />
        </label>
        <label>
          По
          <input
            type="date"
            value={range.to}
            onChange={event => onRangeChange({ ...range, to: event.target.value })}
          />
        </label>
        <span>Дата «По» включается целиком.</span>
      </div>

      {error && (
        <div className="contest-message contest-message-err" role="alert">
          {error}
        </div>
      )}

      <div className="boosty-analytics-notice">
        <AlertTriangle size={18} aria-hidden="true" />
        <div>
          <strong>Это временная корреляция, не рекламная атрибуция.</strong>
          <span>
            Подписки Boosty считаются по накопительной сумме, Tribute — по webhook.
            Донаты и покупки постов Boosty загружаются точными строками sales ledger.
          </span>
        </div>
      </div>

      <div className="admin-stat-grid boosty-analytics-stats">
        <div>
          <span>Новые подписки</span>
          <strong>{payload?.summary.newSubscriptions ?? '—'}</strong>
          <small>Boosty + Tribute</small>
        </div>
        <div>
          <span>Продления</span>
          <strong>{payload?.summary.renewals ?? '—'}</strong>
          <small>все подключённые источники</small>
        </div>
        <div>
          <span>Получено</span>
          <strong>{payload ? formatRub(payload.summary.revenueRub) : '—'}</strong>
          <small>подписки в RUB</small>
        </div>
        <div>
          <span>Снижения</span>
          <strong>{payload ? formatRub(payload.summary.observedDecreaseRub) : '—'}</strong>
          <small>возврат или пересчёт не доказан</small>
        </div>
      </div>

      <section className="boosty-analytics-section" aria-labelledby="sources-title">
        <div className="boosty-analytics-section-head">
          <div>
            <h3 id="sources-title">По площадкам</h3>
            <p>Отдельно видно вклад Boosty и Tribute.</p>
          </div>
        </div>
        <div className="boosty-source-grid">
          {sourceBreakdown.map(source => {
            const d30 = source.retention.find(metric => metric.days === 30);
            return (
              <article key={source.id}>
                <div>
                  <strong>{source.label}</strong>
                  <span>
                    {source.semantics === 'exact_webhook_events'
                      ? 'точные webhook-события'
                      : 'наблюдаемые изменения'}
                  </span>
                </div>
                <dl>
                  <div><dt>Новые</dt><dd>{source.summary.newSubscriptions}</dd></div>
                  <div><dt>Продления</dt><dd>{source.summary.renewals}</dd></div>
                  <div><dt>Получено</dt><dd>{formatRub(source.summary.revenueRub)}</dd></div>
                  <div>
                    <dt>Удержание D30</dt>
                    <dd>{d30?.rate === null || d30 === undefined ? '—' : `${d30.rate}%`}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <ContestAdminBoostySales sales={payload?.sales ?? null} loading={loading} />

      <section className="boosty-analytics-section" aria-labelledby="retention-title">
        <div className="boosty-analytics-section-head">
          <div>
            <h3 id="retention-title">Удержание новых подписчиков</h3>
            <p>
              Статус на первом полном снимке после контрольного дня; пробелы данных
              остаются неизвестными.
            </p>
          </div>
          <span className={payload?.coverage.complete ? 'is-complete' : 'is-partial'}>
            {payload?.coverage.complete ? 'Покрытие полное' : 'Покрытие частичное'}
          </span>
        </div>
        <div className="boosty-retention-grid">
          {retention.length ? retention.map(metric => (
            <article key={metric.days}>
              <span>D{metric.days}</span>
              <strong>{metric.rate === null ? '—' : `${metric.rate}%`}</strong>
              <small>
                {metric.retained} из {metric.evaluated} · неизвестно {metric.unknown}
              </small>
            </article>
          )) : (
            <p className="contest-muted">Когорты появятся после накопления новых подписок.</p>
          )}
        </div>
      </section>

      <section className="boosty-analytics-section" aria-labelledby="plans-title">
        <div className="boosty-analytics-section-head">
          <div>
            <h3 id="plans-title">Планы подписки</h3>
            <p>Тариф сохраняется в момент наблюдаемого платежа.</p>
          </div>
        </div>
        <div className="boosty-plan-list">
          {plans.length ? plans.map(plan => (
            <article key={`${plan.source}:${plan.planId}:${plan.planName}`}>
              <div>
                <strong>{plan.planName}</strong>
                <span>
                  {plan.source === 'tribute' ? 'Tribute' : 'Boosty'} · новых{' '}
                  {plan.newSubscriptions} · продлений {plan.renewals}
                </span>
              </div>
              <div className="boosty-plan-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(3, plan.revenueRub / maxPlanRevenue * 100)}%` }} />
              </div>
              <b>{formatRub(plan.revenueRub)}</b>
            </article>
          )) : (
            <p className="contest-muted">За выбранный период платежей по планам нет.</p>
          )}
        </div>
      </section>

      <section className="boosty-analytics-section" aria-labelledby="articles-analytics-title">
        <div className="boosty-analytics-section-head">
          <div>
            <h3 id="articles-analytics-title">Периоды между статьями</h3>
            <p>Интервал начинается с публикации и заканчивается перед следующей.</p>
          </div>
          <span>{intervals.length} интервалов</span>
        </div>
        <div className="boosty-analytics-table-wrap">
          <table className="boosty-analytics-table">
            <thead>
              <tr>
                <th>Статья и период</th>
                <th>Новые</th>
                <th>Продления</th>
                <th>Получено</th>
                <th>Донаты</th>
                <th>Покупки постов</th>
                <th>Продажи Boosty</th>
                <th>Планы</th>
              </tr>
            </thead>
            <tbody>
              {intervals.map(interval => (
                <tr key={`${interval.article.id}:${interval.from}`}>
                  <td>
                    <a href={interval.article.url} target="_blank" rel="noreferrer">
                      {interval.article.title}
                    </a>
                    <span>
                      {formatAnalyticsDate(interval.from)} → {formatAnalyticsDate(interval.to)}
                    </span>
                  </td>
                  <td data-label="Новые">{interval.metrics.newSubscriptions}</td>
                  <td data-label="Продления">{interval.metrics.renewals}</td>
                  <td data-label="Получено">{formatRub(interval.metrics.revenueRub)}</td>
                  <td data-label="Донаты">{interval.sales.donations}</td>
                  <td data-label="Покупки постов">{interval.sales.postPurchases}</td>
                  <td data-label="Продажи Boosty">
                    {formatRub(interval.sales.totalRevenueRub)}
                  </td>
                  <td data-label="Планы">
                    {interval.plans.length
                      ? interval.plans.map(plan => (
                        `${plan.source === 'tribute' ? 'Tribute' : 'Boosty'} — ${plan.planName}: ${
                          plan.newSubscriptions + plan.renewals
                        }`
                      )).join(' · ')
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!intervals.length && (
            <p className="contest-muted boosty-analytics-empty">
              Нет статей или наблюдаемых платежей для выбранного периода.
            </p>
          )}
        </div>
      </section>

      <footer className="boosty-analytics-footer">
        <span>Baseline: {formatAnalyticsDate(payload?.coverage.baselineAt ?? null)}</span>
        <span>Последний снимок: {formatAnalyticsDate(payload?.coverage.lastAcceptedPollAt ?? null)}</span>
        <span>Принято снимков: {payload?.coverage.acceptedPolls ?? 0}</span>
      </footer>
    </div>
  );
}
