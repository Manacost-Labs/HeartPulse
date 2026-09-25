import { parseStandardMatchups, standardMatchupsState, type StandardMatchupsState } from './state';
import type { StandardMatchupsData, StandardMatchupsFormat } from './types';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Cached = { data: StandardMatchupsData; ts: number; etag: string | null };
type Dependencies = { request: typeof fetch; storage?: StoragePort; now?: () => number };

/** Keep subscribed matchups isolated by account and format. */
export function createStandardMatchupsClient({ request, storage, now = Date.now }: Dependencies) {
  const remove = (key: string) => { try { storage?.removeItem(key); } catch { /* Optional storage. */ } };
  const read = (key: string, format: StandardMatchupsFormat): Cached | null => {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return null;
      const entry: unknown = JSON.parse(raw);
      if (!entry || typeof entry !== 'object' || !('data' in entry) || !('ts' in entry)) return null;
      const data = parseStandardMatchups(entry.data, format);
      if (!data || typeof entry.ts !== 'number' || !Number.isFinite(entry.ts)
        || now() < entry.ts || now() - entry.ts > CACHE_TTL_MS) {
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
    async load(accountId: string, format: StandardMatchupsFormat, options: {
      signal?: AbortSignal; bust?: boolean; onCache?: (state: StandardMatchupsState) => void;
    } = {}): Promise<StandardMatchupsState> {
      if (!accountId) return { status: 'error', data: null };
      const key = `standard-matchups:v8:${encodeURIComponent(accountId)}:${format}`;
      const cached = read(key, format);
      if (cached && !options.bust) options.onCache?.(standardMatchupsState(cached.data));
      const baseUrl = `/api/standard/matchups?format=${format}`;
      const url = options.bust ? `${baseUrl}&t=${now()}` : baseUrl;
      try {
        let response = await request(url, { cache: options.bust ? 'no-store' : 'no-cache',
          credentials: 'same-origin', signal: options.signal,
          ...(!options.bust && cached?.etag ? { headers: { 'If-None-Match': cached.etag } } : {}),
        });
        if (response.status === 304 && !cached) {
          response = await request(baseUrl, { cache: 'no-store', credentials: 'same-origin',
            signal: options.signal });
        }
        if (response.status === 401 || response.status === 403) {
          remove(key);
          return { status: 'error', data: null };
        }
        if (!response.ok && response.status !== 304) throw new Error('Standard matchups request failed');
        const data = response.status === 304 ? cached?.data
          : parseStandardMatchups(await response.json(), format);
        if (!data) throw new Error('Invalid Standard matchups response');
        const stale = /stale|fallback/.test(response.headers.get('X-Data-Cache') ?? '');
        const confirmed = stale ? { ...data, warning: 'stale' } : data;
        write(key, { data: confirmed, ts: now(), etag: response.headers.get('ETag') ?? cached?.etag ?? null });
        return standardMatchupsState(confirmed, stale);
      } catch {
        return cached ? standardMatchupsState({ ...cached.data, warning: 'stale' }, true)
          : { status: 'error', data: null };
      }
    },
  };
}
