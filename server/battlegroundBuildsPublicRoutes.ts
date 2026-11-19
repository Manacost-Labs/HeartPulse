import { Router } from 'express';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sendDatasetJsonCached } from './datasetCacheResponse.js';
import {
  battlegroundBuildsPublicEtag,
  projectBattlegroundBuildsPublic,
  PUBLIC_BUILD_LISTS,
  PUBLIC_BUILD_SOURCES,
  type PublicBattlegroundBuilds,
  type PublicBuildList,
} from './battlegroundBuildsPublicProjection.js';

type Entry = { body: PublicBattlegroundBuilds; etag: string; expiresAt: number };

export type BattlegroundBuildsRouterDependencies = {
  /** Raw tier list of the list's source, as the Battlegrounds service answers it (the list's own base range). */
  loadSource: (list: PublicBuildList) => Promise<unknown>;
  /** Where the last raw answer is kept across restarts; defaults to a folder under the system temp directory. */
  fallbackDir?: string | null;
  now?: () => number;
  onError?: (error: unknown) => void;
  retryAfterSeconds?: number;
};

const CACHE_HEADER = 'public, max-age=300, stale-while-revalidate=600';
const STALE_HEADER = 'public, max-age=60';
const CACHE_MS = 300_000;

/** The default loopback loader: the sources are named here, a caller of the open route cannot choose one. */
export function createBattlegroundBuildsLoader(options: { fetchImpl?: typeof fetch; timeoutMs?: number; baseUrl?: string } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (buildList: PublicBuildList): Promise<unknown> => {
    const url = new URL(options.baseUrl ?? 'http://127.0.0.1:3108/api/bg/tier-lists');
    url.searchParams.set('list', 'strategies');
    url.searchParams.set('source', PUBLIC_BUILD_SOURCES[buildList]);
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
      headers: { Accept: 'application/json', 'User-Agent': 'HearthPulse/BattlegroundBuilds' },
    });
    if (!response.ok) throw new Error(`Battleground tier list HTTP ${response.status}`);
    return response.json();
  };
}

/**
 * `GET /bg/tier-lists/public?list=compositions|strategies`: the open builds.
 * The source and its rating range are fixed by the server (`source`, `mmr` and
 * `timeRange` in the request are a 400). Each list has a store of its own (the
 * last good projection) and an ETag. A failing source answers, in this order,
 * the stored projection (`warning: "stale"`), the last raw answer kept on disk
 * and projected again (`warning: "fallback"`), and else a 503 with `Retry-After`.
 */
export function createBattlegroundBuildsRouter(dependencies: BattlegroundBuildsRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const store = new Map<PublicBuildList, Entry>();
  const inFlight = new Map<PublicBuildList, Promise<Entry>>();
  const dir = dependencies.fallbackDir === undefined ? join(tmpdir(), 'hearthpulse-bg-builds-public') : dependencies.fallbackDir;
  const file = (list: PublicBuildList) => (dir ? join(dir, `${list}.json`) : null);

  const keepRaw = (list: PublicBuildList, raw: unknown) => {
    const target = file(list);
    if (!dir || !target) return;
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(`${target}.tmp`, JSON.stringify(raw), { mode: 0o600 });
      renameSync(`${target}.tmp`, target);
    } catch { /* the copy on disk is best-effort */ }
  };
  const readRaw = (list: PublicBuildList): unknown => {
    const target = file(list);
    if (!target) return null;
    try { return JSON.parse(readFileSync(target, 'utf8')); } catch { return null; }
  };

  const refresh = (list: PublicBuildList): Promise<Entry> => {
    const running = inFlight.get(list);
    if (running) return running;
    const request = (async (): Promise<Entry> => {
      const raw = await dependencies.loadSource(list);
      const body = projectBattlegroundBuildsPublic(raw, list);
      if (!body) throw new Error('Empty public builds projection');
      const entry = { body, etag: battlegroundBuildsPublicEtag(body), expiresAt: now() + CACHE_MS };
      store.set(list, entry);
      keepRaw(list, raw);
      return entry;
    })().finally(() => inFlight.delete(list));
    inFlight.set(list, request);
    return request;
  };

  router.get('/bg/tier-lists/public', async (request, response) => {
    response.set('X-Robots-Tag', 'noindex, nofollow');
    const rawList = request.query.list;
    if (request.query.source !== undefined || request.query.mmr !== undefined || request.query.timeRange !== undefined
      || typeof rawList !== 'string' || !(PUBLIC_BUILD_LISTS as readonly string[]).includes(rawList)) {
      response.set('Cache-Control', 'no-store');
      return response.status(400).json({ error: 'Only list=compositions|strategies is accepted' });
    }
    const key = rawList as PublicBuildList;
    const cached = store.get(key);
    if (cached && cached.expiresAt > now()) {
      return sendDatasetJsonCached(request, response, cached.body, cached.etag, CACHE_HEADER, 'memory');
    }
    try {
      const entry = await refresh(key);
      return sendDatasetJsonCached(request, response, entry.body, entry.etag, CACHE_HEADER, 'origin');
    } catch (error) {
      try { dependencies.onError?.(error); } catch { /* diagnostics are best-effort */ }
      if (cached) {
        const body = { ...cached.body, warning: 'stale' as const };
        return sendDatasetJsonCached(request, response, body, battlegroundBuildsPublicEtag(body), STALE_HEADER, 'memory-stale');
      }
      const fallback = projectBattlegroundBuildsPublic(readRaw(key), key, 'fallback');
      if (fallback) {
        return sendDatasetJsonCached(request, response, fallback, battlegroundBuildsPublicEtag(fallback), STALE_HEADER, 'fallback');
      }
      response.set('Cache-Control', 'no-store');
      response.set('Retry-After', String(dependencies.retryAfterSeconds ?? 60));
      return response.status(503).json({ error: 'Builds temporarily unavailable' });
    }
  });

  return router;
}
