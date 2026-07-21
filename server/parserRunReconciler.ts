import { lstatSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomically } from './durableJson.js';

export type ParserCacheInvalidationContext = {
  reason: 'policy-change' | 'manual-run';
  runId?: string;
};

type RunState = { id: string; status: string };
type Wait = (milliseconds: number) => Promise<void>;
type RunResolution = 'pending' | 'invalidated';

type PersistedRun = RunState & {
  observedAt: number;
  updatedAt: number;
  resolution: RunResolution;
};

type PersistedState = {
  version: 1;
  runs: PersistedRun[];
};

export type ParserRunReconciliationStore = {
  load: () => unknown;
  save: (state: PersistedState) => void;
  quarantine?: () => void;
};

export type ParserRunReconciler = {
  observe: (payload: unknown) => boolean;
  recover: () => Promise<number>;
  activeCount: () => number;
  whenIdle: () => Promise<void>;
};

type ReconcilerWarningScope = 'poll' | 'invalidate' | 'timeout' | 'load' | 'persist' | 'recover';

type ReconcilerOptions = {
  listRuns: () => Promise<unknown>;
  invalidate: (context: ParserCacheInvalidationContext) => Promise<void>;
  stateStore?: ParserRunReconciliationStore;
  onWarning?: (scope: ReconcilerWarningScope, error: unknown, runId: string) => void;
  wait?: Wait;
  now?: () => number;
  pollIntervalMs?: number;
  timeoutMs?: number;
  retainedRunCount?: number;
  invalidationRetryAttempts?: number;
  invalidationRetryBaseMs?: number;
};

const TERMINAL_STATUSES = new Set([
  'succeeded',
  'success',
  'completed',
  'partial',
  'failed',
  'cancelled',
  'canceled',
]);
const MAX_LEDGER_CLOCK_SKEW_MS = 5 * 60_000;
const MAX_LEDGER_BYTES = 1024 * 1024;
const MAX_LEDGER_RUNS = 1_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function runState(value: unknown): RunState | null {
  const source = record(value);
  const id = String(source.id ?? source.runId ?? source.run_id ?? '').trim();
  const status = String(source.status ?? '').trim().toLowerCase();
  return id
    && id.length <= 160
    && status
    && status.length <= 64
    && /^[a-z0-9_-]+$/.test(status)
    ? { id, status }
    : null;
}

function createdRun(payload: unknown): RunState | null {
  const root = record(payload);
  return runState(root.run) ?? runState(root);
}

function payloadRuns(payload: unknown): RunState[] {
  const root = record(payload);
  const data = record(root.data);
  const candidates: unknown[] = [root.activeRun, root.active_run, root.run];
  for (const rows of [
    Array.isArray(payload) ? payload : null,
    root.runs,
    root.recentRuns,
    root.jobs,
    data.runs,
  ]) {
    if (Array.isArray(rows)) candidates.push(...rows);
  }
  const unique = new Map<string, RunState>();
  for (const candidate of candidates) {
    const state = runState(candidate);
    if (state) unique.set(state.id, state);
  }
  return [...unique.values()];
}

function findRun(payload: unknown, runId: string): RunState | null {
  return payloadRuns(payload).find(state => state.id === runId) ?? null;
}

function normalizedPersistedState(payload: unknown, currentTime: number): PersistedState {
  if (payload == null) return { version: 1, runs: [] };
  const source = record(payload);
  if (source.version !== 1 || !Array.isArray(source.runs)) {
    throw new Error('Файл восстановления запусков имеет неизвестный формат');
  }
  const rows = source.runs;
  if (rows.length > MAX_LEDGER_RUNS) {
    throw new Error('Файл восстановления запусков превышает допустимый размер');
  }
  const runs = new Map<string, PersistedRun>();
  for (const row of rows) {
    const state = runState(row);
    const values = record(row);
    const resolution = String(values.resolution ?? '') as RunResolution;
    const observedAt = Number(values.observedAt);
    const updatedAt = Number(values.updatedAt);
    if (
      !state
      || !['pending', 'invalidated'].includes(resolution)
      || !Number.isFinite(observedAt)
      || !Number.isFinite(updatedAt)
      || observedAt < 0
      || updatedAt < observedAt
      || observedAt > currentTime + MAX_LEDGER_CLOCK_SKEW_MS
      || updatedAt > currentTime + MAX_LEDGER_CLOCK_SKEW_MS
    ) {
      throw new Error('Файл восстановления запусков содержит повреждённую запись');
    }
    if (runs.has(state.id)) {
      throw new Error('Файл восстановления запусков содержит дублирующийся ID');
    }
    runs.set(state.id, { ...state, observedAt, updatedAt, resolution });
  }
  return { version: 1, runs: [...runs.values()] };
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
  });
}

