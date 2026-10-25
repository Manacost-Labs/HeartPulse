type Format = 'standard' | 'wild';
type Snapshot = { format: Format; updatedAt: string | null };
type CacheOptions<T> = {
  /** `period` is absent for the source's default window. */
  read: (format: Format, period?: string) => Promise<T>;
  ttlMs: number;
  staleMs?: number;
  retryMs?: number;
  timeoutMs?: number;
  now?: () => number;
  onRefreshError?: (format: Format, error: unknown) => void;
};

/**
 * Shares source reads per format and period and serves a bounded last-good snapshot during
 * refresh. This stores source data only; HTTP access checks remain with callers.
 * clear() also invalidates pending work, so parser resets cannot resurrect it.
 */
export function createArchetypeCatalogCache<T extends Snapshot>({
  read, ttlMs, staleMs = 15 * 60_000, retryMs = 30_000, timeoutMs = 20_000,
  now = Date.now, onRefreshError,
}: CacheOptions<T>) {
  for (const duration of [ttlMs, staleMs, retryMs, timeoutMs]) {
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError('Invalid catalog cache duration');
  }
  if (ttlMs === 0 || timeoutMs === 0) throw new RangeError('Catalog TTL and timeout must be positive');
  const entries = new Map<string, { value: T; freshUntil: number; staleUntil: number }>();
  const failures = new Map<string, { error: unknown; retryAt: number }>();
  const jobs = new Map<string, { promise: Promise<T>; cancel: () => void }>();
  let generation = 0;

  function refresh(format: Format, period: string | undefined, key: string): Promise<T> {
    const existing = jobs.get(key);
    if (existing) return existing.promise;
    const startedGeneration = generation;
    let timer: ReturnType<typeof setTimeout>;
    let cancel!: () => void;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Archetype catalog source timed out')), timeoutMs);
      cancel = () => reject(new Error('Archetype catalog read invalidated'));
    });
    const promise = Promise.race([Promise.resolve().then(() => read(format, period)), deadline])
      .then(value => {
        if (startedGeneration !== generation) throw new Error('Archetype catalog read invalidated');
        if (value.format !== format) throw new Error('Archetype catalog format mismatch');
        const previous = entries.get(key)?.value;
        const previousAt = Date.parse(previous?.updatedAt ?? '');
        const nextAt = Date.parse(value.updatedAt ?? '');
        if (Number.isFinite(previousAt) && (!Number.isFinite(nextAt) || nextAt < previousAt)) {
          throw new Error('Archetype catalog source timestamp regressed');
        }
        const freshUntil = now() + ttlMs;
        entries.set(key, { value, freshUntil, staleUntil: freshUntil + staleMs });
        failures.delete(key);
        return value;
      })
      .catch(error => {
        if (startedGeneration === generation) {
          if (entries.has(key)) failures.set(key, { error, retryAt: now() + retryMs });
          onRefreshError?.(format, error);
        }
        throw error;
      })
      .finally(() => {
        clearTimeout(timer);
        if (jobs.get(key)?.promise === promise) jobs.delete(key);
      });
    jobs.set(key, { promise, cancel });
    return promise;
  }

  return {
    async load(format: Format, period?: string): Promise<T> {
      const key = period ? `${format}:${period}` : format;
      const cached = entries.get(key);
      const time = now();
      if (cached && cached.freshUntil > time) return cached.value;
      const failure = failures.get(key);
      if (cached && cached.staleUntil > time) {
        if (!failure || failure.retryAt <= time) void refresh(format, period, key).catch(() => undefined);
        return cached.value;
      }
      if (failure && failure.retryAt > time) throw failure.error;
      return refresh(format, period, key);
    },
    clear() {
      generation += 1;
      entries.clear();
      failures.clear();
      for (const job of jobs.values()) job.cancel();
      jobs.clear();
    },
  };
}
