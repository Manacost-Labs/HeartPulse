import { arenaTierListState, parseArenaTierList, type ArenaTierListState } from './state';
import { TIERLIST_CACHE_TTL_MS, tierlistBaseUrl } from './urls';
import type { TierlistData, TierlistSource } from './types';

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Cached = { data: TierlistData; ts: number; etag: string | null };
type Dependencies = { request: typeof fetch; storage?: StoragePort; now?: () => number };

/** Cache protected snapshots per account and source; never reuse them after an access denial. */
export function createArenaTierListClient({ request, storage, now = Date.now }: Dependencies) {
  const remove = (key: string) => { try { storage?.removeItem(key); } catch { /* Optional storage. */ } };
  const read = (key: string): Cached | null => {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return null;
      const entry: unknown = JSON.parse(raw);
      if (!entry || typeof entry !== 'object' || !('data' in entry) || !('ts' in entry)) return null;
      const data = parseArenaTierList(entry.data);
      if (!data || typeof entry.ts !== 'number' || !Number.isFinite(entry.ts)
        || now() < entry.ts || now() - entry.ts > TIERLIST_CACHE_TTL_MS) {
        remove(key);
        return null;
      }
      return { data, ts: entry.ts, etag: 'etag' in entry && typeof entry.etag === 'string' ? entry.etag : null };
    } catch { return null; }
  };
  const write = (key: string, entry: Cached) => {
    try { storage?.setItem(key, JSON.stringify(entry)); } catch { /* Storage is optional. */ }
  };
  return {
    async load(accountId: string, source: TierlistSource, options: {
      signal?: AbortSignal; bust?: boolean; onCache?: (state: ArenaTierListState) => void;
    } = {}): Promise<ArenaTierListState> {
      if (!accountId) return { status: 'error', data: null };
      const key = `arena-tierlist:v4:${encodeURIComponent(accountId)}:${source}`;
      const cached = read(key);
      if (cached && !options.bust) options.onCache?.(arenaTierListState(cached.data));
      const baseUrl = tierlistBaseUrl(source);
      const url = options.bust ? `${baseUrl}&t=${now()}` : baseUrl;
      try {
        let response = await request(url, { cache: options.bust ? 'no-store' : 'no-cache',
          signal: options.signal,
          ...(!options.bust && cached?.etag ? { headers: { 'If-None-Match': cached.etag } } : {}),
        });
        if (response.status === 304 && !cached) {
          response = await request(baseUrl, { cache: 'no-store', signal: options.signal });
        }
        if (response.status === 401 || response.status === 403) {
          remove(key);
          return { status: 'error', data: null };
        }
        if (!response.ok && response.status !== 304) throw new Error('Arena tier-list request failed');
        const data = response.status === 304 ? cached?.data : parseArenaTierList(await response.json());
        if (!data) throw new Error('Invalid Arena tier-list response');
        const stale = /stale|fallback/.test(response.headers.get('X-Data-Cache') ?? '');
        const confirmed = stale ? { ...data, warning: 'stale' } : data;
        write(key, { data: confirmed, ts: now(), etag: response.headers.get('ETag') ?? cached?.etag ?? null });
        return arenaTierListState(confirmed, stale);
      } catch {
        return cached ? arenaTierListState(cached.data, true) : { status: 'error', data: null };
      }
    },
  };
}
