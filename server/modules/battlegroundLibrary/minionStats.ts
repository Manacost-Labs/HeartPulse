import { Router, type RequestHandler } from 'express';
import {
  hasBattlegroundMinionStats,
  parseBattlegroundMinionStats,
  type BattlegroundMinionStats,
} from './minionStatsContract.js';

export type BattlegroundMinionStatsRead =
  | { status: 'ok'; stats: BattlegroundMinionStats }
  | { status: 'missing' };

type SourceOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** hs-data-api refreshes the slice once a day; an hour keeps the page close to it. */
  ttlMs?: number;
  missingTtlMs?: number;
  timeoutMs?: number;
  maxEntries?: number;
  now?: () => number;
};

type Entry = { value: BattlegroundMinionStatsRead; expiresAt: number };

/**
 * Cached reader of hs-data-api minion statistics (default slice: MMR top 50%,
 * last 7 days). Concurrent reads of one key share a request; failures are not
 * cached, so the next visit retries. Rejects on network, HTTP 5xx and contract errors.
 */
export function createBattlegroundMinionStatsSource({
  baseUrl, fetchImpl = fetch, ttlMs = 60 * 60_000, missingTtlMs = 10 * 60_000,
  timeoutMs = 8_000, maxEntries = 600, now = Date.now,
}: SourceOptions) {
  const origin = baseUrl.replace(/\/+$/, '');
  const entries = new Map<string, Entry>();
  const jobs = new Map<string, Promise<BattlegroundMinionStatsRead>>();

  async function fetchStats(dbfId: number, composition: number): Promise<BattlegroundMinionStatsRead> {
    const url = new URL(`${origin}/v1/battlegrounds/minions/${dbfId}/stats`);
    if (composition) url.searchParams.set('composition', String(composition));
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) return { status: 'missing' };
    if (!response.ok) throw new Error(`hs-data-api minion stats HTTP ${response.status}`);
    const payload = await response.json() as { data?: unknown };
    const stats = parseBattlegroundMinionStats(payload?.data);
    if (stats.minion.dbfId !== dbfId) throw new Error('hs-data-api minion stats returned another minion');
    return hasBattlegroundMinionStats(stats) ? { status: 'ok', stats } : { status: 'missing' };
  }

  return {
    read(dbfId: number, composition = 0): Promise<BattlegroundMinionStatsRead> {
      const key = `${dbfId}:${composition}`;
      const cached = entries.get(key);
      if (cached && cached.expiresAt > now()) return Promise.resolve(cached.value);
      const running = jobs.get(key);
      if (running) return running;
      const job = fetchStats(dbfId, composition).then(value => {
        entries.delete(key);
        if (entries.size >= maxEntries) entries.delete(entries.keys().next().value as string);
        entries.set(key, { value, expiresAt: now() + (value.status === 'ok' ? ttlMs : missingTtlMs) });
        return value;
      }).finally(() => { jobs.delete(key); });
      jobs.set(key, job);
      return job;
    },
  };
}

type RouterDependencies = {
  requireAccess: RequestHandler;
  read: (dbfId: number, composition: number) => Promise<BattlegroundMinionStatsRead>;
  onError?: (error: unknown) => void;
};

/** `GET /bg/library/minions/:dbfId/stats[?composition=N]` for subscribers; mounted under `/api`. */
export function createBattlegroundMinionStatsRouter({ requireAccess, read, onError }: RouterDependencies): Router {
  const router = Router();
  router.get('/bg/library/minions/:dbfId/stats', requireAccess, async (request, response) => {
    response.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    const dbfId = Number(request.params.dbfId);
    const rawComposition = request.query.composition ?? '0';
    const composition = Number(rawComposition);
    if (!/^[1-9][0-9]{0,8}$/.test(request.params.dbfId)
      || typeof rawComposition !== 'string' || !/^(0|[1-9][0-9]{0,3})$/.test(rawComposition)) {
      return response.status(400).json({ error: 'Invalid minion or composition' });
    }
    try {
      const result = await read(dbfId, composition);
      if (result.status === 'missing') return response.status(404).json({ error: 'No statistics for this minion' });
      return response.json(result.stats);
    } catch (error) {
      try { onError?.(error); } catch { /* Diagnostics cannot replace the upstream error. */ }
      return response.status(502).json({ error: 'Minion statistics temporarily unavailable' });
    }
  });
  return router;
}