export function createParserRunReconciliationFileStore(
  dataDirectory: string,
  filename = 'parser-run-reconciliation.json',
): ParserRunReconciliationStore {
  const descriptor = join(dataDirectory, filename);
  return {
    load: () => {
      try {
        const metadata = lstatSync(descriptor);
        if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_LEDGER_BYTES) {
          throw new Error('Файл восстановления запусков имеет недопустимый тип или размер');
        }
        return JSON.parse(readFileSync(descriptor, 'utf8')) as unknown;
      } catch (error) {
        if ((error as { code?: string })?.code === 'ENOENT') return null;
        throw error;
      }
    },
    save: state => {
      writeJsonAtomically(dataDirectory, filename, state);
    },
    quarantine: () => {
      renameSync(descriptor, `${descriptor}.corrupt-${Date.now()}-${process.pid}`);
    },
  };
}

export function createParserRunReconciler(options: ReconcilerOptions): ParserRunReconciler {
  const wait = options.wait ?? defaultWait;
  const now = options.now ?? Date.now;
  const pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 5_000);
  const timeoutMs = Math.max(pollIntervalMs, options.timeoutMs ?? 12 * 60 * 60_000);
  const retainedRunCount = Math.max(20, options.retainedRunCount ?? 200);
  const invalidationRetryAttempts = Math.max(1, Math.min(10, options.invalidationRetryAttempts ?? 3));
  const invalidationRetryBaseMs = Math.max(1, options.invalidationRetryBaseMs ?? 1_000);
  const monitors = new Map<string, Promise<void>>();
  const runs = new Map<string, PersistedRun>();
  let recovery: Promise<number> | null = null;

  if (options.stateStore) {
    try {
      const state = normalizedPersistedState(options.stateStore.load(), now());
      for (const run of state.runs) runs.set(run.id, run);
    } catch (error) {
      options.onWarning?.('load', error, '*');
      try {
        options.stateStore.quarantine?.();
      } catch (quarantineError) {
        options.onWarning?.('load', quarantineError, '*');
      }
    }
  }

  const persist = (runId: string): void => {
    if (!options.stateStore) return;
    const unresolved = [...runs.values()].filter(run => run.resolution === 'pending');
    const settled = [...runs.values()]
      .filter(run => run.resolution !== 'pending')
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, retainedRunCount);
    const state: PersistedState = { version: 1, runs: [...unresolved, ...settled] };
    const retainedIds = new Set(state.runs.map(run => run.id));
    for (const id of runs.keys()) {
      if (!retainedIds.has(id)) runs.delete(id);
    }
    try {
      options.stateStore.save(state);
    } catch (error) {
      options.onWarning?.('persist', error, runId);
    }
  };

  const invalidateWithRetry = async (runId: string): Promise<boolean> => {
    for (let attempt = 1; attempt <= invalidationRetryAttempts; attempt += 1) {
      try {
        await options.invalidate({ reason: 'manual-run', runId });
        return true;
      } catch (error) {
        options.onWarning?.('invalidate', error, runId);
        if (attempt >= invalidationRetryAttempts) return false;
        const delay = Math.min(60_000, invalidationRetryBaseMs * (2 ** (attempt - 1)));
        try {
          await wait(delay);
        } catch (waitError) {
          options.onWarning?.('invalidate', waitError, runId);
          return false;
        }
      }
    }
    return false;
  };

  const observe = (payload: unknown): boolean => {
    const initial = createdRun(payload);
    if (!initial) return false;
    const moment = now();
    const previous = runs.get(initial.id);
    if (previous && previous.resolution !== 'pending') return false;
    const tracked: PersistedRun = {
      id: initial.id,
      status: initial.status,
      observedAt: previous?.observedAt ?? moment,
      updatedAt: Math.max(moment, previous?.observedAt ?? moment, previous?.updatedAt ?? moment),
      resolution: 'pending',
    };
    runs.set(initial.id, tracked);
    persist(initial.id);
    if (monitors.has(initial.id)) return false;

    const monitor = (async () => {
      let current = tracked;
      while (!TERMINAL_STATUSES.has(current.status)) {
        if (now() - current.observedAt >= timeoutMs) {
          options.onWarning?.('timeout', new Error('Истекло время ожидания завершения обновления'), initial.id);
          return;
        }
        await wait(pollIntervalMs);
        const observed = runs.get(initial.id);
        if (observed?.resolution !== 'pending') return;
        current = observed ?? current;
        if (TERMINAL_STATUSES.has(current.status)) break;
        try {
          const next = findRun(await options.listRuns(), initial.id);
          if (next) {
            current = {
              ...current,
              status: next.status,
              updatedAt: Math.max(now(), current.observedAt, current.updatedAt),
            };
            runs.set(initial.id, current);
            persist(initial.id);
          }
        } catch (error) {
          options.onWarning?.('poll', error, initial.id);
        }
      }

      if (await invalidateWithRetry(initial.id)) {
        runs.set(initial.id, {
          ...current,
          updatedAt: Math.max(now(), current.observedAt, current.updatedAt),
          resolution: 'invalidated',
        });
        persist(initial.id);
      }
    })().finally(() => {
      monitors.delete(initial.id);
    });
    monitors.set(initial.id, monitor);
    return true;
  };

  const recover = (): Promise<number> => {
    if (recovery) return recovery;
    recovery = (async () => {
      let discovered: RunState[] = [];
      try {
        discovered = payloadRuns(await options.listRuns());
      } catch (error) {
        options.onWarning?.('recover', error, '*');
      }

      const latest = new Map(discovered.map(run => [run.id, run]));
      for (const tracked of runs.values()) {
        if (tracked.resolution === 'pending' && !latest.has(tracked.id)) {
          latest.set(tracked.id, tracked);
        }
      }
      let started = 0;
      const terminalRuns: PersistedRun[] = [];
      for (const run of latest.values()) {
        const previous = runs.get(run.id);
        if (previous && previous.resolution !== 'pending') continue;
        if (!TERMINAL_STATUSES.has(run.status)) {
          if (observe(run)) started += 1;
          continue;
        }
        const moment = now();
        const tracked: PersistedRun = {
          ...run,
          observedAt: previous?.observedAt ?? moment,
          updatedAt: Math.max(moment, previous?.observedAt ?? moment, previous?.updatedAt ?? moment),
          resolution: 'pending',
        };
        runs.set(run.id, tracked);
        if (monitors.has(run.id)) {
          persist(run.id);
          continue;
        }
        terminalRuns.push(tracked);
      }

      if (terminalRuns.length > 0) {
        const batchRunId = terminalRuns[0].id;
        persist(batchRunId);
        started += terminalRuns.length;
        if (await invalidateWithRetry(batchRunId)) {
          const reconciledAt = now();
          for (const run of terminalRuns) {
            runs.set(run.id, {
              ...run,
              updatedAt: Math.max(reconciledAt, run.observedAt, run.updatedAt),
              resolution: 'invalidated',
            });
          }
          persist(batchRunId);
        }
      }
      return started;
    })().finally(() => {
      recovery = null;
    });
    return recovery;
  };

  return {
    observe,
    recover,
    activeCount: () => monitors.size + (recovery ? 1 : 0),
    whenIdle: async () => {
      while (recovery || monitors.size > 0) {
        const currentRecovery = recovery;
        if (currentRecovery) await currentRecovery;
        await Promise.all([...monitors.values()]);
      }
    },
  };
}

