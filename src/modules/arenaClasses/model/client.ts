import { ARENA_CLASSES_TTL_MS, arenaClassesState, parseArenaClasses,
  type ArenaClassesData, type ArenaClassesState, type ArenaClassSource } from './state';

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Cached = { data: ArenaClassesData; ts: number; etag: string | null };
type Dependencies = { request: typeof fetch; storage?: StoragePort; now?: () => number };

export function createArenaClassesClient({ request, storage, now = Date.now }: Dependencies) {
  const remove = (key: string) => { try { storage?.removeItem(key); } catch { /* Optional browser storage. */ } };
  const read = (key: string): Cached | null => {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return null;
      const entry: unknown = JSON.parse(raw);
      if (!entry || typeof entry !== 'object' || !('data' in entry) || !('ts' in entry)) return null;
      const data = parseArenaClasses(entry.data);
      if (!data || typeof entry.ts !== 'number' || !Number.isFinite(entry.ts)
        || now() < entry.ts || now() - entry.ts > ARENA_CLASSES_TTL_MS) {
        remove(key);
        return null;
      }
      return { data, ts: entry.ts, etag: 'etag' in entry && typeof entry.etag === 'string' ? entry.etag : null };
    } catch { return null; }
  };
  const write = (key: string, entry: Cached) => {
    try { storage?.setItem(key, JSON.stringify(entry)); } catch { /* Rendering does not depend on storage availability. */ }
  };
  return {
    async load(accountId: string, source: ArenaClassSource, options: {
      signal?: AbortSignal; onCache?: (state: ArenaClassesState) => void;
    } = {}): Promise<ArenaClassesState> {
      if (!accountId) return { status: 'error', data: null };
      const key = `arena-classes:v3:${encodeURIComponent(accountId)}:${source}`;
      const cached = read(key);
      if (cached) options.onCache?.(arenaClassesState(cached.data, now(), true));
      const url = `/api/winrates?source=${source}`;
      try {
        let response = await request(url, { cache: 'no-cache', signal: options.signal,
          ...(cached?.etag ? { headers: { 'If-None-Match': cached.etag } } : {}),
        });
        if (response.status === 304 && !cached) {
          response = await request(url, { cache: 'no-store', signal: options.signal });
        }
        if (response.status === 401 || response.status === 403) {
          remove(key);
          return { status: 'error', data: null };
        }
        if (!response.ok && response.status !== 304) throw new Error('Arena classes request failed');
        const data = response.status === 304 ? cached?.data : parseArenaClasses(await response.json());
        if (!data) throw new Error('Invalid Arena classes response');
        const stale = /stale|fallback/.test(response.headers.get('X-Data-Cache') ?? '');
        const confirmed = stale ? { ...data, warning: 'stale' } : data;
        write(key, { data: confirmed, ts: now(), etag: response.headers.get('ETag') ?? cached?.etag ?? null });
        return arenaClassesState(confirmed, now());
      } catch {
        return cached ? arenaClassesState(cached.data, now(), true) : { status: 'error', data: null };
      }
    },
  };
}
