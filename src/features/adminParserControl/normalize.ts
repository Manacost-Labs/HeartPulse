import type {
  ParserAuditEntry,
  ParserControlSnapshot,
  ParserHealth,
  ParserPublicationChannel,
  ParserPublicationMode,
  ParserRun,
  ParserRunResult,
  ParserRunStatus,
  ParserSchedule,
  ParserSection,
  ParserSource,
} from './types';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function optionalRecord(value: unknown): UnknownRecord | null {
  const result = record(value);
  return Object.keys(result).length ? result : null;
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

function textArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => textValue(item)).filter(Boolean);
  const single = textValue(value);
  return single ? [single] : [];
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

function nullableBoolValue(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function numberValue(value: unknown): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
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
    schedule: textValue(valueOf(source, 'schedule', 'scheduleLabel', 'schedule_label', 'cadence')),
    nextRunAt: dateValue(valueOf(source, 'nextRunAt', 'next_run_at')),
    itemCount: numberValue(valueOf(source, 'itemCount', 'item_count', 'rowsTotal', 'rows_total', 'rows', 'records')),
    lastError: textValue(valueOf(source, 'lastError', 'last_error', 'error')),
    sourceState: textValue(valueOf(source, 'sourceState', 'source_state', 'state')),
  };
}

export function normalizeParserWarnings(value: unknown): ParserControlSnapshot['warnings'] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === 'string') return { code: `WARNING_${index + 1}`, message: item.trim() };
    const warning = record(item);
    return {
      code: textValue(warning.code, `WARNING_${index + 1}`),
      message: textValue(valueOf(warning, 'message', 'error', 'detail')),
      requestId: textValue(valueOf(warning, 'requestId', 'request_id')) || undefined,
    };
  }).filter(warning => warning.message);
}

export function normalizeParserAudit(value: unknown): ParserAuditEntry[] {
  const root = record(value);
  const entries = Array.isArray(value) ? value : valueOf(root, 'entries', 'audit', 'items');
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, 100).map((item, index) => {
    const entry = record(item);
    const actor = record(entry.actor);
    const details = record(entry.details);
    const before = optionalRecord(valueOf(entry, 'before') ?? details.before);
    const after = optionalRecord(valueOf(entry, 'after') ?? details.after);
    return {
      id: textValue(valueOf(entry, 'id', 'auditId', 'audit_id'), `audit-${index + 1}`),
      actorId: textValue(valueOf(actor, 'id', 'userId', 'user_id') ?? valueOf(entry, 'actorId', 'actor_id')),
      actorName: textValue(valueOf(actor, 'name', 'label') ?? valueOf(entry, 'actorName', 'actor_name')),
      action: textValue(entry.action),
      entityId: textValue(valueOf(entry, 'entityId', 'entity_id')),
      revision: numberValue(valueOf(entry, 'revision') ?? details.revision ?? after?.revision ?? details.expectedRevision),
      requestId: textValue(valueOf(entry, 'requestId', 'request_id') ?? valueOf(details, 'requestId', 'request_id')),
      createdAt: dateValue(valueOf(entry, 'createdAt', 'created_at', 'timestamp', 'ts')),
      summary: textValue(valueOf(entry, 'summary') ?? details.summary),
      before,
      after,
      details,
    };
  });
}

