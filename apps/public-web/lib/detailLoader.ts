/**
 * Shared reads of per-key details for server pages (the deck pages of #309): one read per key at a time whoever asks,
 * at most `maxActive` reads in flight and `maxWaiting` waiting for a slot. A key that finds the queue full is not read
 * (its page renders without it). A read lives `timeoutMs` from the moment it was asked for, waiting included: a read
 * still queued then is dropped, one in flight is cancelled and frees its slot at once, so a source that hung never
 * delays the reads asked for after it answers again. The last good value of a key is kept `staleMs`; a key read in
 * the last `freshMs` is not read again. The table holds `capacity` keys; a key being read is never evicted, so the
 * table exceeds it by the reads in flight and queued at most.
 */
export type DetailLoaderOptions<T> = {
  /** Reads a key: its value, or a rejection for a failed or cancelled read (the last good value stays). */
  read: (key: string, signal: AbortSignal) => Promise<T>;
  maxActive: number;
  maxWaiting: number;
  capacity: number;
  timeoutMs: number;
  freshMs: number;
  staleMs: number;
  now?: () => number;
};

type Entry<T> = { value: T | null; at: number; loading: Promise<void> | null };

export function createDetailLoader<T>(options: DetailLoaderOptions<T>) {
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry<T>>();
  const waiting: (() => void)[] = [];
  let active = 0;

  const release = () => {
    const next = waiting.shift();
    // The slot passes straight to the next waiting read, so no other read can take it in between.
    if (next) next(); else active -= 1;
  };

  /** A slot within `deadline`: true when owned, false when the queue is full or the wait ran out. */
  function acquire(deadline: number): Promise<boolean> {
    if (active < options.maxActive) { active += 1; return Promise.resolve(true); }
    if (waiting.length >= options.maxWaiting) return Promise.resolve(false);
    return new Promise(resolve => {
      const grant = () => { clearTimeout(timer); resolve(true); };
      const timer = setTimeout(() => {
        const index = waiting.indexOf(grant);
        if (index >= 0) waiting.splice(index, 1);
        resolve(false);
      }, Math.max(0, deadline - now()));
      waiting.push(grant);
    });
  }

  async function refresh(key: string, entry: Entry<T>): Promise<void> {
    const deadline = now() + options.timeoutMs;
    if (!await acquire(deadline)) return;
    // A slot handed over with almost no time left is passed on: such a read could only be cancelled.
    if (deadline - now() < options.timeoutMs / 10) { release(); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadline - now());
    try {
      entry.value = await options.read(key, controller.signal);
      entry.at = now();
    } catch {
      // A failed or cancelled read keeps the last good value.
    } finally {
      clearTimeout(timer);
      release();
    }
  }

  /** Drops the oldest keys over `capacity`, never one being read. */
  function evict() {
    for (const [key, entry] of entries) {
      if (entries.size <= options.capacity) return;
      if (!entry.loading) entries.delete(key);
    }
  }

  return {
    /** Starts a read of `key` unless one is in flight, its value is fresh or the queue is full; resolves when it ends. */
    load(key: string): Promise<void> {
      let entry = entries.get(key);
      if (!entry) {
        entry = { value: null, at: 0, loading: null };
        entries.set(key, entry);
      }
      const queueFull = active >= options.maxActive && waiting.length >= options.maxWaiting;
      if (!entry.loading && now() - entry.at >= options.freshMs && !queueFull) {
        const current = entry;
        current.loading = refresh(key, current).finally(() => { current.loading = null; });
      }
      evict();
      return entry.loading ?? Promise.resolve();
    },
    /** The last good value of `key`, or `null` (never read, or older than `staleMs`). */
    get(key: string): T | null {
      const entry = entries.get(key);
      return entry && now() - entry.at < options.staleMs ? entry.value : null;
    },
    /** Reads in flight, reads waiting for a slot and keys held: what the limits bound. */
    stats: () => ({ active, waiting: waiting.length, keys: entries.size }),
  };
}
