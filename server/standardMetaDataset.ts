import { createHash } from 'node:crypto';
import {
  DATASET_ENVELOPE_SCHEMA_VERSION,
  DatasetContractError,
  canonicalDatasetJson,
  deriveDatasetFreshness,
  parseDatasetEnvelope,
  type DatasetMode,
} from '../shared/datasetEnvelope.js';
import {
  STANDARD_META_DATASET,
  assessStandardMetaData,
  parseStandardMetaData,
  type StandardMetaEnvelope,
} from '../shared/standardMetaContract.js';

// HSGuru is scheduled every six hours. A small grace period prevents a normal
// timer run from looking old; three missed runs make the response stale.
export const STANDARD_META_FRESHNESS_POLICY = {
  freshForMs: 7 * 60 * 60 * 1000,
  agingForMs: 19 * 60 * 60 * 1000,
} as const;

type PublishedStandardMetaCandidate = Record<string, unknown> & {
  publicationMode?: unknown;
  publishedAt?: unknown;
};

export type StandardMetaPublication = { mode: DatasetMode; publishedAt: string };

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function aliasedValue(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  }
  return undefined;
}

function publicationControlSources(value: unknown): Array<{ id: string; source: Record<string, unknown> }> {
  const control = objectRecord(value);
  const rawSections = control?.sections;
  const sections = Array.isArray(rawSections)
    ? rawSections.map(section => ['', section] as const)
    : Object.entries(objectRecord(rawSections) ?? {});
  const sources: Array<{ id: string; source: Record<string, unknown> }> = [];
  for (const [, rawSection] of sections) {
    const section = objectRecord(rawSection);
    const rawSources = section?.sources;
    const entries = Array.isArray(rawSources)
      ? rawSources.map(source => ['', source] as const)
      : Object.entries(objectRecord(rawSources) ?? {});
    for (const [fallbackId, rawSource] of entries) {
      const source = objectRecord(rawSource);
      if (!source) continue;
      const rawId = aliasedValue(source, 'id', 'sourceId', 'source_id');
      const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : fallbackId;
      if (id) sources.push({ id, source });
    }
  }
  return sources;
}

function upstreamPayloadIsProvisional(payload: Record<string, unknown>): boolean {
  const data = objectRecord(payload.data);
  return ['structured', 'hsreplay_extracted'].some(key => objectRecord(data?.[key])?.provisional === true);
}

function readLegacyStandardMetaPublication(
  payload: Record<string, unknown>,
  expectedSourceId: string,
  sourceUpdatedAt: string,
  controlValue: unknown,
): StandardMetaPublication {
  const payloadData = objectRecord(payload.data);
  if (payloadData?.source_id !== expectedSourceId) {
    throw new DatasetContractError(
      'INVALID_DATA',
      'standard-meta: legacy payload source identity does not match the requested dataset',
    );
  }
  const matching = publicationControlSources(controlValue).filter(row => row.id === expectedSourceId);
  if (matching.length !== 1) {
    throw new DatasetContractError(
      'INVALID_DATA',
      `standard-meta: parser-control must expose exactly one publication row for ${expectedSourceId}`,
    );
  }
  const source = matching[0].source;
  const publishedFetchedAt = aliasedValue(source, 'publishedFetchedAt', 'published_fetched_at');
  if (typeof publishedFetchedAt !== 'string'
    || !Number.isFinite(Date.parse(publishedFetchedAt))
    || Date.parse(publishedFetchedAt) !== Date.parse(sourceUpdatedAt)) {
    throw new DatasetContractError(
      'INVALID_DATA',
      'standard-meta: parser-control publication timestamp does not match the selected snapshot',
    );
  }
  const channelValue = aliasedValue(source, 'publicationChannel', 'publication_channel');
  const channel = typeof channelValue === 'string' ? channelValue.trim().toLowerCase() : '';
  const provisional = upstreamPayloadIsProvisional(payload);
  if ((channel === 'stable' || channel === 'stable_baseline') && !provisional) {
    return { mode: 'stable', publishedAt: sourceUpdatedAt };
  }
  const supportsEarly = aliasedValue(source, 'supportsEarly', 'supports_early') === true;
  if (channel === 'early' && supportsEarly && provisional) {
    return { mode: 'early', publishedAt: sourceUpdatedAt };
  }
  throw new DatasetContractError(
    'INVALID_DATA',
    `standard-meta: parser-control publication channel ${channel || 'unknown'} is incompatible with the selected snapshot`,
  );
}

export function readStandardMetaPublication(
  value: unknown,
  expectedSourceId: string,
  legacyControl?: unknown,
): StandardMetaPublication {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatasetContractError('INVALID_DATA', 'standard-meta: upstream payload must be an object');
  }
  const payload = value as Record<string, unknown>;
  const sourceUpdatedAt = typeof payload.fetched_at === 'string' ? payload.fetched_at : '';
  if (!Number.isFinite(Date.parse(sourceUpdatedAt))) {
    throw new DatasetContractError('INVALID_DATA', 'standard-meta: upstream source timestamp is invalid');
  }
  const hasPublication = Object.prototype.hasOwnProperty.call(payload, 'publication');
  const publication = payload.publication;
  if (!hasPublication) {
    // N-1 API compatibility during a staggered rollout. The private control
    // snapshot describes the exact publication selected by the legacy endpoint.
    // It is accepted only with an exact source/timestamp/channel match; guessing
    // from the global mode would misclassify sources that do not support early.
    return readLegacyStandardMetaPublication(payload, expectedSourceId, sourceUpdatedAt, legacyControl);
  }
  if (!publication || typeof publication !== 'object' || Array.isArray(publication)) {
    throw new DatasetContractError('INVALID_DATA', 'standard-meta: upstream publication provenance is malformed');
  }
  const metadata = publication as Record<string, unknown>;
  if (metadata.schema_version !== 1 || metadata.source_id !== expectedSourceId) {
    throw new DatasetContractError('INVALID_DATA', 'standard-meta: upstream publication provenance does not match the source');
  }
  if (metadata.mode !== 'stable' && metadata.mode !== 'early') {
    throw new DatasetContractError('INVALID_DATA', 'standard-meta: upstream publication mode is invalid');
  }
  const publishedAt = typeof metadata.published_at === 'string' ? metadata.published_at : '';
  if (!Number.isFinite(Date.parse(publishedAt))
    || Date.parse(publishedAt) !== Date.parse(sourceUpdatedAt)) {
    throw new DatasetContractError('INVALID_DATA', 'standard-meta: publication timestamp does not match the selected snapshot');
  }
  return { mode: metadata.mode, publishedAt };
}

