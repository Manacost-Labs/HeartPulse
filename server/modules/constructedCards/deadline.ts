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

/** One line per missed deadline, so the next hang names what exactly hung. */
export function logDeadlineExceeded(operation: string, deadlineMs: number): void {
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
