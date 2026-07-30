import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomically } from './durableJson.js';

const STATE_FILENAME = 'arena-draft-refresh-state-v1.json';
const STATE_SCHEMA_VERSION = 1;
const MAX_RUNS = 24;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{0,79}$/;
const SAFE_FAILURE_CODES = new Set([
  'ARENA_SYNERGY_HEALTHY_DATA_REQUIRED',
  'ARENA_SYNERGY_REFRESH_BATCH_REJECTED',
  'ARENA_DRAFT_SOURCE_UNAVAILABLE',
  'ARENA_DRAFT_PUBLICATION_FAILED',
]);

export type ArenaDraftRefreshTrigger = 'manual' | 'scheduled' | 'startup';
export type ArenaDraftRefreshRunStatus = 'running' | 'succeeded' | 'failed';

export type ArenaDraftRefreshPublication = {
  cohortId: string;
  patchVersion: string | null;
  sourceRows: number;
  qualityScore: number;
  publishedClasses: string[];
};

export type ArenaDraftRefreshRun = {
  id: string;
  trigger: ArenaDraftRefreshTrigger;
  status: ArenaDraftRefreshRunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  cohortId: string | null;
  patchVersion: string | null;
  sourceRows: number | null;
  qualityScore: number | null;
  publishedClasses: string[];
  errorCode: string | null;
};

export type ArenaDraftRefreshStatus = {
  schemaVersion: 1;
  updatedAt: string;
  schedule: string;
  isRunning: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  runs: ArenaDraftRefreshRun[];
};

type PersistedRefreshState = Omit<ArenaDraftRefreshStatus, 'isRunning'>;

export type ArenaDraftRefreshMetric = {
  status: Exclude<ArenaDraftRefreshRunStatus, 'running'>;
  trigger: ArenaDraftRefreshTrigger;
  durationMs: number;
  sourceRows: number;
  publishedClassCount: number;
  finishedAt: string;
};

export type ArenaDraftRefreshPipeline = {
  run: (
    trigger: ArenaDraftRefreshTrigger,
  ) => Promise<{ run: ArenaDraftRefreshRun; deduplicated: boolean }>;
  status: () => ArenaDraftRefreshStatus;
};

type PipelineOptions = {
  stateDirectory: string;
  schedule: string;
  refresh: () => Promise<ArenaDraftRefreshPublication>;
  now?: () => Date;
  createRunId?: () => string;
  onEvent?: (event: Record<string, string | number | boolean | null>) => void;
  onMetric?: (metric: ArenaDraftRefreshMetric) => void;
};

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function finiteOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function validRun(value: unknown): value is ArenaDraftRefreshRun {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const run = value as Partial<ArenaDraftRefreshRun>;
  return typeof run.id === 'string'
    && run.id.length > 0
    && run.id.length <= 80
    && ['manual', 'scheduled', 'startup'].includes(String(run.trigger))
    && ['running', 'succeeded', 'failed'].includes(String(run.status))
    && validIso(run.startedAt)
    && (run.finishedAt === null || validIso(run.finishedAt))
    && finiteOrNull(run.durationMs)
    && (run.cohortId === null || (typeof run.cohortId === 'string' && run.cohortId.length <= 200))
    && (run.patchVersion === null || (typeof run.patchVersion === 'string' && run.patchVersion.length <= 40))
    && finiteOrNull(run.sourceRows)
    && finiteOrNull(run.qualityScore)
    && Array.isArray(run.publishedClasses)
    && run.publishedClasses.length <= 20
    && run.publishedClasses.every(item => typeof item === 'string' && item.length <= 40)
    && (run.errorCode === null || (typeof run.errorCode === 'string' && SAFE_CODE.test(run.errorCode)));
}

function emptyState(now: Date, schedule: string): PersistedRefreshState {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    updatedAt: now.toISOString(),
    schedule,
    lastAttemptAt: null,
    lastSuccessAt: null,
    runs: [],
  };
}

function readState(directory: string, now: Date, schedule: string): PersistedRefreshState {
  try {
    const value = JSON.parse(
      readFileSync(join(directory, STATE_FILENAME), 'utf8'),
    ) as Partial<PersistedRefreshState>;
    if (
      value.schemaVersion !== STATE_SCHEMA_VERSION
      || !validIso(value.updatedAt)
      || (value.lastAttemptAt !== null && !validIso(value.lastAttemptAt))
      || (value.lastSuccessAt !== null && !validIso(value.lastSuccessAt))
      || !Array.isArray(value.runs)
      || value.runs.length > MAX_RUNS
      || !value.runs.every(validRun)
    ) {
      return emptyState(now, schedule);
    }
    return { ...value, schedule } as PersistedRefreshState;
  } catch {
    return emptyState(now, schedule);
  }
}

