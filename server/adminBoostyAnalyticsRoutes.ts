import { Router, type Request, type Response } from 'express';

export type BoostyObservationType =
  | 'new_subscription'
  | 'observed_renewal'
  | 'observed_decrease';

export type BoostyObservation = {
  observedAt: string;
  type: BoostyObservationType;
  amountRub: number;
  planId: string;
  planName: string;
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

export type PlanMetrics = {
  planId: string;
  planName: string;
  newSubscriptions: number;
  renewals: number;
  revenueRub: number;
};

export type ArticleAnalyticsInterval = {
  article: KolodaArticle;
  from: string;
  to: string;
  metrics: AnalyticsMetrics;
  plans: PlanMetrics[];
};

export type BoostyArticleAnalyticsPayload = BoostyAnalyticsSource & {
  articleIntervals: ArticleAnalyticsInterval[];
  generatedAt: string;
  limitations: string[];
  sources: {
    boosty: string;
    articles: string;
  };
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
const UPSTREAM_ERROR = 'Не удалось загрузить аналитику Boosty';

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
    boostyUrl.searchParams.set('from', from.toISOString());
    boostyUrl.searchParams.set('to', to.toISOString());
    const [boostyPayload, articlePayload] = await Promise.all([
      fetchJson(fetchImpl, boostyUrl.toString(), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
      }),
      fetchJson(fetchImpl, kolodaEndpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'ManacostArena/1.0',
        },
        body: JSON.stringify({ page: 1, pageSize: 100, order: 'asc' }),
      }),
    ]);
    return {
      ...buildBoostyArticleAnalytics(
        normalizeBoostyAnalytics(boostyPayload),
        normalizeKolodaArticles(articlePayload),
        from,
        to,
      ),
      generatedAt: now().toISOString(),
    };
  };
}

export function buildBoostyArticleAnalytics(
  source: BoostyAnalyticsSource,
  articleRows: KolodaArticle[],
  from: Date,
  to: Date,
): BoostyArticleAnalyticsPayload {
  const startMs = from.getTime();
  const endMs = to.getTime();
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
    const observations = source.observations.filter(observation => {
      const observedAt = validDateMs(observation.observedAt);
      return observedAt >= intervalStart.getTime() && observedAt < intervalEnd.getTime();
    });
    return {
      article,
      from: intervalStart.toISOString(),
      to: intervalEnd.toISOString(),
      metrics: metricsFor(observations),
      plans: plansFor(observations),
    };
  }).filter(interval => Date.parse(interval.to) > Date.parse(interval.from));

  return {
    ...source,
    articleIntervals,
    generatedAt: new Date().toISOString(),
    limitations: [
      'Данные точны только с первого baseline-снимка.',
      'Продление означает наблюдаемое увеличение накопительной суммы Boosty.',
      'Связь со статьёй временная, а не доказанная причинная атрибуция.',
    ],
    sources: {
      boosty: 'boosty-monitor-sqlite',
      articles: 'koloda-public-api',
    },
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
  const observations = root.observations.map(normalizeObservation);
  const retention = root.retention.map(item => {
    const row = objectValue(item);
    const days = finiteInteger(row.days);
    const eligible = finiteInteger(row.eligible);
    const evaluated = finiteInteger(row.evaluated);
    const retained = finiteInteger(row.retained);
    const unknown = finiteInteger(row.unknown);
    if ([days, eligible, evaluated, retained, unknown].some(itemValue => itemValue < 0)) {
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
  });
  const coverage = objectValue(root.coverage);
  return {
    schemaVersion: finiteInteger(root.schemaVersion),
    semantics: 'observed_cumulative_delta',
    from: requiredDate(root.from),
    to: requiredDate(root.to),
    summary,
    plans: Array.isArray(root.plans) ? root.plans.map(normalizePlan) : [],
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

function normalizeKolodaArticles(value: unknown): KolodaArticle[] {
  const root = objectValue(value);
  if (!Array.isArray(root.data)) throw new Error('invalid Koloda articles payload');
  return root.data.map(item => {
    const row = objectValue(item);
    const id = String(row.id ?? '').trim();
    const title = requiredText(row.title, 300);
    const url = requiredText(row.url, 1_000);
    if (!id || !/^https:\/\/kolodahearthstone\.ru\//.test(url)) {
      throw new Error('invalid Koloda article');
    }
    return { id, title, url, publishedAt: requiredDate(row.publishedAt) };
  });
}

function normalizeObservation(value: unknown): BoostyObservation {
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

function normalizePlan(value: unknown): PlanMetrics {
  const row = objectValue(value);
  return {
    planId: String(row.planId ?? '').slice(0, 100),
    planName: requiredText(row.planName, 200),
    newSubscriptions: finiteInteger(row.newSubscriptions),
    renewals: finiteInteger(row.renewals),
    revenueRub: finiteNumber(row.revenueRub),
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
    const key = `${observation.planId}\u0000${observation.planName}`;
    const current = plans.get(key) ?? {
      planId: observation.planId,
      planName: observation.planName,
      newSubscriptions: 0,
      renewals: 0,
      revenueRub: 0,
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

function roundRub(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
