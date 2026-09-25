import { arenaLegendariesState, parseArenaLegendaries, type ArenaLegendariesState } from './state';
import type { LegendariesData, LegendarySource } from './types';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Cached = { data: LegendariesData; ts: number; etag: string | null };
type Dependencies = { request: typeof fetch; storage?: StoragePort; now?: () => number };

/** Cache protected groups per account and source; clear them after access revocation. */
export function createArenaLegendariesClient({ request, storage, now = Date.now }: Dependencies) {
  const remove = (key: string) => { try { storage?.removeItem(key); } catch { /* Optional storage. */ } };
  const read = (key: string): Cached | null => {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return null;
      const entry: unknown = JSON.parse(raw);
      if (!entry || typeof entry !== 'object' || !('data' in entry) || !('ts' in entry)) return null;
      const data = parseArenaLegendaries(entry.data);
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
    async load(accountId: string, source: LegendarySource, options: {
      signal?: AbortSignal; bust?: boolean; onCache?: (state: ArenaLegendariesState) => void;
    } = {}): Promise<ArenaLegendariesState> {
      if (!accountId) return { status: 'error', data: null };
      const key = `arena-legendaries:v4:${encodeURIComponent(accountId)}:${source}`;
      const cached = read(key);
      if (cached && !options.bust) options.onCache?.(arenaLegendariesState(cached.data));
      const baseUrl = `/api/legendaries?source=${source}&v=ru_cards_v4`;
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
          return { status: 'denied', data: null };
        }
        if (!response.ok && response.status !== 304) throw new Error('Arena legendaries request failed');
        const data = response.status === 304 ? cached?.data : parseArenaLegendaries(await response.json());
        if (!data) throw new Error('Invalid Arena legendaries response');
        const stale = /stale|fallback/.test(response.headers.get('X-Data-Cache') ?? '');
        const confirmed = stale ? { ...data, warning: 'stale' } : data;
        write(key, { data: confirmed, ts: now(), etag: response.headers.get('ETag') ?? cached?.etag ?? null });
        return arenaLegendariesState(confirmed, stale);
      } catch {
        return cached ? arenaLegendariesState({ ...cached.data, warning: 'stale' }, true)
          : { status: 'error', data: null };
      }
    },
  };
}
