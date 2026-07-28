import { Router, type Request, type Response } from 'express';

export type BoostyObservationType =
  | 'new_subscription'
  | 'observed_renewal'
  | 'observed_decrease';

export type AnalyticsSourceId = 'boosty' | 'tribute';

export type BoostyObservation = {
  observedAt: string;
  type: BoostyObservationType;
  amountRub: number;
  planId: string;
  planName: string;
  source: AnalyticsSourceId;
};

export type RetentionMetric = {
  days: number;
  eligible: number;
  evaluated: number;
  retained: number;
  unknown: number;
  rate: number | null;
};

export type BoostyAnalyticsSource = {
  schemaVersion: number;
  semantics: 'observed_cumulative_delta';
  from: string;
  to: string;
  summary: AnalyticsMetrics;
  plans: PlanMetrics[];
  observations: BoostyObservation[];
  retention: RetentionMetric[];
  coverage: {
    baselineAt: string | null;
    lastAcceptedPollAt: string | null;
    acceptedPolls: number;
    maxPollGapSeconds: number | null;
    complete: boolean;
  };
};

export type KolodaArticle = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
};

export type AnalyticsMetrics = {
  newSubscriptions: number;
  renewals: number;
  revenueRub: number;
  observedDecreaseRub: number;
};

export type BoostySalesMetrics = {
  donations: number;
  postPurchases: number;
  donationRevenueRub: number;
  postRevenueRub: number;
  totalRevenueRub: number;
};

export type BoostySalesBuyer = {
  userId: string;
  name: string;
  email: string;
  donations: number;
  postPurchases: number;
  donationRevenueRub: number;
  postRevenueRub: number;
  totalRevenueRub: number;
  lastPurchaseAt: string;
};

export type BoostySalesPost = {
  postId: string;
  title: string;
  purchases: number;
  uniqueBuyers: number;
  revenueRub: number;
};

export type BoostySaleObservation = {
  observedAt: string;
  type: 'donation' | 'post_purchase';
  amountRub: number;
  postId: string;
  postTitle: string;
};

export type BoostySaleTransaction = {
  eventKey: string;
  type: BoostySaleObservation['type'];
  createdAt: string;
  amountRub: number;
  currency: 'RUB';
  feePaid: boolean;
  user: {
    id: string;
    name: string;
    email: string;
  };
  post: { id: string; title: string } | null;
  targetId: string;
};