type RecoveryIntervalHandle = { unref?: () => void };

export type ParserRunRecoveryLoop = {
  runNow: () => Promise<number>;
  stop: () => void;
};

export function startParserRunRecoveryLoop(options: {
  reconciler: ParserRunReconciler;
  intervalMs?: number;
  setIntervalImpl?: (callback: () => void, milliseconds: number) => RecoveryIntervalHandle;
  clearIntervalImpl?: (handle: RecoveryIntervalHandle) => void;
  onWarning?: (error: unknown) => void;
}): ParserRunRecoveryLoop {
  const intervalMs = Math.max(1_000, options.intervalMs ?? 60_000);
  const schedule = options.setIntervalImpl
    ?? ((callback: () => void, milliseconds: number) => setInterval(callback, milliseconds));
  const clear = options.clearIntervalImpl
    ?? ((handle: RecoveryIntervalHandle) => clearInterval(handle as ReturnType<typeof setInterval>));
  let inFlight: Promise<number> | null = null;
  let stopped = false;

  const runNow = (): Promise<number> => {
    if (stopped) return Promise.resolve(0);
    if (inFlight) return inFlight;
    let tracked!: Promise<number>;
    tracked = options.reconciler.recover()
      .catch(error => {
        options.onWarning?.(error);
        return 0;
      })
      .finally(() => {
        if (inFlight === tracked) inFlight = null;
      });
    inFlight = tracked;
    return tracked;
  };

  void runNow();
  const timer = schedule(() => { void runNow(); }, intervalMs);
  timer.unref?.();
  return {
    runNow,
    stop: () => {
      if (stopped) return;
      stopped = true;
      clear(timer);
    },
  };
}
