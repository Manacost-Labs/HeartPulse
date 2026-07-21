export const DATASET_ENVELOPE_SCHEMA_VERSION = 1 as const;

export type DatasetMode = 'stable' | 'early';
export type DatasetFreshness = 'fresh' | 'aging' | 'stale' | 'unavailable';
export type DatasetQualityStatus = 'pass' | 'warning';

export type DatasetQuality = {
  status: DatasetQualityStatus;
  warnings: string[];
  sampleSize: number | null;
  coverage: number | null;
};

export type DatasetEnvelope<T> = {
  schemaVersion: typeof DATASET_ENVELOPE_SCHEMA_VERSION;
  dataset: string;
  datasetVersion: string;
  mode: DatasetMode;
  generatedAt: string;
  sourceUpdatedAt: string | null;
  publishedAt: string;
  freshness: DatasetFreshness;
  partial: boolean;
  quality: DatasetQuality;
  data: T;
};

export type DatasetContractErrorCode =
  | 'INVALID_ENVELOPE'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'UNEXPECTED_DATASET'
  | 'INVALID_DATA';

export class DatasetContractError extends Error {
  readonly code: DatasetContractErrorCode;

  constructor(code: DatasetContractErrorCode, message: string) {
    super(message);
    this.name = 'DatasetContractError';
    this.code = code;
  }
}