export type BoostySalesAnalyticsSource = {
  schemaVersion: number;
  semantics: 'exact_boosty_sales_rows';
  from: string;
  to: string;
  summary: BoostySalesMetrics & { uniqueBuyers: number };
  buyers: BoostySalesBuyer[];
  posts: BoostySalesPost[];
  observations: BoostySaleObservation[];
  transactions: BoostySaleTransaction[];
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

export type PlanMetrics = {
  planId: string;
  planName: string;
  newSubscriptions: number;
  renewals: number;
  revenueRub: number;
  source: AnalyticsSourceId;
};

export type ArticleAnalyticsInterval = {
  article: KolodaArticle;
  from: string;
  to: string;
  metrics: AnalyticsMetrics;
  sales: BoostySalesMetrics;
  plans: PlanMetrics[];
};

export type AnalyticsSourceBreakdown = {
  id: AnalyticsSourceId;
  label: string;
  semantics: 'observed_cumulative_delta' | 'exact_webhook_events';
  summary: AnalyticsMetrics;
  retention: RetentionMetric[];
  coverage: BoostyAnalyticsSource['coverage'];
};

export type BoostyArticleAnalyticsPayload = {
  schemaVersion: number;
  semantics: 'combined_subscription_events';
  from: string;
  to: string;
  summary: AnalyticsMetrics;
  plans: PlanMetrics[];
  observations: BoostyObservation[];
  retention: RetentionMetric[];
  coverage: BoostyAnalyticsSource['coverage'];
  articleIntervals: ArticleAnalyticsInterval[];
  generatedAt: string;
  limitations: string[];
  sourceBreakdown: AnalyticsSourceBreakdown[];
  sales: BoostySalesAnalyticsSource | null;
  sources: { articles: string };
};

export type AdminBoostyAnalyticsDependencies = {
  adminAuth: (request: Request) => unknown | null;
  setPrivateNoStore: (response: Response) => void;
  loadAnalytics: (
    from: Date,
    to: Date,
  ) => Promise<BoostyArticleAnalyticsPayload>;
  now?: () => Date;
};

export type BoostyAnalyticsLoaderOptions = {
  boostyBaseUrl: string;
  kolodaEndpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
};

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_KOLODA_ENDPOINT =
  'https://kolodahearthstone.ru/wp-json/koloda/v1/articles/query';
const UPSTREAM_ERROR = 'Не удалось загрузить аналитику подписок';

export function createAdminBoostyAnalyticsRouter(
  dependencies: AdminBoostyAnalyticsDependencies,
): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date());

  router.get('/admin/boosty/analytics', async (request, response) => {
    dependencies.setPrivateNoStore(response);
    if (!dependencies.adminAuth(request)) {
      return response.status(403).json({ error: 'Недостаточно прав' });
    }
    const range = analyticsRange(request.query.from, request.query.to, now());
    if (!range) {
      return response.status(400).json({
        error: 'Некорректный период аналитики: максимум 366 дней',
      });
    }
    try {
      return response.json(await dependencies.loadAnalytics(range.from, range.to));
    } catch {
      return response.status(502).json({
        error: UPSTREAM_ERROR,
        source: 'unavailable',
      });
    }
  });

  return router;
}

export function createBoostyAnalyticsLoader(
  options: BoostyAnalyticsLoaderOptions,
): (from: Date, to: Date) => Promise<BoostyArticleAnalyticsPayload> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const now = options.now ?? (() => new Date());
  const boostyBaseUrl = options.boostyBaseUrl.replace(/\/+$/, '');
  const kolodaEndpoint = options.kolodaEndpoint ?? DEFAULT_KOLODA_ENDPOINT;

  return async (from, to) => {
    const boostyUrl = new URL(`${boostyBaseUrl}/api/analytics`);
    const tributeUrl = new URL(`${boostyBaseUrl}/api/tribute/analytics`);
    const salesUrl = new URL(`${boostyBaseUrl}/api/boosty/sales/analytics`);
    boostyUrl.searchParams.set('from', from.toISOString());
    boostyUrl.searchParams.set('to', to.toISOString());
    tributeUrl.searchParams.set('from', from.toISOString());
    tributeUrl.searchParams.set('to', to.toISOString());
    salesUrl.searchParams.set('from', from.toISOString());
    salesUrl.searchParams.set('to', to.toISOString());
    salesUrl.searchParams.set('limit', '500');
    const [boostyResult, tributeResult, salesResult, articles] = await Promise.all([
      fetchJson(fetchImpl, boostyUrl.toString(), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      }).then(value => ({ value })).catch(() => ({ value: null })),
      fetchJson(fetchImpl, tributeUrl.toString(), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      }).then(value => ({ value })).catch(() => ({ value: null })),
      fetchJson(fetchImpl, salesUrl.toString(), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      }).then(value => ({ value })).catch(() => ({ value: null })),
      fetchKolodaArticles(fetchImpl, kolodaEndpoint, timeoutMs),
    ]);
    const sources: NormalizedAnalyticsSource[] = [];
    if (boostyResult.value !== null) {
      try {
        sources.push(boostySource(normalizeBoostyAnalytics(boostyResult.value)));
      } catch {
        // Keep the independent Tribute source available.
      }
    }
    if (tributeResult.value !== null) {
      try {
        sources.push(normalizeTributeAnalytics(tributeResult.value));
      } catch {
        // Keep the independent Boosty source available.
      }
    }
    let sales: BoostySalesAnalyticsSource | null = null;
    if (salesResult.value !== null) {
      try {
        sales = normalizeBoostySalesAnalytics(salesResult.value);
      } catch {
        // Subscription analytics remains usable when the independent sales source is invalid.
      }
    }
    if (!sources.length && !sales) throw new Error('analytics unavailable');
    const built = attachBoostySales(
      buildSubscriptionArticleAnalytics(sources, articles, from, to),
      sales,
    );
    return {
      ...built,
      generatedAt: now().toISOString(),
    };
  };
}

