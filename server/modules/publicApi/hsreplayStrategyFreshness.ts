const MAX_TIMESTAMP_LENGTH = 64;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const FRESH_FOR_MS = 48 * 60 * 60 * 1000;

export type HsReplayStrategyFreshnessStatus = 'fresh' | 'stale' | 'unknown';

export type HsReplayStrategyUpstreamFreshness = {
  status: HsReplayStrategyFreshnessStatus;
  observedAt: string | null;
  ageSeconds: number | null;
  bodyAsOf: string | null;
};

export type HsReplayStrategyPublication = {
  mode: string | null;
  channel: string | null;
  publishedAt: string | null;
  stale?: boolean;
};

export type HsReplayStrategyMetadata = {
  publication: HsReplayStrategyPublication | null;
  upstreamFreshness: HsReplayStrategyUpstreamFreshness | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedText(value: unknown, maximum: number): string | null {
  const normalized = text(value);
  return normalized ? normalized.slice(0, maximum) : null;
}

function metadataTimestamp(value: unknown): string | null {
  return boundedText(value, MAX_TIMESTAMP_LENGTH);
}

function number(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown, maximum: number): number | null {
  const parsed = number(value);
  return parsed !== null && parsed >= 0 && parsed <= maximum ? parsed : null;
}

function normalizePublication(value: unknown): HsReplayStrategyPublication | null {
  const source = record(value);
  const mode = boundedText(source.mode, 32)?.toLocaleLowerCase('en-US') ?? null;
  const channel = boundedText(source.channel, 32)?.toLocaleLowerCase('en-US') ?? null;
  const publishedAt = metadataTimestamp(source.published_at ?? source.publishedAt);
  const storageChannel = boundedText(source.storage_channel, 32)?.toLocaleLowerCase('en-US');
  const stale = source.stale === true || storageChannel === 'published_lkg'
    ? true
    : source.stale === false
      ? false
      : undefined;
  if (!mode && !channel && !publishedAt && stale === undefined) return null;
  return {
    mode,
    channel,
    publishedAt,
    ...(stale === undefined ? {} : { stale }),
  };
}

function normalizeUpstreamFreshness(value: unknown): HsReplayStrategyUpstreamFreshness | null {
  if (value === null || value === undefined) return null;
  const source = record(value);
  const rawStatus = boundedText(source.status, 16)?.toLocaleLowerCase('en-US');
  const requestedStatus: HsReplayStrategyFreshnessStatus = rawStatus === 'fresh'
    || rawStatus === 'stale'
    ? rawStatus
    : 'unknown';
  const observedAt = metadataTimestamp(source.observed_at ?? source.observedAt);
  const ageSeconds = nonNegativeNumber(source.age_seconds ?? source.ageSeconds, 365 * 24 * 60 * 60);
  const bodyAsOf = metadataTimestamp(source.body_as_of ?? source.bodyAsOf);
  // A claimed fresh state without complete evidence is unknown and therefore stale.
  const status = requestedStatus === 'fresh' && (!observedAt || ageSeconds === null || !bodyAsOf)
    ? 'unknown'
    : requestedStatus;
  if (Object.keys(source).length === 0) return { status: 'unknown', observedAt, ageSeconds, bodyAsOf };
  return { status, observedAt, ageSeconds, bodyAsOf };
}

/** Extracts bounded publication/freshness evidence shared by UI and v1 API. */
export function normalizeHsReplayStrategyMetadata(value: unknown): HsReplayStrategyMetadata | null {
  const root = record(value);
  const data = record(root.data);
  const structured = record(data.structured ?? root.structured);
  const publication = normalizePublication(root.publication ?? data.publication);
  const upstreamFreshness = normalizeUpstreamFreshness(
    root.upstreamFreshness
      ?? root.upstream_freshness
      ?? data.upstreamFreshness
      ?? data.upstream_freshness
      ?? structured.upstreamFreshness
      ?? structured.upstream_freshness,
  );
  if (!publication && !upstreamFreshness) return null;
  return { publication, upstreamFreshness };
}

/** Applies the public freshness policy to an HSReplay strategy snapshot. */
export function hsReplayStrategyDataStatus(
  updatedAt: string | null,
  metadata: HsReplayStrategyMetadata | null = null,
  now = Date.now(),
): 'fresh' | 'stale' {
  const freshness = metadata?.upstreamFreshness;
  if (freshness && freshness.status !== 'fresh') return 'stale';
  if (freshness) {
    if (!freshness.observedAt || freshness.ageSeconds === null || !freshness.bodyAsOf) return 'stale';
    if (freshness.ageSeconds > FRESH_FOR_MS / 1000) return 'stale';
    const evidenceLimit = now + MAX_CLOCK_SKEW_MS;
    const observedAt = Date.parse(freshness.observedAt);
    const bodyAsOf = Date.parse(freshness.bodyAsOf);
    if (!Number.isFinite(observedAt) || !Number.isFinite(bodyAsOf)
      || observedAt > evidenceLimit || bodyAsOf > evidenceLimit) return 'stale';
  }
  const publication = metadata?.publication;
  if (publication?.stale === true
    || (publication?.mode && publication.mode !== 'stable')
    || (publication?.channel && publication.channel !== 'stable')) return 'stale';
  const timestamp = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  const age = now - timestamp;
  return Number.isFinite(age) && age >= -MAX_CLOCK_SKEW_MS && age <= FRESH_FOR_MS
    ? 'fresh'
    : 'stale';
}
