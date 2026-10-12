const CATALOG_TTL_MS = 5 * 60_000;
const MAX_CATALOGS = 20;

/** Browser-only reuse; a viewer change discards both cached and pending reads. */
export function createBattlegroundLibraryResource<T>(
  loadCatalog: (kind: string, pool: string) => Promise<T>,
  now: () => number = Date.now,
) {
  let currentScope = '';
  let generation = 0;
  const entries = new Map<string, { data: T; expiresAt: number }>();
  const pending = new Map<string, Promise<T>>();
  const selectScope = (scope: string) => {
    if (scope === currentScope) return;
    currentScope = scope;
    generation++;
    entries.clear();
    pending.clear();
  };
  const peek = (scope: string, kind: string, pool: string): T | null => {
    selectScope(scope);
    const entry = entries.get(`${kind}:${pool}`);
    return entry && entry.expiresAt > now() ? entry.data : null;
  };
  return {
    peek,
    load(scope: string, kind: string, pool: string): Promise<T> {
      const cached = peek(scope, kind, pool);
      if (cached !== null) return Promise.resolve(cached);
      const key = `${kind}:${pool}`;
      const existing = pending.get(key);
      if (existing) return existing;
      const requestGeneration = generation;
      const request = loadCatalog(kind, pool).then(data => {
        if (generation === requestGeneration) {
          const oldestKey = entries.keys().next().value;
          if (entries.size >= MAX_CATALOGS && oldestKey !== undefined) entries.delete(oldestKey);
          entries.set(key, { data, expiresAt: now() + CATALOG_TTL_MS });
        }
        return data;
      }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
      pending.set(key, request);
      return request;
    },
  };
}