async function fetchKolodaArticles(
  fetchImpl: typeof fetch,
  endpoint: string,
  timeoutMs: number,
): Promise<KolodaArticle[]> {
  const fetchPage = (page: number) => fetchJson(fetchImpl, endpoint, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'ManacostArena/1.0',
    },
    body: JSON.stringify({ page, pageSize: 50, order: 'asc' }),
  });
  const firstPayload = await fetchPage(1);
  const firstRoot = objectValue(firstPayload);
  const pagination = objectValue(firstRoot.pagination);
  const totalPages = finiteInteger(pagination.totalPages);
  if (totalPages < 1 || totalPages > 20) {
    throw new Error('invalid Koloda pagination');
  }
  const remainingPayloads = totalPages > 1
    ? await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2)),
    )
    : [];
  return [firstPayload, ...remainingPayloads].flatMap(normalizeKolodaArticles);
}

export function buildBoostyArticleAnalytics(
  source: BoostyAnalyticsSource,
  articleRows: KolodaArticle[],
  from: Date,
  to: Date,
): BoostyArticleAnalyticsPayload {
  return buildSubscriptionArticleAnalytics(
    [boostySource(source)],
    articleRows,
    from,
    to,
  );
}

type NormalizedAnalyticsSource = {
  id: AnalyticsSourceId;
  label: string;
  semantics: AnalyticsSourceBreakdown['semantics'];
  from: string;
  to: string;
  summary: AnalyticsMetrics;
  plans: PlanMetrics[];
  observations: BoostyObservation[];
  retention: RetentionMetric[];
  coverage: BoostyAnalyticsSource['coverage'];
  limitations: string[];
};

export function buildSubscriptionArticleAnalytics(
  analyticsSources: NormalizedAnalyticsSource[],
  articleRows: KolodaArticle[],
  from: Date,
  to: Date,
): BoostyArticleAnalyticsPayload {
  const startMs = from.getTime();
  const endMs = to.getTime();
  const observations = analyticsSources
    .flatMap(source => source.observations)
    .sort((left, right) => validDateMs(left.observedAt) - validDateMs(right.observedAt));
  const sortedArticles = articleRows
    .filter(article => validDateMs(article.publishedAt) < endMs)
    .sort((left, right) => validDateMs(left.publishedAt) - validDateMs(right.publishedAt));
  let anchorIndex = -1;
  for (let index = 0; index < sortedArticles.length; index += 1) {
    if (validDateMs(sortedArticles[index].publishedAt) <= startMs) {
      anchorIndex = index;
    }
  }
  const selectedArticles = sortedArticles.filter((article, index) => (
    validDateMs(article.publishedAt) >= startMs || index === anchorIndex
  ));
  const articleIntervals = selectedArticles.map((article, index) => {
    const next = selectedArticles[index + 1];
    const intervalStart = new Date(
      Math.max(startMs, validDateMs(article.publishedAt)),
    );
    const intervalEnd = new Date(
      Math.min(endMs, next ? validDateMs(next.publishedAt) : endMs),
    );
    const intervalObservations = observations.filter(observation => {
      const observedAt = validDateMs(observation.observedAt);
      return observedAt >= intervalStart.getTime() && observedAt < intervalEnd.getTime();
    });
    return {
      article,
      from: intervalStart.toISOString(),
      to: intervalEnd.toISOString(),
      metrics: metricsFor(intervalObservations),
      sales: salesMetricsFor([]),
      plans: plansFor(intervalObservations),
    };
  }).filter(interval => Date.parse(interval.to) > Date.parse(interval.from));

  const coverage = combinedCoverage(analyticsSources.map(source => source.coverage));
  coverage.complete = coverage.complete && analyticsSources.length === 2;
  const unavailableSources = (['boosty', 'tribute'] as const)
    .filter(sourceId => !analyticsSources.some(source => source.id === sourceId));
  return {
    schemaVersion: 2,
    semantics: 'combined_subscription_events',
    from: from.toISOString(),
    to: to.toISOString(),
    summary: metricsFor(observations),
    plans: plansFor(observations),
    observations,
    retention: combinedRetention(analyticsSources.flatMap(source => source.retention)),
    coverage,
    articleIntervals,
    generatedAt: new Date().toISOString(),
    limitations: [
      'Данные точны только с первого baseline-снимка.',
      'У Boosty продление означает наблюдаемое увеличение накопительной суммы.',
      'У Tribute новые подписки и продления считаются по подписанным webhook-событиям.',
      ...unavailableSources.map(sourceId => (
        `Источник ${sourceId === 'boosty' ? 'Boosty' : 'Tribute'} временно недоступен.`
      )),
      ...analyticsSources.flatMap(source => source.limitations),
      'Связь со статьёй временная, а не доказанная причинная атрибуция.',
    ],
    sourceBreakdown: analyticsSources.map(source => ({
      id: source.id,
      label: source.label,
      semantics: source.semantics,
      summary: source.summary,
      retention: source.retention,
      coverage: source.coverage,
    })),
    sales: null,
    sources: { articles: 'koloda-public-api' },
  };
}