function normalizeSchedule(value: unknown, fallbackId: string): ParserSchedule {
  const schedule = record(value);
  const id = textValue(valueOf(schedule, 'id', 'scheduleId', 'schedule_id', 'unit'), fallbackId);
  const enabledValue = valueOf(schedule, 'enabled');
  const legacyActiveValue = valueOf(schedule, 'isActive', 'is_active');
  const calendarEntries = textArray(valueOf(schedule, 'onCalendar', 'on_calendar'));
  const explicitTrigger = textValue(valueOf(
    schedule,
    'trigger',
    'schedule',
    'calendar',
    'cadence',
  ));
  return {
    id,
    label: textValue(valueOf(schedule, 'label', 'name', 'title'), id),
    description: textValue(valueOf(schedule, 'description', 'caption', 'notes')),
    enabled: enabledValue !== undefined
      ? nullableBoolValue(enabledValue)
      : legacyActiveValue == null ? null : boolValue(legacyActiveValue),
    trigger: explicitTrigger || (calendarEntries.length === 1 ? calendarEntries[0] ?? '' : ''),
    calendarEntries,
    systemdUnit: textValue(valueOf(schedule, 'systemdUnit', 'systemd_unit', 'unit')),
    timezone: textValue(valueOf(schedule, 'timezone', 'timeZone', 'time_zone'), 'UTC'),
    nextRunAt: dateValue(valueOf(schedule, 'nextRunAt', 'next_run_at', 'nextAt', 'next_at')),
    nominalNextRunAt: dateValue(valueOf(schedule, 'nominalNextRunAt', 'nominal_next_run_at')),
    nextRunAtSource: textValue(valueOf(schedule, 'nextRunAtSource', 'next_run_at_source')) === 'runtime'
      ? 'runtime'
      : textValue(valueOf(schedule, 'nextRunAtSource', 'next_run_at_source')) === 'nominal'
        ? 'nominal'
        : '',
    nominalActive: boolValue(legacyActiveValue),
    runtimeStateAvailable: boolValue(valueOf(schedule, 'runtimeStateAvailable', 'runtime_state_available')),
    active: nullableBoolValue(valueOf(schedule, 'active')),
    lastRunAt: dateValue(valueOf(schedule, 'lastRunAt', 'last_run_at')),
    failure: textValue(valueOf(schedule, 'failure')),
    loadState: textValue(valueOf(schedule, 'loadState', 'load_state')),
    activeState: textValue(valueOf(schedule, 'activeState', 'active_state')),
    subState: textValue(valueOf(schedule, 'subState', 'sub_state')),
    unitFileState: textValue(valueOf(schedule, 'unitFileState', 'unit_file_state')),
    result: textValue(valueOf(schedule, 'result')),
    serviceUnit: textValue(valueOf(schedule, 'serviceUnit', 'service_unit')),
    serviceActiveState: textValue(valueOf(schedule, 'serviceActiveState', 'service_active_state')),
    serviceResult: textValue(valueOf(schedule, 'serviceResult', 'service_result')),
    temporaryUntil: dateValue(valueOf(
      schedule,
      'temporaryUntil',
      'temporary_until',
      'expiresAt',
      'expires_at',
      'activeUntil',
      'active_until',
      'validUntil',
      'valid_until',
    )),
    sectionIds: stringArray(valueOf(schedule, 'sectionIds', 'section_ids', 'sections')),
    sourceIds: stringArray(valueOf(schedule, 'sourceIds', 'source_ids', 'sources')),
  };
}

