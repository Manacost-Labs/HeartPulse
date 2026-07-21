export const DEFAULT_DATA_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface HealthDatasetInput {
  name: string;
  updatedAt?: unknown;
  source?: unknown;
  records?: number;
  state?: DatasetHealthState;
  dataStatus?: unknown;
  cacheSource?: unknown;
  warning?: unknown;
}

export type DatasetHealthState = 'fresh' | 'stale' | 'missing' | 'invalid';

export interface DatasetHealth {
  name: string;
  state: DatasetHealthState;
  updatedAt: string | null;
  source: string | null;
  ageMs: number | null;
  records: number | null;
  dataStatus?: string | null;
  cacheSource?: string | null;
  warning?: string | null;
}

export interface DataHealthReport {
  status: 'ok' | 'degraded' | 'unavailable';
  ready: boolean;
  fresh: boolean;
  checkedAt: string;
  maxAgeMs: number;
  datasets: DatasetHealth[];
}

export function evaluateDataHealth(
  inputs: HealthDatasetInput[],
  options: { now?: number; maxAgeMs?: number } = {},
): DataHealthReport {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_DATA_MAX_AGE_MS;

  const datasets = inputs.map(input => {
    const rawUpdatedAt = String(input.updatedAt ?? '').trim();
    const timestamp = rawUpdatedAt ? Date.parse(rawUpdatedAt) : Number.NaN;
    let state: DatasetHealthState;
    let ageMs: number | null = null;
    let updatedAt: string | null = null;

    if (!rawUpdatedAt) {
      state = 'missing';
    } else if (!Number.isFinite(timestamp) || timestamp > now + MAX_CLOCK_SKEW_MS) {
      state = 'invalid';
    } else {
      ageMs = Math.max(0, now - timestamp);
      updatedAt = new Date(timestamp).toISOString();
      state = ageMs <= maxAgeMs ? 'fresh' : 'stale';
    }

    const explicitState = input.state;
    if (state !== 'missing' && state !== 'invalid' && explicitState === 'stale') state = 'stale';
    if (explicitState === 'missing' || explicitState === 'invalid') state = explicitState;

    return {
      name: input.name,
      state,
      updatedAt,
      source: String(input.source ?? '').trim() || null,
      ageMs,
      records: Number.isFinite(input.records) ? Math.max(0, Number(input.records)) : null,
      ...(input.dataStatus !== undefined
        ? { dataStatus: String(input.dataStatus ?? '').trim() || null }
        : {}),
      ...(input.cacheSource !== undefined
        ? { cacheSource: String(input.cacheSource ?? '').trim() || null }
        : {}),
      ...(input.warning !== undefined
        ? { warning: String(input.warning ?? '').trim() || null }
        : {}),
    } satisfies DatasetHealth;
  });

  const ready = datasets.length > 0 && datasets.every(dataset => dataset.state !== 'missing' && dataset.state !== 'invalid');
  const fresh = ready && datasets.every(dataset => dataset.state === 'fresh');

  return {
    status: fresh ? 'ok' : ready ? 'degraded' : 'unavailable',
    ready,
    fresh,
    checkedAt: new Date(now).toISOString(),
    maxAgeMs,
    datasets,
  };
}
