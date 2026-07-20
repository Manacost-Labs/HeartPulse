import { createHash } from 'node:crypto';

export type TierlistPatchWindow = string | Record<string, unknown>;

export interface TierlistEarlyStatsMetadata {
  data_phase?: string;
  provisional?: boolean;
  accepted_rows?: number;
  baseline_rows?: number;
  coverage_ratio?: number;
  minimum_sample?: number;
  patch_window?: TierlistPatchWindow;
}

const EARLY_STATS_KEYS = [
  'data_phase',
  'provisional',
  'accepted_rows',
  'baseline_rows',
  'coverage_ratio',
  'minimum_sample',
  'patch_window',
] as const;

function metadataContainers(payload: any): any[] {
  const data = payload?.data;
  const structured = data?.structured ?? payload?.structured;
  const view = payload?.view;
  return [
    payload,
    payload?.metadata,
    payload?.early_stats,
    data,
    data?.metadata,
    data?.early_stats,
    structured,
    structured?.metadata,
    structured?.early_stats,
    view,
    view?.metadata,
    view?.early_stats,
  ].filter(candidate => candidate && typeof candidate === 'object');
}

function firstMetadataValue(containers: any[], key: typeof EARLY_STATS_KEYS[number]): unknown {
  for (const container of containers) {
    if (Object.prototype.hasOwnProperty.call(container, key)) return container[key];
  }
  return undefined;
}

function finiteNonNegative(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function explicitBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === 1) return true;
  if (value === false || value === 'false' || value === 0) return false;
  return undefined;
}

export function normalizeTierlistEarlyStatsMetadata(payload: unknown): TierlistEarlyStatsMetadata {
  const containers = metadataContainers(payload);
  const result: TierlistEarlyStatsMetadata = {};

  const dataPhase = firstMetadataValue(containers, 'data_phase');
  if (typeof dataPhase === 'string' && dataPhase.trim()) result.data_phase = dataPhase.trim();

  const provisional = explicitBoolean(firstMetadataValue(containers, 'provisional'));
  if (provisional !== undefined) result.provisional = provisional;

  const acceptedRows = finiteNonNegative(firstMetadataValue(containers, 'accepted_rows'));
  if (acceptedRows !== undefined) result.accepted_rows = acceptedRows;

  const baselineRows = finiteNonNegative(firstMetadataValue(containers, 'baseline_rows'));
  if (baselineRows !== undefined) result.baseline_rows = baselineRows;

  const coverageRatio = finiteNonNegative(firstMetadataValue(containers, 'coverage_ratio'));
  if (coverageRatio !== undefined) result.coverage_ratio = coverageRatio;

  const minimumSample = finiteNonNegative(firstMetadataValue(containers, 'minimum_sample'));
  if (minimumSample !== undefined) result.minimum_sample = minimumSample;

  const patchWindow = firstMetadataValue(containers, 'patch_window');
  if (
    (typeof patchWindow === 'string' && patchWindow.trim())
    || (patchWindow !== null && typeof patchWindow === 'object' && !Array.isArray(patchWindow))
  ) {
    result.patch_window = patchWindow as TierlistPatchWindow;
  }

  return result;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function tierlistEarlyStatsEtagToken(metadata: TierlistEarlyStatsMetadata): string {
  const normalized = Object.fromEntries(
    EARLY_STATS_KEYS
      .filter(key => metadata[key] !== undefined)
      .map(key => [key, metadata[key]]),
  );
  return createHash('sha1').update(stableSerialize(normalized)).digest('hex').slice(0, 12);
}
