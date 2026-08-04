const REDACTED = '[redacted]';
const SAFE_TAG_KEYS = new Set(['incidentId', 'incidentKind', 'surface']);
const SAFE_METRIC_ATTRIBUTE_KEYS = new Set([
  'rating',
  'navigation_type',
  'edge_region',
  'client_region',
]);

export type SentryEventLike = {
  breadcrumbs?: Array<Record<string, unknown>>;
  contexts?: Record<string, unknown>;
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  extra?: Record<string, unknown>;
  message?: string;
  request?: {
    method?: string;
    url?: string;
    [key: string]: unknown;
  };
  tags?: Record<string, unknown>;
  transaction?: string;
  user?: Record<string, unknown>;
  [key: string]: unknown;
};

export type SentryMetricLike = {
  attributes?: Record<string, unknown>;
  name: string;
  type: string;
  unit?: string;
  value: number;
  [key: string]: unknown;
};

export function redactSentryText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED)
    .replace(/\b(?:bearer|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, REDACTED)
    .replace(/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{8,})?\b/g, REDACTED)
    .replace(/\b(?:[a-f0-9]{32,}|[A-Za-z0-9+/=_-]{48,})\b/gi, REDACTED);
}

export function sentryPathOnly(value: string): string {
  try {
    const url = new URL(value, 'https://redaction.invalid');
    return url.pathname || '/';
  } catch {
    return value.split(/[?#]/, 1)[0] || '/';
  }
}

export function redactSentryEvent<T>(event: T): T {
  const safe = { ...(event as SentryEventLike) };

  delete safe.user;
  delete safe.extra;
  delete safe.contexts;

  if (safe.message) safe.message = redactSentryText(safe.message);
  if (safe.transaction) safe.transaction = sentryPathOnly(safe.transaction);

  if (safe.request) {
    safe.request = {
      method: typeof safe.request.method === 'string' ? safe.request.method : undefined,
      url: typeof safe.request.url === 'string' ? sentryPathOnly(safe.request.url) : undefined,
    };
  }

  if (safe.exception?.values) {
    safe.exception = {
      ...safe.exception,
      values: safe.exception.values.map(value => ({
        ...value,
        value: typeof value.value === 'string' ? redactSentryText(value.value) : value.value,
      })),
    };
  }

  if (safe.breadcrumbs) {
    safe.breadcrumbs = safe.breadcrumbs.map(item => ({
      category: item.category,
      level: item.level,
      message: typeof item.message === 'string' ? redactSentryText(item.message) : undefined,
      timestamp: item.timestamp,
    }));
  }

  if (safe.tags) {
    safe.tags = Object.fromEntries(
      Object.entries(safe.tags).filter(([key]) => SAFE_TAG_KEYS.has(key)),
    );
  }

  return safe as T;
}

export function redactSentryMetric<T>(metric: T): T {
  const safe = { ...(metric as SentryMetricLike) };
  if (safe.attributes) {
    safe.attributes = Object.fromEntries(
      Object.entries(safe.attributes).filter(([key]) => SAFE_METRIC_ATTRIBUTE_KEYS.has(key)),
    );
  }
  return safe as T;
}

export function boundedSampleRate(value: unknown): number {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
}
