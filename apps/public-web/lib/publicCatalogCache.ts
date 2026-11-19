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

/**
 * The source answers that there is no such thing, or refuses the request (a 4xx): the caller learns the
 * status as it is, nothing is stored and an older copy of that key is dropped, so a removed page is not
 * served from memory.
 */
export class PublicDataMissingError extends Error {
  constructor(readonly status = 404, message = 'Public data not found') {
    super(message);
    this.name = 'PublicDataMissingError';
  }
}

/** By name: `proxy.ts` and the pages are bundled apart, so the class of an error caught there may be another copy. */
export const isPublicDataMissing = (error: unknown) => error instanceof Error && error.name === 'PublicDataMissingError';

/** Tuning of one cache; the defaults are the card catalog's. */
export type LastGoodCacheOptions = {
  /** How long the source is awaited while a last good copy can answer instead. */
  deadlineMs?: number;
  /** How long it is awaited when there is no copy to answer with. */
  coldDeadlineMs?: number;
  /**
   * A caller that is not `patient` waits for a read with no copy to answer with at most `deadlineMs` from the
   * read's start: the page that follows a proxy which has already waited does not wait again.
   */
  coldFromStart?: boolean;
  /** A success is served without asking the source for this long. */
  freshMs?: number;
  /** With a copy to serve, a failed source is left alone for this long. */
  retryBackoffMs?: number;
  /** A read younger than this is joined by the next visitor; an older one is not waited for again. */
  joinMs?: number;
  /** With no copy, a failed read is not repeated for this long (a visit makes several reads, and an outage is not hammered). */
  coldFailureMs?: number;
  /** After an answer from the copy because the source was too slow, the next visitors get the copy at once for this long (0: each waits). */
  missBackoffMs?: number;
  maxEntries?: number;
  /** Total `size` of the kept copies; the oldest idle ones go first. */
  maxBytes?: number;
  staleLimitMs?: number;
  size?: (value: unknown) => number;
};

export class CatalogUnavailableError extends Error {
  constructor(message = 'Public catalog temporarily unavailable') {
    super(message);
    this.name = 'CatalogUnavailableError';
  }
}

type Entry<T> = { good?: { value: T; storedAt: number; bytes: number }; inflight?: Promise<void>; startedAt?: number; backoffUntil: number; missUntil?: number; failedUntil?: number; freshUntil: number; missing?: PublicDataMissingError };

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
  markStale: (value: T) => T = value => value, options: LastGoodCacheOptions = {}) {
  const { deadlineMs = CATALOG_READ_DEADLINE_MS, coldDeadlineMs = deadlineMs, freshMs = FRESH_MS, retryBackoffMs = RETRY_BACKOFF_MS, missBackoffMs = 0, coldFromStart = false, coldFailureMs = 0,
    joinMs = deadlineMs, maxEntries = MAX_ENTRIES, maxBytes = Infinity, staleLimitMs = STALE_LIMIT_MS, size = () => 0 } = options;
  const entries = new Map<string, Entry<T>>();
  const bytesKept = () => { let total = 0; for (const kept of entries.values()) total += kept.good?.bytes ?? 0; return total; };
  // Oldest idle entries go first; one with a read in flight is never dropped.
  const trim = (keep: string) => {
    for (const [other, old] of entries) {
      if (entries.size <= maxEntries && bytesKept() <= maxBytes) break;
      if (other !== keep && !old.inflight) entries.delete(other);
    }
  };
  const stale = (entry: Entry<T>, error: unknown): T => {
    if (entry.good && now() - entry.good.storedAt <= staleLimitMs) return markStale(entry.good.value);
    throw error instanceof CatalogUnavailableError ? error : new CatalogUnavailableError();
  };
  const start = (key: string, entry: Entry<T>) => {
    const controller = new AbortController();
    // The transport has its own deadline; this one only guarantees the read settles.
    const timer = setTimeout(() => controller.abort(new CatalogUnavailableError('Public catalog request timed out')), HARD_DEADLINE_MS);
    timer.unref?.();
    entry.missing = undefined;
    const inflight: Promise<void> = Promise.resolve().then(() => read(key, controller.signal)).then(value => {
      entry.good = { value, storedAt: now(), bytes: size(value) };
      entry.freshUntil = now() + freshMs;
      entry.backoffUntil = 0;
      entry.missUntil = 0;
      entry.failedUntil = 0;
      // A refreshed copy is the newest one; moving it last keeps the oldest-first eviction honest.
      if (entries.get(key) === entry) { entries.delete(key); entries.set(key, entry); trim(key); }
    }, error => {
      if (isPublicDataMissing(error)) {
        entry.missing = error;
        entry.good = undefined;
        if (entries.get(key) === entry) entries.delete(key);
        return;
      }
      // Only while a last good copy answers meanwhile; with none, every visit retries at once.
      if (entry.good) entry.backoffUntil = now() + retryBackoffMs;
      else entry.failedUntil = now() + coldFailureMs;
    }).finally(() => {
      clearTimeout(timer);
      if (entry.inflight === inflight) entry.inflight = undefined;
    });
    entry.inflight = inflight;
    entry.startedAt = now();
    return inflight;
  };
  return async (key: string, patient = true): Promise<T> => {
    let entry = entries.get(key);
    if (entry?.good && entry.freshUntil > now()) return entry.good.value;
    if (entry && !entry.inflight && entry.backoffUntil > now()) return stale(entry, null);
    if (entry?.good && (entry.missUntil ?? 0) > now()) return stale(entry, null);
    if (entry && !entry.good && !entry.inflight && (entry.failedUntil ?? 0) > now()) throw new CatalogUnavailableError();
    if (!entry) {
      entry = { backoffUntil: 0, freshUntil: 0 };
      entries.set(key, entry);
      trim(key);
    }
    // A read that already missed its deadline is not joined again, so a recovered source is tried at once.
    const joinable = entry.inflight && now() - (entry.startedAt ?? 0) < joinMs;
    const inflight = joinable && entry.inflight ? entry.inflight : start(key, entry);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'late'>(resolve => {
      const wait = entry.good ? deadlineMs
        : coldFromStart && !patient ? Math.max(0, (entry.startedAt ?? now()) + deadlineMs - now()) : coldDeadlineMs;
      timer = setTimeout(() => resolve('late'), wait);
      timer.unref?.();
    });
    const outcome = await Promise.race([inflight.then(() => 'done' as const), deadline]);
    clearTimeout(timer);
    if (outcome === 'done' && entry.missing) throw entry.missing;
    if (outcome === 'done' && entry.good && entry.freshUntil > now()) return entry.good.value;
    if (outcome === 'late' && entry.good && missBackoffMs > 0) entry.missUntil = now() + missBackoffMs;
    return stale(entry, outcome === 'late' ? new CatalogUnavailableError('Public catalog request timed out') : null);
  };
}
