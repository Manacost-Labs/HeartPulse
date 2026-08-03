import type { HealthDatasetInput } from './health.js';

interface UpstreamDataHealthOptions {
  url: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  refreshIntervalMs?: number;
  now?: () => number;
}

interface UpstreamHealthPayload {
  data?: {
    ok?: boolean;
    serving_ok?: boolean;
    freshness_ok?: boolean;
    sources?: number;
    stale_sources?: unknown;
    hard_failed_sources?: unknown;
    semantic_failed_sources?: unknown;
    publication_failed_sources?: unknown;
  };
  meta?: {
    fetched_at?: unknown;
    count?: number;
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => String(item ?? '').trim()).filter(Boolean)
    : [];
}

function issueSummary(data: NonNullable<UpstreamHealthPayload['data']>): string | undefined {
  const groups = [
    ['stale', stringList(data.stale_sources)],
    ['hard-failed', stringList(data.hard_failed_sources)],
    ['semantic-failed', stringList(data.semantic_failed_sources)],
    ['publication-failed', stringList(data.publication_failed_sources)],
  ] as const;
  const messages = groups
    .filter(([, sources]) => sources.length > 0)
    .map(([label, sources]) => `${label}: ${sources.join(', ')}`);
  return messages.length > 0 ? messages.join('; ') : undefined;
}

export function createUpstreamDataHealthMonitor(options: UpstreamDataHealthOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const refreshIntervalMs = options.refreshIntervalMs ?? 5 * 60_000;
  const now = options.now ?? Date.now;
  let current: HealthDatasetInput = {
    name: 'hs-data-api',
    source: options.url,
    state: 'missing',
    warning: 'Upstream data health has not been checked yet.',
    requiredForReadiness: false,
  };
  let inflight: Promise<void> | null = null;

  async function runRefresh(): Promise<void> {
    try {
      const response = await fetchImpl(options.url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as UpstreamHealthPayload;
      const data = payload.data ?? {};
      const fetchedAt = String(payload.meta?.fetched_at ?? '').trim();
      const healthy = data.ok === true
        && data.serving_ok !== false
        && data.freshness_ok !== false;
      current = {
        name: 'hs-data-api',
        updatedAt: fetchedAt || new Date(now()).toISOString(),
        source: options.url,
        records: Number(payload.meta?.count ?? data.sources),
        state: healthy ? 'fresh' : 'stale',
        dataStatus: healthy ? 'fresh' : 'degraded',
        warning: issueSummary(data),
        requiredForReadiness: false,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      current = {
        ...current,
        state: current.updatedAt ? 'stale' : 'missing',
        dataStatus: 'unavailable',
        warning: `Upstream health check failed: ${detail}`,
      };
    }
  }

  return {
    refresh(): Promise<void> {
      if (!inflight) {
        inflight = runRefresh().finally(() => { inflight = null; });
      }
      return inflight;
    },
    getInput(): HealthDatasetInput {
      return { ...current };
    },
    start(): NodeJS.Timeout {
      void this.refresh();
      const timer = setInterval(() => { void this.refresh(); }, refreshIntervalMs);
      timer.unref();
      return timer;
    },
  };
}