type ParseEnvelopeOptions<T> = {
  dataset: string;
  parseData: (value: unknown) => T;
  now?: number;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatasetContractError('INVALID_ENVELOPE', `${label}: expected object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, maximum = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw new DatasetContractError('INVALID_ENVELOPE', `${label}: expected non-empty string`);
  }
  return value;
}

function isoDate(value: unknown, label: string, now: number): string {
  const date = requiredString(value, label, 64);
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60 * 1000) {
    throw new DatasetContractError('INVALID_ENVELOPE', `${label}: invalid date`);
  }
  return date;
}

function nullableIsoDate(value: unknown, label: string, now: number): string | null {
  return value === null ? null : isoDate(value, label, now);
}

function nullableNonNegativeInteger(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new DatasetContractError('INVALID_ENVELOPE', `${label}: expected non-negative integer or null`);
  }
  return value;
}

function nullableCoverage(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new DatasetContractError('INVALID_ENVELOPE', 'quality.coverage: expected 0..1 or null');
  }
  return value;
}

function parseQuality(value: unknown): DatasetQuality {
  const quality = record(value, 'quality');
  if (quality.status !== 'pass' && quality.status !== 'warning') {
    throw new DatasetContractError('INVALID_ENVELOPE', 'quality.status: unsupported value');
  }
  if (!Array.isArray(quality.warnings)
    || quality.warnings.length > 50
    || quality.warnings.some(warning => typeof warning !== 'string' || !warning.trim() || warning.length > 240)) {
    throw new DatasetContractError('INVALID_ENVELOPE', 'quality.warnings: invalid warnings list');
  }
  if (quality.status === 'pass' && quality.warnings.length > 0) {
    throw new DatasetContractError('INVALID_ENVELOPE', 'quality: pass status cannot contain warnings');
  }
  if (quality.status === 'warning' && quality.warnings.length === 0) {
    throw new DatasetContractError('INVALID_ENVELOPE', 'quality: warning status requires at least one warning');
  }
  return {
    status: quality.status,
    warnings: [...quality.warnings],
    sampleSize: nullableNonNegativeInteger(quality.sampleSize, 'quality.sampleSize'),
    coverage: nullableCoverage(quality.coverage),
  };
}

export function parseDatasetEnvelope<T>(
  value: unknown,
  options: ParseEnvelopeOptions<T>,
): DatasetEnvelope<T> {
  const envelope = record(value, 'dataset envelope');
  if (envelope.schemaVersion !== DATASET_ENVELOPE_SCHEMA_VERSION) {
    throw new DatasetContractError(
      'UNSUPPORTED_SCHEMA_VERSION',
      `Unsupported dataset schema version: ${String(envelope.schemaVersion)}`,
    );
  }
  if (envelope.dataset !== options.dataset) {
    throw new DatasetContractError(
      'UNEXPECTED_DATASET',
      `Expected ${options.dataset}, received ${String(envelope.dataset)}`,
    );
  }
  const datasetVersion = requiredString(envelope.datasetVersion, 'datasetVersion', 128);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(datasetVersion)) {
    throw new DatasetContractError('INVALID_ENVELOPE', 'datasetVersion: unsupported characters');
  }
  if (envelope.mode !== 'stable' && envelope.mode !== 'early') {
    throw new DatasetContractError('INVALID_ENVELOPE', 'mode: unsupported value');
  }
  if (!['fresh', 'aging', 'stale', 'unavailable'].includes(String(envelope.freshness))) {
    throw new DatasetContractError('INVALID_ENVELOPE', 'freshness: unsupported value');
  }
  if (typeof envelope.partial !== 'boolean') {
    throw new DatasetContractError('INVALID_ENVELOPE', 'partial: expected boolean');
  }
  if (envelope.mode === 'early' && (!envelope.partial || (envelope.quality as Record<string, unknown>)?.status !== 'warning')) {
    throw new DatasetContractError('INVALID_ENVELOPE', 'early mode requires partial data and warning quality');
  }

  const now = options.now ?? Date.now();
  const generatedAt = isoDate(envelope.generatedAt, 'generatedAt', now);
  const sourceUpdatedAt = nullableIsoDate(envelope.sourceUpdatedAt, 'sourceUpdatedAt', now);
  const publishedAt = isoDate(envelope.publishedAt, 'publishedAt', now);
  const generatedTimestamp = Date.parse(generatedAt);
  const publishedTimestamp = Date.parse(publishedAt);
  if (publishedTimestamp > generatedTimestamp + 5 * 60 * 1000) {
    throw new DatasetContractError('INVALID_ENVELOPE', 'publishedAt cannot be newer than generatedAt');
  }
  if (sourceUpdatedAt && Date.parse(sourceUpdatedAt) > publishedTimestamp + 5 * 60 * 1000) {
    throw new DatasetContractError('INVALID_ENVELOPE', 'sourceUpdatedAt cannot be newer than publishedAt');
  }
  if (envelope.freshness === 'unavailable' && sourceUpdatedAt !== null) {
    throw new DatasetContractError('INVALID_ENVELOPE', 'unavailable freshness requires null sourceUpdatedAt');
  }
  if (envelope.freshness !== 'unavailable' && sourceUpdatedAt === null) {
    throw new DatasetContractError('INVALID_ENVELOPE', 'available freshness requires sourceUpdatedAt');
  }

  let data: T;
  try {
    data = options.parseData(envelope.data);
  } catch (error) {
    if (error instanceof DatasetContractError) throw error;
    throw new DatasetContractError(
      'INVALID_DATA',
      error instanceof Error ? error.message : 'Dataset data is invalid',
    );
  }

  return {
    schemaVersion: DATASET_ENVELOPE_SCHEMA_VERSION,
    dataset: options.dataset,
    datasetVersion,
    mode: envelope.mode,
    generatedAt,
    sourceUpdatedAt,
    publishedAt,
    freshness: envelope.freshness as DatasetFreshness,
    partial: envelope.partial,
    quality: parseQuality(envelope.quality),
    data,
  };
}

export function datasetContractErrorMessage(error: unknown): string {
  if (error instanceof DatasetContractError && error.code === 'UNSUPPORTED_SCHEMA_VERSION') {
    return 'Формат данных обновился. Обновите страницу и попробуйте ещё раз.';
  }
  if (error instanceof DatasetContractError) {
    return 'Сервер вернул повреждённые данные. Мы сохранили страницу доступной — попробуйте обновить её позже.';
  }
  return error instanceof Error ? error.message : 'Не удалось проверить данные';
}

export function canonicalDatasetJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalDatasetJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalDatasetJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function deriveDatasetFreshness(
  sourceUpdatedAt: string | null,
  now: number,
  policy: { freshForMs: number; agingForMs: number },
): DatasetFreshness {
  if (!sourceUpdatedAt) return 'unavailable';
  const timestamp = Date.parse(sourceUpdatedAt);
  if (!Number.isFinite(timestamp)) return 'unavailable';
  const age = Math.max(0, now - timestamp);
  if (age <= policy.freshForMs) return 'fresh';
  if (age <= policy.agingForMs) return 'aging';
  return 'stale';
}
