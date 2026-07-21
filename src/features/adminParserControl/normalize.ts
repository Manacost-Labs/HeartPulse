import type {
  ParserControlSnapshot,
  ParserHealth,
  ParserPublicationChannel,
  ParserPublicationMode,
  ParserRun,
  ParserRunStatus,
  ParserSection,
  ParserSource,
} from './types';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function valueOf(source: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

function textValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function dateValue(value: unknown): string | null {
  const raw = textValue(value);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
}

function boolValue(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizedHealth(value: unknown): ParserHealth {
  const status = textValue(value).toLowerCase();
  if (['ok', 'ready', 'success', 'succeeded', 'healthy'].includes(status)) return 'healthy';
  if (['warning', 'partial', 'stale', 'degraded', 'cached_after_failure'].includes(status)) return 'warning';
  if (
    ['error', 'failed', 'unhealthy', 'blocked_by_protection', 'proxy_required'].includes(status)
    || status.endsWith('_error')
  ) return 'error';
  if (['running', 'active', 'in_progress'].includes(status)) return 'running';
  if (['paused', 'disabled'].includes(status)) return 'paused';
  if (['never_fetched', 'never_run', 'missing', 'not_found'].includes(status)) return 'unknown';
  return 'unknown';
}

function normalizedMode(value: unknown): ParserPublicationMode {
  return textValue(value).toLowerCase() === 'early' ? 'early' : 'stable';
}

function normalizedPublicationChannel(value: unknown): ParserPublicationChannel {
  const channel = textValue(value).toLowerCase();
  if (['early', 'stable', 'stable_baseline', 'unavailable'].includes(channel)) {
    return channel as ParserPublicationChannel;
  }
  return 'unavailable';
}

function objectEntries(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const source = record(item);
      return [textValue(valueOf(source, 'id', 'sectionId', 'section_id'), `section-${index + 1}`), item];
    });
  }
  return Object.entries(record(value));
}

function normalizeSource(value: unknown, fallbackId: string): ParserSource {
  const source = record(value);
  const id = textValue(valueOf(source, 'id', 'sourceId', 'source_id'), fallbackId);
  return {
    id,
    label: textValue(valueOf(source, 'label', 'name', 'title'), id),
    description: textValue(valueOf(source, 'description', 'caption')),
    enabled: boolValue(valueOf(source, 'enabled', 'autoUpdate', 'auto_update'), true),
    supportsEarly: boolValue(valueOf(source, 'supportsEarly', 'supports_early')),
    canRunManually: boolValue(valueOf(source, 'canRunManually', 'can_run_manually'), true),
    status: normalizedHealth(valueOf(source, 'health', 'status', 'state')),
    lastSuccessAt: dateValue(valueOf(source, 'lastSuccessAt', 'last_success_at', 'datasetFetchedAt', 'dataset_fetched_at')),
    lastAttemptAt: dateValue(valueOf(source, 'lastAttemptAt', 'last_attempt_at', 'updatedAt', 'updated_at')),
    candidateFetchedAt: dateValue(valueOf(source, 'candidateFetchedAt', 'candidate_fetched_at')),
    publishedFetchedAt: dateValue(valueOf(source, 'publishedFetchedAt', 'published_fetched_at')),
    publicationChannel: normalizedPublicationChannel(valueOf(source, 'publicationChannel', 'publication_channel')),
    stableBaselineAvailable: boolValue(valueOf(source, 'stableBaselineAvailable', 'stable_baseline_available')),
    nextRunAt: dateValue(valueOf(source, 'nextRunAt', 'next_run_at')),
    itemCount: numberValue(valueOf(source, 'itemCount', 'item_count', 'rowsTotal', 'rows_total', 'rows', 'records')),
    lastError: textValue(valueOf(source, 'lastError', 'last_error', 'error')),
    sourceState: textValue(valueOf(source, 'sourceState', 'source_state', 'state')),
  };
}

function normalizeWarnings(value: unknown): ParserControlSnapshot['warnings'] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === 'string') return { code: `WARNING_${index + 1}`, message: item.trim() };
    const warning = record(item);
    return {
      code: textValue(warning.code, `WARNING_${index + 1}`),
      message: textValue(valueOf(warning, 'message', 'error', 'detail')),
    };
  }).filter(warning => warning.message);
}

function normalizeSection(value: unknown, fallbackId: string): ParserSection {
  const section = record(value);
  const id = textValue(valueOf(section, 'id', 'sectionId', 'section_id'), fallbackId);
  const sources = objectEntries(valueOf(section, 'sources', 'parsers'))
    .map(([sourceId, source]) => normalizeSource(source, sourceId));
  const explicitStatus = normalizedHealth(valueOf(section, 'status', 'health', 'state'));
  const sourceStatus = sources.some(source => source.status === 'error')
    ? 'error'
    : sources.some(source => source.status === 'running')
      ? 'running'
      : sources.some(source => source.status === 'warning')
        ? 'warning'
        : sources.length && sources.every(source => source.status === 'healthy')
          ? 'healthy'
          : 'unknown';
  return {
    id,
    group: textValue(valueOf(section, 'group', 'groupId', 'group_id'), 'other'),
    label: textValue(valueOf(section, 'label', 'name', 'title'), id),
    description: textValue(valueOf(section, 'description', 'caption')),
    enabled: boolValue(valueOf(section, 'enabled', 'autoUpdate', 'auto_update'), true),
    status: explicitStatus === 'unknown' ? sourceStatus : explicitStatus,
    lastSuccessAt: dateValue(valueOf(section, 'lastSuccessAt', 'last_success_at'))
      ?? sources.map(source => source.lastSuccessAt).filter(Boolean).sort().at(-1)
      ?? null,
    nextRunAt: dateValue(valueOf(section, 'nextRunAt', 'next_run_at')),
    schedule: textValue(valueOf(section, 'schedule', 'scheduleLabel', 'schedule_label')),
    sources,
  };
}

