/**
 * In-memory cache of admin section data, shared by every section of one tab.
 *
 * A section that was opened before shows its last answer at once and refreshes it in the
 * background once it is older than the caller's freshness window; concurrent readers of one key
 * share a single request. Nothing is persisted: admin data lives only in this tab's memory and is
 * gone after a reload.
 */
export interface AdminResourceSnapshot<T = unknown> {
  readonly data: T | undefined;
  readonly error: Error | null;
  /** A request for this key is running (first load or background refresh). */
  readonly fetching: boolean;
  /** When the current data arrived (epoch ms), or null before the first answer. */
  readonly updatedAt: number | null;
}

interface Entry {
  snapshot: AdminResourceSnapshot;
  inflight: Promise<void> | null;
  /** Invalidated: the next read asks the server even if the answer is young. */
  stale: boolean;
  listeners: Set<() => void>;
  /** The latest loader, so an invalidation can refresh a key that a mounted section reads. */
  load: (() => Promise<unknown>) | null;
}

const EMPTY: AdminResourceSnapshot = { data: undefined, error: null, fetching: false, updatedAt: null };

export interface AdminResourceStore {
  read(key: string): AdminResourceSnapshot;
  subscribe(key: string, listener: () => void): () => void;
  /** Starts a request unless the data is younger than `maxAgeMs` or a request is already running. */
  ensure(key: string, load: () => Promise<unknown>, maxAgeMs: number): Promise<void>;
  /** Always asks the server again; a running request is reused. */
  refresh(key: string, load: () => Promise<unknown>): Promise<void>;
  /** Marks every key with the prefix as stale and refreshes the ones a mounted section reads. */
  invalidate(prefix: string): void;
  /** Writes an answer the caller already has, e.g. the result of a mutation. */
  write(key: string, data: unknown): void;
}

export function createAdminResourceStore(now: () => number = Date.now): AdminResourceStore {
  const entries = new Map<string, Entry>();
  const entry = (key: string): Entry => {
    let found = entries.get(key);
    if (!found) {
      found = { snapshot: EMPTY, inflight: null, stale: false, listeners: new Set(), load: null };
      entries.set(key, found);
    }
    return found;
  };
  const update = (target: Entry, patch: Partial<AdminResourceSnapshot>) => {
    target.snapshot = { ...target.snapshot, ...patch };
    target.listeners.forEach(listener => listener());
  };
  const run = (key: string, load: () => Promise<unknown>): Promise<void> => {
    const target = entry(key);
    target.load = load;
    if (target.inflight) return target.inflight;
    update(target, { fetching: true });
    target.inflight = load().then(
      data => { target.stale = false; update(target, { data, error: null, fetching: false, updatedAt: now() }); },
      (error: unknown) => update(target, {
        error: error instanceof Error ? error : new Error(String(error)),
        fetching: false,
      }),
    ).finally(() => { target.inflight = null; });
    return target.inflight;
  };

  return {
    read: key => entries.get(key)?.snapshot ?? EMPTY,
    subscribe(key, listener) {
      const target = entry(key);
      target.listeners.add(listener);
      return () => { target.listeners.delete(listener); };
    },
    ensure(key, load, maxAgeMs) {
      const target = entry(key);
      target.load = load;
      const { updatedAt } = target.snapshot;
      if (target.inflight) return target.inflight;
      if (!target.stale && updatedAt !== null && now() - updatedAt < maxAgeMs) return Promise.resolve();
      return run(key, load);
    },
    refresh: run,
    invalidate(prefix) {
      for (const [key, target] of entries) {
        if (!key.startsWith(prefix)) continue;
        target.stale = true;
        const { load } = target;
        if (!target.listeners.size || !load) continue;
        // A request started before the change may answer with the old state: ask once more after it.
        if (target.inflight) void target.inflight.then(() => { target.stale = true; return run(key, load); });
        else void run(key, load);
      }
    },
    write(key, data) {
      const target = entry(key);
      target.stale = false;
      update(target, { data, error: null, updatedAt: now() });
    },
  };
}