function analyticsRange(
  fromValue: unknown,
  toValue: unknown,
  now: Date,
): { from: Date; to: Date } | null {
  const to = toValue === undefined ? now : parseDate(toValue);
  if (!to) return null;
  const from = fromValue === undefined
    ? new Date(to.getTime() - DEFAULT_RANGE_MS)
    : parseDate(fromValue);
  if (!from) return null;
  const duration = to.getTime() - from.getTime();
  if (duration <= 0 || duration > MAX_RANGE_MS) return null;
  return { from, to };
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetchImpl(url, init);
  if (!response.ok) throw new Error(`upstream status ${response.status}`);
  return response.json();
}

function normalizeBoostyAnalytics(value: unknown): BoostyAnalyticsSource {
  const root = objectValue(value);
  if (
    root.semantics !== 'observed_cumulative_delta'
    || !Array.isArray(root.observations)
    || !Array.isArray(root.retention)
  ) {
    throw new Error('invalid Boosty analytics payload');
  }
  const summary = normalizeMetrics(root.summary);
  const observations = root.observations.map(item => normalizeBoostyObservation(item));
  const retention = root.retention.map(normalizeRetention);
  const coverage = objectValue(root.coverage);
  return {
    schemaVersion: finiteInteger(root.schemaVersion),
    semantics: 'observed_cumulative_delta',
    from: requiredDate(root.from),
    to: requiredDate(root.to),
    summary,
    plans: Array.isArray(root.plans)
      ? root.plans.map(item => normalizePlan(item, 'boosty'))
      : [],
    observations,
    retention,
    coverage: {
      baselineAt: optionalDate(coverage.baselineAt),
      lastAcceptedPollAt: optionalDate(coverage.lastAcceptedPollAt),
      acceptedPolls: finiteInteger(coverage.acceptedPolls),
      maxPollGapSeconds: coverage.maxPollGapSeconds === null
        ? null
        : finiteNumber(coverage.maxPollGapSeconds),
      complete: coverage.complete === true,
    },
  };
}

function boostySource(source: BoostyAnalyticsSource): NormalizedAnalyticsSource {
  return {
    id: 'boosty',
    label: 'Boosty',
    semantics: source.semantics,
    from: source.from,
    to: source.to,
    summary: source.summary,
    plans: source.plans,
    observations: source.observations,
    retention: source.retention,
    coverage: source.coverage,
    limitations: [],
  };
}