function normalizeSchedules(root: UnknownRecord, sections: ParserSection[]): {
  schedules: ParserSchedule[];
  generatedAt: string | null;
} {
  const inventory = valueOf(root, 'scheduleInventory', 'schedule_inventory');
  const inventoryRecord = record(inventory);
  const explicit = inventory != null
    ? valueOf(inventoryRecord, 'schedules', 'items', 'entries') ?? inventory
    : valueOf(root, 'schedules', 'schedule');
  const schedules = objectEntries(explicit)
    .map(([scheduleId, schedule]) => normalizeSchedule(schedule, scheduleId))
    .filter(schedule => schedule.trigger || schedule.nextRunAt || schedule.sectionIds.length || schedule.sourceIds.length);
  if (schedules.length) {
    return {
      schedules,
      generatedAt: dateValue(valueOf(
        inventoryRecord,
        'generatedAt',
        'generated_at',
        'updatedAt',
        'updated_at',
      )),
    };
  }
  return {
    schedules: sections.flatMap(section => {
      if (section.schedule || section.nextRunAt) {
        return [{
          id: `section:${section.id}`,
          label: section.label,
          description: section.description,
          enabled: section.enabled,
          trigger: section.schedule,
          calendarEntries: [],
          systemdUnit: '',
          timezone: 'UTC',
          nextRunAt: section.nextRunAt,
          nominalNextRunAt: section.nextRunAt,
          nextRunAtSource: 'nominal' as const,
          nominalActive: true,
          runtimeStateAvailable: false,
          active: null,
          lastRunAt: null,
          failure: '',
          loadState: '',
          activeState: '',
          subState: '',
          unitFileState: '',
          result: '',
          serviceUnit: '',
          serviceActiveState: '',
          serviceResult: '',
          temporaryUntil: null,
          sectionIds: [section.id],
          sourceIds: section.sources.map(source => source.id),
        }];
      }
      return section.sources
        .filter(source => source.schedule || source.nextRunAt)
        .map(source => ({
          id: `source:${source.id}`,
          label: source.label,
          description: source.description,
          enabled: section.enabled && source.enabled,
          trigger: source.schedule,
          calendarEntries: [],
          systemdUnit: '',
          timezone: 'UTC',
          nextRunAt: source.nextRunAt,
          nominalNextRunAt: source.nextRunAt,
          nextRunAtSource: 'nominal' as const,
          nominalActive: true,
          runtimeStateAvailable: false,
          active: null,
          lastRunAt: null,
          failure: '',
          loadState: '',
          activeState: '',
          subState: '',
          unitFileState: '',
          result: '',
          serviceUnit: '',
          serviceActiveState: '',
          serviceResult: '',
          temporaryUntil: null,
          sectionIds: [section.id],
          sourceIds: [source.id],
        }));
    }),
    generatedAt: null,
  };
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
  const inventoryRecord = record(valueOf(root, 'scheduleInventory', 'schedule_inventory'));
  const runtimeRecord = record(valueOf(
    inventoryRecord,
    'runtimeTimerState',
    'runtime_timer_state',
  ));
  const scheduleInventory = normalizeSchedules(root, sections);
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
    schedules: scheduleInventory.schedules,
    schedulesGeneratedAt: scheduleInventory.generatedAt,
    scheduleInventoryVersion: textValue(valueOf(
      inventoryRecord,
      'inventoryVersion',
      'inventory_version',
      'version',
    )),
    scheduleTimeSemantics: textValue(valueOf(
      inventoryRecord,
      'timeSemantics',
      'time_semantics',
    )),
    scheduleRuntimeStateIncluded: boolValue(valueOf(
      inventoryRecord,
      'runtimeTimerStateIncluded',
      'runtime_timer_state_included',
    )),
    scheduleRuntimeState: {
      provider: textValue(runtimeRecord.provider),
      checkedAt: dateValue(valueOf(runtimeRecord, 'checkedAt', 'checked_at')),
      available: boolValue(runtimeRecord.available),
      status: ['ok', 'partial', 'unavailable'].includes(textValue(runtimeRecord.status))
        ? textValue(runtimeRecord.status) as 'ok' | 'partial' | 'unavailable'
        : '',
      reason: textValue(runtimeRecord.reason),
    },
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
    warnings: normalizeParserWarnings(root.warnings),
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

function normalizeRunResult(value: unknown, index: number): ParserRunResult {
  const result = record(value);
  const sourceId = textValue(valueOf(result, 'sourceId', 'source_id'), `source-${index + 1}`);
  const servingCachedDataset = boolValue(valueOf(
    result,
    'servingCachedDataset',
    'serving_cached_dataset',
  ));
  const rawState = textValue(valueOf(result, 'state', 'status', 'result'));
  const explicitHealth = normalizedHealth(rawState);
  const message = textValue(valueOf(result, 'error', 'message', 'detail', 'lastError', 'last_error'));
  const errors = textArray(valueOf(result, 'errors')).filter(error => error !== message);
  const errorsTotal = Math.max(
    errors.length,
    numberValue(valueOf(result, 'errorsTotal', 'errors_total')) ?? 0,
  );
  return {
    sourceId,
    label: textValue(valueOf(result, 'label', 'sourceLabel', 'source_label'), sourceId),
    status: servingCachedDataset ? 'warning' : explicitHealth,
    state: rawState,
    servingCachedDataset,
    rowsTotal: numberValue(valueOf(result, 'rowsTotal', 'rows_total', 'rows', 'records')),
    fetchedAt: dateValue(valueOf(result, 'fetchedAt', 'fetched_at', 'finishedAt', 'finished_at')),
    durationMs: numberValue(valueOf(result, 'durationMs', 'duration_ms', 'elapsedMs', 'elapsed_ms')),
    message,
    errors,
    errorsTotal,
    errorsTruncated: boolValue(valueOf(result, 'errorsTruncated', 'errors_truncated'))
      || errorsTotal > errors.length,
  };
}

function normalizeRun(value: unknown, index: number): ParserRun {
  const run = record(value);
  const sourceIds = stringArray(valueOf(run, 'sourceIds', 'source_ids'));
  const results = Array.isArray(run.results) ? run.results.map(record) : [];
  const normalizedResults = results.map(normalizeRunResult);
  const requestedSourceIds = stringArray(valueOf(run, 'requestedSourceIds', 'requested_source_ids'));
  const deduplicatedSourceIds = stringArray(valueOf(run, 'deduplicatedSourceIds', 'deduplicated_source_ids'));
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
    requestedSourceIds: requestedSourceIds.length ? requestedSourceIds : sourceIds,
    deduplicatedSourceIds,
    deduplicated: boolValue(run.deduplicated) || deduplicatedSourceIds.length > 0,
    results: normalizedResults,
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
