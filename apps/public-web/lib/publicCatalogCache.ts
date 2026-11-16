/** The source is not awaited longer than this; the last good catalog answers instead. */
export const CATALOG_READ_DEADLINE_MS = 2_000;
const FRESH_MS = 30_000;
/** With a last good copy to serve, a failed source is left alone for a moment, so an outage is not hammered by every visit. */
const RETRY_BACKOFF_MS = 5_000;
/** The last good catalog is served through an outage this long; beyond it the data is too old to call current. */
const STALE_LIMIT_MS = 6 * 60 * 60 * 1000;
/** Default and filtered catalog addresses share one bounded store. */
const MAX_ENTRIES = 100;
/** A read that missed its deadline may still finish and warm the cache, but not for longer than this. */
const HARD_DEADLINE_MS = 10_000;

export class CatalogUnavailableError extends Error {
  constructor(message = 'Public catalog temporarily unavailable') {
    super(message);
    this.name = 'CatalogUnavailableError';
  }
}

type Entry<T> = { good?: { value: T; storedAt: number }; inflight?: Promise<void>; startedAt?: number; backoffUntil: number; freshUntil: number };

/**
 * Anonymous catalog projections by key (format and normalized request, so
 * filtered and paged lists are covered too). A caller waits for the source at
 * most `CATALOG_READ_DEADLINE_MS`; the read itself goes on in the background
 * (the transport's own deadline stops it) and warms the cache when it
 * succeeds, so a slow but live Express costs one slow answer, not an outage.
 * A success stays fresh for 30s and becomes the last good version. When the
 * source fails or is too slow the last good version is served (stale), and only
 * without one the read throws `CatalogUnavailableError`.
 */
export function createDefaultCatalogCache<T>(read: (key: string, signal: AbortSignal) => Promise<T>, now = Date.now,
  /** Presents the stored copy as stale; it must return a new value and leave the stored one untouched. */
  markStale: (value: T) => T = value => value) {
  const entries = new Map<string, Entry<T>>();
  const stale = (entry: Entry<T>, error: unknown): T => {
    if (entry.good && now() - entry.good.storedAt <= STALE_LIMIT_MS) return markStale(entry.good.value);
    throw error instanceof CatalogUnavailableError ? error : new CatalogUnavailableError();
  };
  const start = (key: string, entry: Entry<T>) => {
    const controller = new AbortController();
    // The transport has its own deadline; this one only guarantees the read settles.
    const timer = setTimeout(() => controller.abort(new CatalogUnavailableError('Public catalog request timed out')), HARD_DEADLINE_MS);
    timer.unref?.();
    const inflight: Promise<void> = Promise.resolve().then(() => read(key, controller.signal)).then(value => {
      entry.good = { value, storedAt: now() };
      entry.freshUntil = now() + FRESH_MS;
      entry.backoffUntil = 0;
    }, () => {
      // Only while a last good copy answers meanwhile; with none, every visit retries at once.
      if (entry.good) entry.backoffUntil = now() + RETRY_BACKOFF_MS;
    }).finally(() => {
      clearTimeout(timer);
      if (entry.inflight === inflight) entry.inflight = undefined;
    });
    entry.inflight = inflight;
    entry.startedAt = now();
    return inflight;
  };
  return async (key: string): Promise<T> => {
    let entry = entries.get(key);
    if (entry?.good && entry.freshUntil > now()) return entry.good.value;
    if (entry && !entry.inflight && entry.backoffUntil > now()) return stale(entry, null);
    if (!entry) {
      entry = { backoffUntil: 0, freshUntil: 0 };
      entries.set(key, entry);
      // Oldest idle entries go first; one with a read in flight is never dropped.
      for (const [other, old] of entries) {
        if (entries.size <= MAX_ENTRIES) break;
        if (other !== key && !old.inflight) entries.delete(other);
      }
    }
    // A read that already missed its deadline is not joined again, so a recovered source is tried at once.
    const joinable = entry.inflight && now() - (entry.startedAt ?? 0) < CATALOG_READ_DEADLINE_MS;
    const inflight = joinable && entry.inflight ? entry.inflight : start(key, entry);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'late'>(resolve => {
      timer = setTimeout(() => resolve('late'), CATALOG_READ_DEADLINE_MS);
      timer.unref?.();
    });
    const outcome = await Promise.race([inflight.then(() => 'done' as const), deadline]);
    clearTimeout(timer);
    if (outcome === 'done' && entry.good && entry.freshUntil > now()) return entry.good.value;
    return stale(entry, outcome === 'late' ? new CatalogUnavailableError('Public catalog request timed out') : null);
  };
}
