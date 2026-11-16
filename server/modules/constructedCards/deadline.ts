/**
 * Upper bound for a shared (deduplicated) read. A promise that never settles
 * would otherwise stay in its dedupe map forever and block every later caller.
 */
export class DeadlineExceededError extends Error {
  constructor(readonly operation: string, readonly deadlineMs: number) {
    super(`${operation} exceeded its ${deadlineMs} ms deadline`);
    this.name = 'DeadlineExceededError';
  }
}

const lastLogged = new Map<string, number>();

/** One line per missed deadline and load name, at most once per 30 s, so a long outage does not flood the log. */
export function logDeadlineExceeded(operation: string, deadlineMs: number): void {
  const at = Date.now();
  if (at - (lastLogged.get(operation) ?? 0) < 30_000) return;
  if (lastLogged.size > 500) lastLogged.clear();
  lastLogged.set(operation, at);
  console.warn(`[deadline] ${operation} did not finish within ${deadlineMs} ms`);
}

/**
 * Rejects with `DeadlineExceededError` after `ms`. The underlying work is not
 * cancelled (it has no signal); callers only stop waiting for it.
 */
export function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  operation: string,
  onExceeded: (operation: string, deadlineMs: number) => void = logDeadlineExceeded,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      try { onExceeded(operation, ms); } catch { /* diagnostics must not change the outcome */ }
      reject(new DeadlineExceededError(operation, ms));
    }, ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * The caller of a shared load waits at most `ms`; past that it gets
 * `fallback()` (the last good version) or, without one, `unavailable(cause)`.
 * The shared work itself goes on and is bounded separately.
 */
export async function answerWithin<T>(
  work: Promise<T>,
  ms: number,
  operation: string,
  onExceeded: ((operation: string, deadlineMs: number) => void) | undefined,
  fallback: () => T | null,
  unavailable: (cause: unknown) => Error,
): Promise<T> {
  try {
    return await withDeadline(work, ms, operation, onExceeded);
  } catch (error) {
    if (!(error instanceof DeadlineExceededError)) throw error;
    const last = fallback();
    if (last === null) throw unavailable(error);
    return last;
  }
}

/** Keys whose shared load missed its response deadline; bounded, expired entries are dropped. */
export function createSlowMemo(now: () => number, ttlMs = 30_000, maxEntries = 256) {
  const until = new Map<string, number>();
  return {
    isSlow: (key: string) => (until.get(key) ?? 0) > now(),
    mark(key: string) {
      until.delete(key); // re-insert, so the map stays ordered from the oldest mark to the newest
      if (until.size >= maxEntries) for (const [other, at] of until) if (at <= now()) until.delete(other);
      // Still full of live marks: give up only the oldest one, never the fresh ones.
      if (until.size >= maxEntries) for (const oldest of until.keys()) { until.delete(oldest); break; }
      until.set(key, now() + ttlMs);
    },
    clear: (key: string) => { until.delete(key); },
  };
}