export function normalizeParserControl(value: unknown): ParserControlSnapshot {
  const root = record(value);
  const policy = record(valueOf(root, 'policy', 'publicationPolicy', 'publication_policy'));
  const sections = objectEntries(valueOf(root, 'sections', 'groups'))
    .map(([sectionId, section]) => normalizeSection(section, sectionId));
  const sources = sections.flatMap(section => section.sources);
  const upstreamSummary = record(root.summary);
  return {
    revision: numberValue(root.revision) ?? 0,
    generatedAt: dateValue(valueOf(root, 'generatedAt', 'generated_at', 'updatedAt', 'updated_at')),
    policy: {
      mode: normalizedMode(policy.mode),
      effectiveMode: normalizedMode(valueOf(policy, 'effectiveMode', 'effective_mode', 'mode')),
      earlyUntil: dateValue(valueOf(policy, 'earlyUntil', 'early_until', 'expiresAt', 'expires_at')),
      reason: textValue(policy.reason),
      updatedAt: dateValue(valueOf(policy, 'updatedAt', 'updated_at')),
      updatedBy: textValue(valueOf(policy, 'updatedBy', 'updated_by')),
      managedBy: textValue(valueOf(policy, 'managedBy', 'managed_by')),
    },
    sections,
    summary: {
      totalSources: numberValue(valueOf(upstreamSummary, 'totalSources', 'total_sources')) ?? sources.length,
      enabledSections: numberValue(valueOf(upstreamSummary, 'enabledSections', 'enabled_sections'))
        ?? sections.filter(section => section.enabled).length,
      earlyCapableSources: numberValue(valueOf(upstreamSummary, 'earlyCapableSources', 'early_capable_sources'))
        ?? sources.filter(source => source.supportsEarly).length,
      activeRuns: numberValue(valueOf(upstreamSummary, 'activeRuns', 'active_runs')) ?? 0,
      failedSources: numberValue(valueOf(upstreamSummary, 'failedSources', 'failed_sources'))
        ?? sources.filter(source => source.status === 'error').length,
    },
    warnings: normalizeWarnings(root.warnings),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => textValue(item)).filter(Boolean) : [];
}

function normalizedRunStatus(value: unknown): ParserRunStatus {
  const status = textValue(value).toLowerCase();
  if (['in_progress', 'active', 'running'].includes(status)) return 'running';
  if (['success', 'complete', 'completed', 'succeeded'].includes(status)) return 'succeeded';
  if (['partial', 'partial_failure'].includes(status)) return 'partial';
  if (['error', 'failed'].includes(status)) return 'failed';
  if (['cancelled', 'canceled'].includes(status)) return 'cancelled';
  return 'queued';
}

function normalizeRun(value: unknown, index: number): ParserRun {
  const run = record(value);
  const sourceIds = stringArray(valueOf(run, 'sourceIds', 'source_ids'));
  const results = Array.isArray(run.results) ? run.results.map(record) : [];
  const resultFailed = (result: UnknownRecord) => {
    const state = textValue(valueOf(result, 'state', 'status', 'result')).toLowerCase();
    const servingCached = boolValue(valueOf(result, 'servingCachedDataset', 'serving_cached_dataset'));
    return servingCached || !['ok', 'success', 'succeeded', 'healthy'].includes(state);
  };
  return {
    id: textValue(valueOf(run, 'id', 'runId', 'run_id'), `run-${index + 1}`),
    status: normalizedRunStatus(run.status),
    requestedAt: dateValue(valueOf(run, 'requestedAt', 'requested_at', 'createdAt', 'created_at')),
    startedAt: dateValue(valueOf(run, 'startedAt', 'started_at')),
    finishedAt: dateValue(valueOf(run, 'finishedAt', 'finished_at', 'completedAt', 'completed_at')),
    requestedBy: textValue(valueOf(run, 'requestedBy', 'requested_by')),
    reason: textValue(run.reason),
    sectionIds: stringArray(valueOf(run, 'sectionIds', 'section_ids')),
    sourceIds,
    totalSources: numberValue(valueOf(run, 'totalSources', 'total_sources')) ?? sourceIds.length,
    completedSources: numberValue(valueOf(run, 'completedSources', 'completed_sources')) ?? results.length,
    failedSources: numberValue(valueOf(run, 'failedSources', 'failed_sources')) ?? results.filter(resultFailed).length,
    error: textValue(valueOf(run, 'error', 'lastError', 'last_error')),
  };
}

export function normalizeParserRuns(value: unknown): ParserRun[] {
  const root = record(value);
  const rawRuns = Array.isArray(value) ? value : valueOf(root, 'runs', 'jobs');
  const runs = Array.isArray(rawRuns) ? [...rawRuns] : [];
  const activeRun = valueOf(root, 'activeRun', 'active_run');
  if (activeRun && !runs.some(item => {
    const run = record(item);
    return textValue(valueOf(run, 'id', 'runId', 'run_id')) === textValue(valueOf(record(activeRun), 'id', 'runId', 'run_id'));
  })) runs.unshift(activeRun);
  return runs.map(normalizeRun);
}
