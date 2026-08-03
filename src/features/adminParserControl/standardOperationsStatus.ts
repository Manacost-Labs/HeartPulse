export type StandardOperationsStatus = {
  generatedAt: string;
  publicRoutes: string[];
  diamondRoutes: string[];
  caches: Record<string, { entries: number; fresh?: number; active?: number; activeJobs?: number }>;
  deckView: { queued: number; active: number; succeeded: number; failed: number; timeoutMs: number };
  sources: { viciousSyndicate: string; cardStatistics: Record<string, unknown>; renderApi: string };
};

export const EMPTY_STANDARD_OPERATIONS_STATUS: StandardOperationsStatus = {
  generatedAt: '', publicRoutes: [], diamondRoutes: [], caches: {},
  deckView: { queued: 0, active: 0, succeeded: 0, failed: 0, timeoutMs: 0 },
  sources: { viciousSyndicate: '', cardStatistics: {}, renderApi: '' },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const normalized = text(item);
    return normalized ? [normalized] : [];
  });
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  return Object.values(record(value)).flatMap(stringValues);
}

/**
 * The data API used to expose one dataset name per format. It now exposes a
 * rank/period tree. Keep the operational UI compatible with both contracts and
 * never pass an untrusted object directly to React as a text child.
 */
export function describeCardStatisticsSource(value: unknown): string {
  const datasets = [...new Set(stringValues(value))];
  if (!datasets.length) return '—';
  if (datasets.length === 1) return datasets[0] ?? '—';
  return `${datasets.length} наборов данных`;
}

export function normalizeStandardOperationsStatus(value: unknown): StandardOperationsStatus {
  const source = record(value);
  const caches = record(source.caches);
  const deckView = record(source.deckView);
  const sources = record(source.sources);
  const cardStatistics = record(sources.cardStatistics);
  const normalizeCache = (cache: unknown) => {
    const item = record(cache);
    return {
      entries: finiteNumber(item.entries),
      fresh: finiteNumber(item.fresh),
      active: finiteNumber(item.active),
      activeJobs: finiteNumber(item.activeJobs),
    };
  };
  return {
    generatedAt: text(source.generatedAt),
    publicRoutes: textList(source.publicRoutes),
    diamondRoutes: textList(source.diamondRoutes),
    caches: Object.fromEntries(Object.entries(caches).map(([key, cache]) => [key, normalizeCache(cache)])),
    deckView: {
      queued: finiteNumber(deckView.queued),
      active: finiteNumber(deckView.active),
      succeeded: finiteNumber(deckView.succeeded),
      failed: finiteNumber(deckView.failed),
      timeoutMs: finiteNumber(deckView.timeoutMs),
    },
    sources: {
      viciousSyndicate: text(sources.viciousSyndicate),
      cardStatistics,
      renderApi: text(sources.renderApi),
    },
  };
}
