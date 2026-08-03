import type { ParserControlSnapshot, ParserSource } from './types';

export type ParserMonitoringState = 'healthy' | 'degraded' | 'critical' | 'unknown';
export type ParserMonitoringSourceState = 'healthy' | 'degraded' | 'failed' | 'running' | 'paused';

export type ParserMonitoringSource = {
  id: string;
  label: string;
  sectionLabel: string;
  state: ParserMonitoringSourceState;
  sourceState: string;
  fallback: boolean;
  lastSuccessAt: string | null;
  publishedFetchedAt: string | null;
  ageMs: number | null;
  itemCount: number | null;
  lastError: string;
};

export type ParserMonitoringSnapshot = {
  state: ParserMonitoringState;
  generatedAt: string | null;
  totalSources: number;
  healthySources: number;
  degradedSources: number;
  failedSources: number;
  runningSources: number;
  pausedSources: number;
  fallbackSources: number;
  lastSuccessfulAt: string | null;
  attentionSources: ParserMonitoringSource[];
};

const FAILED_STATE_PATTERN = /(?:hard[_-]?fail|fatal|unavailable|invalid|publish[_-]?fail)/i;
const DEGRADED_STATE_PATTERN = /(?:partial|stale|cached|fallback|degraded|warning|fetch[_-]?error)/i;
const SECRET_PATTERN = /\b(?:bearer\s+|api[_-]?key\s*[=:]\s*|token\s*[=:]\s*)[^\s,;]+/gi;
const MAX_ERROR_LENGTH = 280;

function safeTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeAge(value: string | null, now: number): number | null {
  const timestamp = safeTimestamp(value);
  return timestamp == null ? null : Math.max(0, now - timestamp);
}

function safeError(value: string): string {
  const normalized = value
    .replace(SECRET_PATTERN, '[секрет скрыт]')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= MAX_ERROR_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_ERROR_LENGTH - 1).trimEnd()}…`;
}

function monitoringState(source: ParserSource, enabled: boolean): ParserMonitoringSourceState {
  if (!enabled || !source.enabled || source.status === 'paused') return 'paused';
  if (source.status === 'error' || FAILED_STATE_PATTERN.test(source.sourceState)) return 'failed';
  if (source.status === 'running') return 'running';
  if (
    source.status === 'warning'
    || source.status === 'unknown'
    || source.publicationChannel === 'stable_baseline'
    || DEGRADED_STATE_PATTERN.test(source.sourceState)
  ) return 'degraded';
  return 'healthy';
}

function latestIso(values: Array<string | null>): string | null {
  return values
    .filter((value): value is string => safeTimestamp(value) != null)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

/**
 * Converts the parser-control contract into a small, stable read model for the
 * admin monitoring card. Keeping this derivation pure makes health semantics
 * testable and prevents rendering code from interpreting raw upstream states.
 */
export function buildParserMonitoringSnapshot(
  snapshot: ParserControlSnapshot,
  now = Date.now(),
): ParserMonitoringSnapshot {
  const sources = snapshot.sections.flatMap(section => section.sources.map(source => {
    const lastSuccessAt = source.lastSuccessAt ?? source.publishedFetchedAt;
    return {
      id: source.id,
      label: source.label,
      sectionLabel: section.label,
      state: monitoringState(source, section.enabled),
      sourceState: source.sourceState,
      fallback: source.publicationChannel === 'stable_baseline',
      lastSuccessAt,
      publishedFetchedAt: source.publishedFetchedAt,
      ageMs: safeAge(lastSuccessAt, now),
      itemCount: source.itemCount,
      lastError: safeError(source.lastError),
    } satisfies ParserMonitoringSource;
  }));

  const failedSources = sources.filter(source => source.state === 'failed').length;
  const degradedSources = sources.filter(source => source.state === 'degraded').length;
  const healthySources = sources.filter(source => source.state === 'healthy').length;
  const runningSources = sources.filter(source => source.state === 'running').length;
  const pausedSources = sources.filter(source => source.state === 'paused').length;
  const fallbackSources = sources.filter(source => source.fallback && source.state !== 'paused').length;
  const state: ParserMonitoringState = failedSources > 0
    ? 'critical'
    : degradedSources > 0 || fallbackSources > 0
      ? 'degraded'
      : sources.length > pausedSources
        ? 'healthy'
        : 'unknown';

  return {
    state,
    generatedAt: snapshot.generatedAt,
    totalSources: sources.length,
    healthySources,
    degradedSources,
    failedSources,
    runningSources,
    pausedSources,
    fallbackSources,
    lastSuccessfulAt: latestIso(sources.map(source => source.lastSuccessAt)),
    attentionSources: sources
      .filter(source => source.state === 'failed' || source.state === 'degraded')
      .sort((left, right) => {
        if (left.state !== right.state) return left.state === 'failed' ? -1 : 1;
        return (right.ageMs ?? -1) - (left.ageMs ?? -1);
      }),
  };
}

export function formatMonitoringAge(milliseconds: number | null): string {
  if (milliseconds == null) return 'возраст неизвестен';
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return 'меньше минуты назад';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} дн назад`;
}