function errorCode(error: unknown): string {
  const candidates = [
    (error as { code?: unknown })?.code,
    error instanceof Error ? error.message : null,
  ];
  const candidate = candidates.find(value => (
    typeof value === 'string' && SAFE_FAILURE_CODES.has(value)
  ));
  return typeof candidate === 'string' ? candidate : 'ARENA_DRAFT_REFRESH_FAILED';
}

function defaultEventWriter(event: Record<string, string | number | boolean | null>): void {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event,
  })}\n`);
}

export function createArenaDraftRefreshPipeline(
  options: PipelineOptions,
): ArenaDraftRefreshPipeline {
  const now = options.now ?? (() => new Date());
  const createRunId = options.createRunId ?? randomUUID;
  const emit = options.onEvent ?? defaultEventWriter;
  let state = readState(options.stateDirectory, now(), options.schedule);
  let inFlight: Promise<ArenaDraftRefreshRun> | null = null;

  const persist = () => {
    state.updatedAt = now().toISOString();
    writeJsonAtomically(options.stateDirectory, STATE_FILENAME, state);
  };

  const interruptedAt = now();
  let recovered = false;
  state.runs = state.runs.map(run => {
    if (run.status !== 'running') return run;
    recovered = true;
    return {
      ...run,
      status: 'failed',
      finishedAt: interruptedAt.toISOString(),
      durationMs: Math.max(0, interruptedAt.getTime() - Date.parse(run.startedAt)),
      errorCode: 'PROCESS_INTERRUPTED',
    };
  });
  if (recovered) persist();

  const status = (): ArenaDraftRefreshStatus => ({
    ...state,
    isRunning: inFlight !== null,
    runs: state.runs.map(run => ({ ...run, publishedClasses: [...run.publishedClasses] })),
  });

  const finish = (
    started: ArenaDraftRefreshRun,
    result: ArenaDraftRefreshPublication | null,
    failureCode: string | null,
  ): ArenaDraftRefreshRun => {
    const finished = now();
    const completed: ArenaDraftRefreshRun = {
      ...started,
      status: result ? 'succeeded' : 'failed',
      finishedAt: finished.toISOString(),
      durationMs: Math.max(0, finished.getTime() - Date.parse(started.startedAt)),
      cohortId: result?.cohortId ?? null,
      patchVersion: result?.patchVersion ?? null,
      sourceRows: result?.sourceRows ?? null,
      qualityScore: result?.qualityScore ?? null,
      publishedClasses: result ? [...result.publishedClasses] : [],
      errorCode: failureCode,
    };
    state.runs = [completed, ...state.runs.filter(run => run.id !== started.id)]
      .slice(0, MAX_RUNS);
    if (result) state.lastSuccessAt = completed.finishedAt;
    persist();
    try {
      emit({
        event: 'arena_draft_refresh_completed',
        level: result ? 'info' : 'warn',
        runId: completed.id,
        trigger: completed.trigger,
        status: completed.status,
        durationMs: completed.durationMs ?? 0,
        sourceRows: completed.sourceRows ?? 0,
        publishedClassCount: completed.publishedClasses.length,
        errorCode: completed.errorCode,
      });
    } catch {
      // Logging must not invalidate an already persisted model publication.
    }
    try {
      options.onMetric?.({
        status: result ? 'succeeded' : 'failed',
        trigger: completed.trigger,
        durationMs: completed.durationMs ?? 0,
        sourceRows: completed.sourceRows ?? 0,
        publishedClassCount: completed.publishedClasses.length,
        finishedAt: completed.finishedAt!,
      });
    } catch {
      // Metrics must not invalidate an already persisted model publication.
    }
    return completed;
  };

  const run = (
    trigger: ArenaDraftRefreshTrigger,
  ): Promise<{ run: ArenaDraftRefreshRun; deduplicated: boolean }> => {
    if (inFlight) {
      return inFlight.then(activeRun => ({ run: activeRun, deduplicated: true }));
    }
    const startedAt = now().toISOString();
    const started: ArenaDraftRefreshRun = {
      id: createRunId(),
      trigger,
      status: 'running',
      startedAt,
      finishedAt: null,
      durationMs: null,
      cohortId: null,
      patchVersion: null,
      sourceRows: null,
      qualityScore: null,
      publishedClasses: [],
      errorCode: null,
    };
    state.lastAttemptAt = startedAt;
    state.runs = [started, ...state.runs].slice(0, MAX_RUNS);
    persist();

    let refreshPromise: Promise<ArenaDraftRefreshPublication>;
    try {
      refreshPromise = options.refresh();
    } catch (error) {
      refreshPromise = Promise.reject(error);
    }
    const execution = refreshPromise.then(
      result => finish(started, result, null),
      error => finish(started, null, errorCode(error)),
    );
    inFlight = execution;
    void execution.then(() => {
      if (inFlight === execution) inFlight = null;
    }, () => {
      if (inFlight === execution) inFlight = null;
    });
    return execution.then(completed => ({ run: completed, deduplicated: false }));
  };

  return { run, status };
}