function normalizeTributeAnalytics(value: unknown): NormalizedAnalyticsSource {
  const root = objectValue(value);
  if (
    root.semantics !== 'exact_webhook_events'
    || !Array.isArray(root.observations)
    || !Array.isArray(root.retention)
  ) {
    throw new Error('invalid Tribute analytics payload');
  }
  const coverage = objectValue(root.coverage);
  const unsupportedCurrencies = Array.isArray(root.unsupportedRevenueCurrencies)
    ? root.unsupportedRevenueCurrencies
      .map(item => String(item ?? '').trim().slice(0, 8))
      .filter(Boolean)
    : [];
  return {
    id: 'tribute',
    label: 'Tribute',
    semantics: 'exact_webhook_events',
    from: requiredDate(root.from),
    to: requiredDate(root.to),
    summary: normalizeMetrics(root.summary),
    plans: Array.isArray(root.plans)
      ? root.plans.map(item => normalizePlan(item, 'tribute'))
      : [],
    observations: root.observations.flatMap(item => {
      const row = objectValue(item);
      if (row.type === 'cancelled_subscription') return [];
      if (row.type !== 'new_subscription' && row.type !== 'renewed_subscription') {
        throw new Error('invalid Tribute observation type');
      }
      return [{
        observedAt: requiredDate(row.observedAt),
        type: row.type === 'renewed_subscription'
          ? 'observed_renewal' as const
          : 'new_subscription' as const,
        amountRub: finiteNumber(row.amountRub),
        planId: String(row.planId ?? '').slice(0, 100),
        planName: requiredText(row.planName, 200),
        source: 'tribute' as const,
      }];
    }),
    retention: root.retention.map(normalizeRetention),
    coverage: normalizeCoverage(coverage),
    limitations: unsupportedCurrencies.length
      ? [`Доход Tribute в валютах ${unsupportedCurrencies.join(', ')} не пересчитан в рубли.`]
      : [],
  };
}