export async function resolveStandardMetaPublication(
  value: unknown,
  expectedSourceId: string,
  loadLegacyControl: () => Promise<unknown>,
): Promise<StandardMetaPublication> {
  const payload = objectRecord(value);
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'publication')) {
    return readStandardMetaPublication(value, expectedSourceId);
  }
  const control = await loadLegacyControl();
  return readStandardMetaPublication(value, expectedSourceId, control);
}

function readPublicationMode(candidate: PublishedStandardMetaCandidate): DatasetMode {
  if (candidate.publicationMode === 'stable' || candidate.publicationMode === 'early') {
    return candidate.publicationMode;
  }
  throw new DatasetContractError(
    'INVALID_DATA',
    'standard-meta: published candidate has no authoritative publicationMode',
  );
}

function readPublishedAt(candidate: PublishedStandardMetaCandidate, sourceUpdatedAt: string): string {
  const publishedAt = typeof candidate.publishedAt === 'string' ? candidate.publishedAt : '';
  if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) {
    throw new DatasetContractError('INVALID_DATA', 'standard-meta: published candidate has no valid publishedAt');
  }
  if (Date.parse(publishedAt) + 5 * 60 * 1000 < Date.parse(sourceUpdatedAt)) {
    throw new DatasetContractError('INVALID_DATA', 'standard-meta: publishedAt is older than sourceUpdatedAt');
  }
  return publishedAt;
}

export function createStandardMetaEnvelope(value: unknown, now = Date.now()): StandardMetaEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatasetContractError('INVALID_DATA', 'standard-meta: candidate must be an object');
  }
  const candidate = value as PublishedStandardMetaCandidate;
  const mode = readPublicationMode(candidate);
  const data = parseStandardMetaData(candidate);
  if (!data.updatedAt) {
    throw new DatasetContractError('INVALID_DATA', 'standard-meta: source timestamp is required');
  }
  const publishedAt = readPublishedAt(candidate, data.updatedAt);
  const assessment = assessStandardMetaData(data, mode);
  const datasetVersion = `sm1-${createHash('sha256')
    .update(canonicalDatasetJson({ mode, data }))
    .digest('hex')
    .slice(0, 20)}`;
  const envelope = {
    schemaVersion: DATASET_ENVELOPE_SCHEMA_VERSION,
    dataset: STANDARD_META_DATASET,
    datasetVersion,
    mode,
    generatedAt: new Date(now).toISOString(),
    sourceUpdatedAt: data.updatedAt,
    publishedAt,
    freshness: deriveDatasetFreshness(data.updatedAt, now, STANDARD_META_FRESHNESS_POLICY),
    partial: assessment.partial,
    quality: assessment.quality,
    data,
  };
  // The server validates its own outbound document. This intentionally rejects
  // a candidate before content negotiation can expose either v1 or legacy data.
  return parseDatasetEnvelope(envelope, {
    dataset: STANDARD_META_DATASET,
    parseData: parseStandardMetaData,
    now,
  });
}

export function assertStandardMetaContinuity(
  candidate: StandardMetaEnvelope,
  previous: StandardMetaEnvelope | null,
): void {
  if (!previous) return;
  const candidateTimestamp = Date.parse(candidate.sourceUpdatedAt ?? '');
  const previousTimestamp = Date.parse(previous.sourceUpdatedAt ?? '');
  if (Number.isFinite(previousTimestamp) && candidateTimestamp < previousTimestamp) {
    throw new DatasetContractError('INVALID_DATA', 'standard-meta: candidate is older than the last known good version');
  }
  if (candidate.mode === 'stable' && previous.mode === 'stable') {
    const minimumSize = Math.ceil(previous.data.items.length * 0.5);
    if (candidate.data.items.length < minimumSize) {
      throw new DatasetContractError(
        'INVALID_DATA',
        `standard-meta: stable collection shrank unexpectedly (${previous.data.items.length} -> ${candidate.data.items.length})`,
      );
    }
  }
}

export function selectStandardMetaCandidate(
  candidateValue: unknown,
  previousValue: unknown | null,
  now = Date.now(),
): {
  data: unknown;
  envelope: StandardMetaEnvelope;
  rejectedError: unknown | null;
} {
  const previous = previousValue === null ? null : createStandardMetaEnvelope(previousValue, now);
  try {
    const candidate = createStandardMetaEnvelope(candidateValue, now);
    assertStandardMetaContinuity(candidate, previous);
    return { data: candidateValue, envelope: candidate, rejectedError: null };
  } catch (error) {
    if (!previous || previousValue === null) throw error;
    return { data: previousValue, envelope: previous, rejectedError: error };
  }
}
