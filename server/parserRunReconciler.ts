export type ParserCacheInvalidationContext = {
  reason: 'policy-change' | 'manual-run';
  runId?: string;
};

type RunState = { id: string; status: string };
type Wait = (milliseconds: number) => Promise<void>;

export type ParserRunReconciler = {
  observe: (payload: unknown) => boolean;
  activeCount: () => number;
  whenIdle: () => Promise<void>;
};

type ReconcilerOptions = {
  listRuns: () => Promise<unknown>;
  invalidate: (context: ParserCacheInvalidationContext) => Promise<void>;
  onWarning?: (scope: 'poll' | 'invalidate' | 'timeout', error: unknown, runId: string) => void;
  wait?: Wait;
  now?: () => number;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

const TERMINAL_STATUSES = new Set(['succeeded', 'success', 'completed', 'partial', 'failed', 'cancelled', 'canceled']);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function runState(value: unknown): RunState | null {
  const source = record(value);
  const id = String(source.id ?? source.runId ?? source.run_id ?? '').trim();
  const status = String(source.status ?? '').trim().toLowerCase();
  return id && status ? { id, status } : null;
}

function createdRun(payload: unknown): RunState | null {
  const root = record(payload);
  return runState(root.run) ?? runState(root);
}

function findRun(payload: unknown, runId: string): RunState | null {
  const root = record(payload);
  const candidates = [root.activeRun, root.active_run, root.run];
  for (const candidate of candidates) {
    const state = runState(candidate);
    if (state?.id === runId) return state;
  }
  const data = record(root.data);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(root.runs)
      ? root.runs
      : Array.isArray(root.jobs)
        ? root.jobs
        : Array.isArray(data.runs)
          ? data.runs
          : [];
  for (const row of rows) {
    const state = runState(row);
    if (state?.id === runId) return state;
  }
  return null;
}

function defaultWait(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, milliseconds);
    timer.unref?.();
  });
}

export function createParserRunReconciler(options: ReconcilerOptions): ParserRunReconciler {
  const wait = options.wait ?? defaultWait;
  const now = options.now ?? Date.now;
  const pollIntervalMs = Math.max(250, options.pollIntervalMs ?? 5_000);
  const timeoutMs = Math.max(pollIntervalMs, options.timeoutMs ?? 12 * 60 * 60_000);
  const monitors = new Map<string, Promise<void>>();

  const observe = (payload: unknown): boolean => {
    const initial = createdRun(payload);
    if (!initial || monitors.has(initial.id)) return false;
    const startedAt = now();
    const monitor = (async () => {
      let current = initial;
      while (!TERMINAL_STATUSES.has(current.status)) {
        if (now() - startedAt >= timeoutMs) {
          options.onWarning?.('timeout', new Error('Истекло время ожидания завершения обновления'), initial.id);
          return;
        }
        await wait(pollIntervalMs);
        try {
          const next = findRun(await options.listRuns(), initial.id);
          if (next) current = next;
        } catch (error) {
          options.onWarning?.('poll', error, initial.id);
        }
      }
      try {
        await options.invalidate({ reason: 'manual-run', runId: initial.id });
      } catch (error) {
        options.onWarning?.('invalidate', error, initial.id);
      }
    })().finally(() => {
      monitors.delete(initial.id);
    });
    monitors.set(initial.id, monitor);
    return true;
  };

  return {
    observe,
    activeCount: () => monitors.size,
    whenIdle: () => Promise.all([...monitors.values()]).then(() => undefined),
  };
}