function normalizeBoostySalesAnalytics(value: unknown): BoostySalesAnalyticsSource {
  const root = objectValue(value);
  if (
    root.semantics !== 'exact_boosty_sales_rows'
    || !Array.isArray(root.buyers)
    || !Array.isArray(root.posts)
    || !Array.isArray(root.observations)
    || !Array.isArray(root.transactions)
  ) {
    throw new Error('invalid Boosty sales analytics payload');
  }
  const summary = objectValue(root.summary);
  const coverage = objectValue(root.coverage);
  const reconciliation = root.reconciliation === null
    ? null
    : objectValue(root.reconciliation);
  const matches = reconciliation === null
    ? null
    : objectValue(reconciliation.matches);
  const matchValues = matches === null
    ? []
    : [
      matches.donationCount,
      matches.donationRevenue,
      matches.postPurchaseCount,
      matches.postRevenue,
    ].filter((item): item is boolean => typeof item === 'boolean');
  return {
    schemaVersion: finiteInteger(root.schemaVersion),
    semantics: 'exact_boosty_sales_rows',
    from: requiredDate(root.from),
    to: requiredDate(root.to),
    summary: {
      donations: nonNegativeInteger(summary.donations),
      postPurchases: nonNegativeInteger(summary.postPurchases),
      uniqueBuyers: nonNegativeInteger(summary.uniqueBuyers),
      donationRevenueRub: nonNegativeNumber(summary.donationRevenueRub),
      postRevenueRub: nonNegativeNumber(summary.postRevenueRub),
      totalRevenueRub: nonNegativeNumber(summary.totalRevenueRub),
    },
    buyers: root.buyers.map(item => {
      const row = objectValue(item);
      return {
        userId: requiredText(row.userId, 128),
        name: boundedText(row.name, 500),
        email: boundedText(row.email, 320),
        donations: nonNegativeInteger(row.donations),
        postPurchases: nonNegativeInteger(row.postPurchases),
        donationRevenueRub: nonNegativeNumber(row.donationRevenueRub),
        postRevenueRub: nonNegativeNumber(row.postRevenueRub),
        totalRevenueRub: nonNegativeNumber(row.totalRevenueRub),
        lastPurchaseAt: requiredDate(row.lastPurchaseAt),
      };
    }),
    posts: root.posts.map(item => {
      const row = objectValue(item);
      return {
        postId: requiredText(row.postId, 128),
        title: requiredText(row.title, 500),
        purchases: nonNegativeInteger(row.purchases),
        uniqueBuyers: nonNegativeInteger(row.uniqueBuyers),
        revenueRub: nonNegativeNumber(row.revenueRub),
      };
    }),
    observations: root.observations.map(item => {
      const row = objectValue(item);
      return {
        observedAt: requiredDate(row.observedAt),
        type: saleType(row.type),
        amountRub: nonNegativeNumber(row.amountRub),
        postId: boundedText(row.postId, 128),
        postTitle: boundedText(row.postTitle, 500),
      };
    }),
    transactions: root.transactions.map(item => {
      const row = objectValue(item);
      const user = objectValue(row.user);
      const post = row.post === null ? null : objectValue(row.post);
      if (row.currency !== 'RUB' || typeof row.feePaid !== 'boolean') {
        throw new Error('invalid Boosty sale transaction');
      }
      return {
        eventKey: requiredText(row.eventKey, 128),
        type: saleType(row.type),
        createdAt: requiredDate(row.createdAt),
        amountRub: nonNegativeNumber(row.amountRub),
        currency: 'RUB' as const,
        feePaid: row.feePaid,
        user: {
          id: requiredText(user.id, 128),
          name: boundedText(user.name, 500),
          email: boundedText(user.email, 320),
        },
        post: post === null ? null : {
          id: requiredText(post.id, 128),
          title: requiredText(post.title, 500),
        },
        targetId: boundedText(row.targetId, 128),
      };
    }),
    coverage: {
      latestImportAt: optionalDate(coverage.latestImportAt),
      imports: nonNegativeInteger(coverage.imports),
      donationRows: nonNegativeInteger(coverage.donationRows),
      postRows: nonNegativeInteger(coverage.postRows),
      complete: coverage.complete === true,
    },
    reconciliationMatches: matchValues.length
      ? matchValues.every(Boolean)
      : null,
    limitations: Array.isArray(root.limitations)
      ? root.limitations.slice(0, 20).map(item => requiredText(item, 500))
      : [],
  };
}

function attachBoostySales(
  payload: BoostyArticleAnalyticsPayload,
  sales: BoostySalesAnalyticsSource | null,
): BoostyArticleAnalyticsPayload {
  return {
    ...payload,
    sales,
    articleIntervals: payload.articleIntervals.map(interval => {
      const observations = sales?.observations.filter(observation => {
        const observedAt = validDateMs(observation.observedAt);
        return observedAt >= validDateMs(interval.from)
          && observedAt < validDateMs(interval.to);
      }) ?? [];
      return {
        ...interval,
        sales: salesMetricsFor(observations),
      };
    }),
    limitations: [
      ...payload.limitations,
      ...(sales
        ? sales.limitations
        : ['Точные донаты и покупки постов Boosty временно недоступны.']),
    ],
  };
}

function salesMetricsFor(observations: BoostySaleObservation[]): BoostySalesMetrics {
  const donations = observations.filter(item => item.type === 'donation');
  const postPurchases = observations.filter(item => item.type === 'post_purchase');
  const donationRevenueRub = roundRub(
    donations.reduce((sum, item) => sum + item.amountRub, 0),
  );
  const postRevenueRub = roundRub(
    postPurchases.reduce((sum, item) => sum + item.amountRub, 0),
  );
  return {
    donations: donations.length,
    postPurchases: postPurchases.length,
    donationRevenueRub,
    postRevenueRub,
    totalRevenueRub: roundRub(donationRevenueRub + postRevenueRub),
  };
}

