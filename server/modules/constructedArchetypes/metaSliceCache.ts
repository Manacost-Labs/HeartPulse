type Entry<T> = { value: T; freshUntil: number; staleUntil: number };

type MetaSliceCacheOptions = {
  ttlMs: number;
  staleMs?: number;
  retryMs?: number;
  timeoutMs?: number;
  now?: () => number;
  onRefreshError?: (key: string, error: unknown) => void;
};

/**
 * Keyed snapshots of the Standard meta slices (format, rank, period, coin,
 * minimum games). The upstream answers each slice in 1.5–3 s, so an expired
 * slice is served at once for `staleMs` while one background read refreshes
 * it, and concurrent readers of a slice share one read. `read` receives the
 * last good slice for its continuity check; a failed or rejected read keeps
 * that slice and is retried no sooner than `retryMs`. `clear()` also discards
 * reads already running, so a parser invalidation cannot be undone by them.
 */
export function createMetaSliceCache<T>({
  ttlMs, staleMs = 15 * 60_000, retryMs = 60_000, timeoutMs = 20_000, now = Date.now, onRefreshError,
}: MetaSliceCacheOptions) {
  const entries = new Map<string, Entry<T>>();
  const retryAt = new Map<string, number>();
  const jobs = new Map<string, Promise<T>>();
  let generation = 0;

  function refresh(key: string, read: (previous: T | null) => Promise<T>): Promise<T> {
    const running = jobs.get(key);
    if (running) return running;
    const startedGeneration = generation;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Meta slice source timed out')), timeoutMs);
    });
    const promise = Promise.race([Promise.resolve().then(() => read(entries.get(key)?.value ?? null)), deadline])
      .then(value => {
        if (startedGeneration !== generation) throw new Error('Meta slice read invalidated');
        const freshUntil = now() + ttlMs;
        entries.set(key, { value, freshUntil, staleUntil: freshUntil + staleMs });
        retryAt.delete(key);
        return value;
      })
      .catch(error => {
        if (startedGeneration === generation) {
          if (entries.has(key)) retryAt.set(key, now() + retryMs);
          onRefreshError?.(key, error);
        }
        throw error;
      })
      .finally(() => {
        clearTimeout(timer);
        if (jobs.get(key) === promise) jobs.delete(key);
      });
    jobs.set(key, promise);
    return promise;
  }

  return {
    async load(key: string, read: (previous: T | null) => Promise<T>): Promise<T> {
      const entry = entries.get(key);
      const time = now();
      if (!entry) return refresh(key, read);
      if (entry.freshUntil > time) return entry.value;
      const retryDue = (retryAt.get(key) ?? 0) <= time;
      if (entry.staleUntil > time || !retryDue) {
        if (retryDue) void refresh(key, read).catch(() => undefined);
        return entry.value;
      }
      // Past the stale window the reader waits for the source, but an
      // unreachable source still leaves the last good slice on screen.
      return refresh(key, read).catch(error => {
        if (entries.get(key) !== entry) throw error;
        return entry.value;
      });
    },
    stats() {
      const time = now();
      return { entries: entries.size, fresh: [...entries.values()].filter(entry => entry.freshUntil > time).length };
    },
    clear() {
      generation += 1;
      entries.clear();
      retryAt.clear();
      jobs.clear();
    },
  };
}

/**
 * A restart empties the slice cache and the source needs 1.5–3 s per slice:
 * warm the slice the meta page opens with, first for Express's default
 * period, then for the current period that slice names. Failures are logged;
 * the first visitor then reads the source as before.
 */
export async function warmMetaEntrySlices(load: (period: string) => Promise<unknown>): Promise<void> {
  try {
    const current = ((await load('past_day')) as { currentPeriod?: unknown } | null)?.currentPeriod;
    if (typeof current === 'string' && current !== 'past_day') await load(current);
  } catch (error) {
    console.warn('[standard-meta] prewarm failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * The source answers HTTP 422 for a patch it no longer collects. An old link
 * to such a patch opens the current patch (named by the `past_day` slice)
 * instead of failing; every other error is rethrown unchanged.
 */
export async function loadWithRetiredPatchFallback(
  load: (period: string) => Promise<unknown>,
  period: string,
): Promise<unknown> {
  try {
    return await load(period);
  } catch (error) {
    if (!period.startsWith('patch_') || !(error instanceof Error) || error.message !== 'Upstream HTTP 422') throw error;
    const current = ((await load('past_day')) as { currentPatchPeriod?: unknown } | null)?.currentPatchPeriod;
    if (typeof current !== 'string' || !current.startsWith('patch_') || current === period) throw error;
    return load(current);
  }
}
