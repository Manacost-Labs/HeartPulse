import type { CardFormat } from '@/src/modules/constructedCards/public';

/** The source is not awaited longer than this; the last good catalog answers instead. */
export const CATALOG_READ_DEADLINE_MS = 2_000;
const FRESH_MS = 30_000;
/** With a last good copy to serve, a failed source is left alone for a moment, so an outage is not hammered by every visit. */
const RETRY_BACKOFF_MS = 5_000;
/** The last good catalog is served through an outage this long; beyond it the data is too old to call current. */
const STALE_LIMIT_MS = 6 * 60 * 60 * 1000;

export class CatalogUnavailableError extends Error {
  constructor(message = 'Public catalog temporarily unavailable') {
    super(message);
    this.name = 'CatalogUnavailableError';
  }
}

type Entry<T> = { good?: { value: T; storedAt: number }; pending?: Promise<T>; backoffUntil: number };

/**
 * Anonymous default catalog per format. A read waits for the source at most
 * `CATALOG_READ_DEADLINE_MS`; a success stays fresh for 30s and becomes the
 * last good version. When the source fails or stalls the last good version is
 * served (stale), and only without one the read throws `CatalogUnavailableError`.
 */
export function createDefaultCatalogCache<T>(read: (format: CardFormat, signal: AbortSignal) => Promise<T>, now = Date.now) {
  const entries = new Map<CardFormat, Entry<T> & { freshUntil: number }>();
  const stale = (entry: Entry<T> | undefined, error: unknown): T => {
    if (entry?.good && now() - entry.good.storedAt <= STALE_LIMIT_MS) return entry.good.value;
    throw error instanceof CatalogUnavailableError ? error : new CatalogUnavailableError();
  };
  return (format: CardFormat): Promise<T> => {
    let entry = entries.get(format);
    if (entry?.good && entry.freshUntil > now()) return Promise.resolve(entry.good.value);
    if (entry?.pending) return entry.pending;
    if (entry && entry.backoffUntil > now()) {
      try { return Promise.resolve(stale(entry, null)); } catch (error) { return Promise.reject(error); }
    }
    if (!entry) { entry = { backoffUntil: 0, freshUntil: 0 }; entries.set(format, entry); }
    const current = entry;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const error = new CatalogUnavailableError('Public catalog request timed out');
        reject(error);
        controller.abort(error);
      }, CATALOG_READ_DEADLINE_MS);
      timer.unref?.();
    });
    // A transport abort can itself stall; the shared promise needs its own settlement.
    const attempt = Promise.race([Promise.resolve().then(() => read(format, controller.signal)), deadline]);
    const pending: Promise<T> = attempt.then(value => {
      current.good = { value, storedAt: now() };
      current.freshUntil = now() + FRESH_MS;
      current.backoffUntil = 0;
      return value;
    }, error => {
      // Only while a last good copy answers meanwhile; with none, every visit retries at once.
      if (current.good) current.backoffUntil = now() + RETRY_BACKOFF_MS;
      return stale(current, error);
    }).finally(() => {
      clearTimeout(timer);
      controller.abort();
      if (current.pending === pending) current.pending = undefined;
    });
    current.pending = pending;
    return pending;
  };
}