function normalizeKolodaArticles(value: unknown): KolodaArticle[] {
  const root = objectValue(value);
  if (!Array.isArray(root.data)) throw new Error('invalid Koloda articles payload');
  return root.data.flatMap(item => {
    try {
      const row = objectValue(item);
      const id = String(row.id ?? '').trim();
      const title = requiredText(row.title, 300);
      const url = requiredText(row.url, 1_000);
      if (!id || !/^https:\/\/kolodahearthstone\.ru\//.test(url)) {
        return [];
      }
      return [{ id, title, url, publishedAt: requiredDate(row.publishedAt) }];
    } catch {
      return [];
    }
  });
}

function normalizeBoostyObservation(value: unknown): BoostyObservation {
  const row = objectValue(value);
  if (
    row.type !== 'new_subscription'
    && row.type !== 'observed_renewal'
    && row.type !== 'observed_decrease'
  ) throw new Error('invalid observation type');
  return {
    observedAt: requiredDate(row.observedAt),
    type: row.type,
    amountRub: finiteNumber(row.amountRub),
    planId: String(row.planId ?? '').slice(0, 100),
    planName: requiredText(row.planName, 200),
    source: 'boosty',
  };
}

function normalizeMetrics(value: unknown): AnalyticsMetrics {
  const row = objectValue(value);
  return {
    newSubscriptions: finiteInteger(row.newSubscriptions),
    renewals: finiteInteger(row.renewals),
    revenueRub: finiteNumber(row.revenueRub),
    observedDecreaseRub: finiteNumber(row.observedDecreaseRub),
  };
}

function normalizeRetention(value: unknown): RetentionMetric {
  const row = objectValue(value);
  const days = finiteInteger(row.days);
  const eligible = finiteInteger(row.eligible);
  const evaluated = finiteInteger(row.evaluated);
  const retained = finiteInteger(row.retained);
  const unknown = finiteInteger(row.unknown);
  if ([days, eligible, evaluated, retained, unknown].some(item => item < 0)) {
    throw new Error('invalid retention payload');
  }
  return {
    days,
    eligible,
    evaluated,
    retained,
    unknown,
    rate: row.rate === null ? null : finiteNumber(row.rate),
  };
}

function normalizeCoverage(
  coverage: Record<string, unknown>,
): BoostyAnalyticsSource['coverage'] {
  return {
    baselineAt: optionalDate(coverage.baselineAt),
    lastAcceptedPollAt: optionalDate(coverage.lastAcceptedPollAt),
    acceptedPolls: finiteInteger(coverage.acceptedPolls),
    maxPollGapSeconds: coverage.maxPollGapSeconds === null
      ? null
      : finiteNumber(coverage.maxPollGapSeconds),
    complete: coverage.complete === true,
  };
}

function normalizePlan(value: unknown, source: AnalyticsSourceId): PlanMetrics {
  const row = objectValue(value);
  return {
    planId: String(row.planId ?? '').slice(0, 100),
    planName: requiredText(row.planName, 200),
    newSubscriptions: finiteInteger(row.newSubscriptions),
    renewals: finiteInteger(row.renewals),
    revenueRub: finiteNumber(row.revenueRub),
    source,
  };
}

function metricsFor(observations: BoostyObservation[]): AnalyticsMetrics {
  return {
    newSubscriptions: observations.filter(item => item.type === 'new_subscription').length,
    renewals: observations.filter(item => item.type === 'observed_renewal').length,
    revenueRub: roundRub(observations
      .filter(item => item.type !== 'observed_decrease')
      .reduce((sum, item) => sum + item.amountRub, 0)),
    observedDecreaseRub: roundRub(observations
      .filter(item => item.type === 'observed_decrease')
      .reduce((sum, item) => sum + item.amountRub, 0)),
  };
}

function plansFor(observations: BoostyObservation[]): PlanMetrics[] {
  const plans = new Map<string, PlanMetrics>();
  for (const observation of observations) {
    if (observation.type === 'observed_decrease') continue;
    const key = `${observation.source}\u0000${observation.planId}\u0000${observation.planName}`;
    const current = plans.get(key) ?? {
      planId: observation.planId,
      planName: observation.planName,
      newSubscriptions: 0,
      renewals: 0,
      revenueRub: 0,
      source: observation.source,
    };
    if (observation.type === 'new_subscription') current.newSubscriptions += 1;
    if (observation.type === 'observed_renewal') current.renewals += 1;
    current.revenueRub = roundRub(current.revenueRub + observation.amountRub);
    plans.set(key, current);
  }
  return [...plans.values()].sort((left, right) => (
    right.newSubscriptions - left.newSubscriptions
    || right.renewals - left.renewals
    || left.planName.localeCompare(right.planName, 'ru')
  ));
}

function combinedRetention(metrics: RetentionMetric[]): RetentionMetric[] {
  const combined = new Map<number, RetentionMetric>();
  for (const metric of metrics) {
    const current = combined.get(metric.days) ?? {
      days: metric.days,
      eligible: 0,
      evaluated: 0,
      retained: 0,
      unknown: 0,
      rate: null,
    };
    current.eligible += metric.eligible;
    current.evaluated += metric.evaluated;
    current.retained += metric.retained;
    current.unknown += metric.unknown;
    current.rate = current.evaluated
      ? Math.round(current.retained / current.evaluated * 1_000) / 10
      : null;
    combined.set(metric.days, current);
  }
  return [...combined.values()].sort((left, right) => left.days - right.days);
}

function combinedCoverage(
  rows: BoostyAnalyticsSource['coverage'][],
): BoostyAnalyticsSource['coverage'] {
  const baselines = rows
    .map(row => row.baselineAt)
    .filter((value): value is string => value !== null)
    .sort();
  const lastAccepted = rows
    .map(row => row.lastAcceptedPollAt)
    .filter((value): value is string => value !== null)
    .sort();
  const gaps = rows
    .map(row => row.maxPollGapSeconds)
    .filter((value): value is number => value !== null);
  return {
    baselineAt: baselines[0] ?? null,
    lastAcceptedPollAt: lastAccepted.at(-1) ?? null,
    acceptedPolls: rows.reduce((sum, row) => sum + row.acceptedPolls, 0),
    maxPollGapSeconds: gaps.length ? Math.max(...gaps) : null,
    complete: rows.every(row => row.complete),
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('expected object');
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, maximum: number): string {
  if (typeof value !== 'string') throw new Error('expected text');
  const result = value.trim();
  if (!result || result.length > maximum) throw new Error('invalid text');
  return result;
}

function boundedText(value: unknown, maximum: number): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' || value.length > maximum) {
    throw new Error('invalid text');
  }
  return value.trim();
}

function saleType(value: unknown): BoostySaleObservation['type'] {
  if (value !== 'donation' && value !== 'post_purchase') {
    throw new Error('invalid sale type');
  }
  return value;
}

function requiredDate(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error('invalid date');
  }
  return new Date(value).toISOString();
}

function optionalDate(value: unknown): string | null {
  return value === null || value === undefined ? null : requiredDate(value);
}

function validDateMs(value: string): number {
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : Number.POSITIVE_INFINITY;
}

function finiteNumber(value: unknown): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error('invalid number');
  return result;
}

function finiteInteger(value: unknown): number {
  const result = finiteNumber(value);
  if (!Number.isInteger(result)) throw new Error('invalid integer');
  return result;
}

function nonNegativeInteger(value: unknown): number {
  const result = finiteInteger(value);
  if (result < 0) throw new Error('invalid non-negative integer');
  return result;
}

function nonNegativeNumber(value: unknown): number {
  const result = finiteNumber(value);
  if (result < 0) throw new Error('invalid non-negative number');
  return result;
}

function roundRub(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
