/**
 * The open statistics of the Battlegrounds library: the base slice (rating range «Топ 50%», current
 * patch) of every minion, as far as the owner opened it to guests and robots (E21): the average place
 * with and without the minion, its popularity and the sample. The impact, the combat win rate, the rounds,
 * the purchases, the board positions and the history stay on guarded routes.
 *
 * One projection for every reader of it: the listing route, the card route and the sitemap source. The
 * projection copies field by field, so a closed figure of the source row cannot reach a guest. The sample
 * threshold of hs-data-api (30 games) is kept: a minion below it has no figures, never a zero.
 */
export const LIBRARY_STATS_MMR = 'TOP_50_PERCENT';
export const LIBRARY_STATS_MIN_GAMES = 30;
const STATS_URL = 'http://127.0.0.1:3108/api/bg/library/minion-stats';

export type PublicLibraryMinionStats = {
  avgPlacementWith: number;
  avgPlacementWithout: number | null;
  popularity: number | null;
  gamesWith: number;
};

export type PublicLibraryStatsSlice = {
  mmr: typeof LIBRARY_STATS_MMR;
  /** Completion time of the run behind the figures, ISO. */
  updatedAt: string | null;
  source: 'HSReplay';
  byDbf: ReadonlyMap<number, PublicLibraryMinionStats>;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;
const place = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 8 ? round(value, 2) : null;
const percent = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? round(value, 2) : null;

/** One row of `GET /api/bg/library/minion-stats`; `null` below the sample threshold or for a broken row. */
export function projectLibraryMinionStats(rawRow: unknown): { dbfId: number; stats: PublicLibraryMinionStats } | null {
  const row = record(rawRow);
  const dbfId = Number(row?.dbf_id);
  const games = Number(row?.games_with_minion);
  const withMinion = place(row?.avg_placement_with);
  if (!row || !Number.isSafeInteger(dbfId) || dbfId <= 0 || withMinion === null
    || !Number.isSafeInteger(games) || games < LIBRARY_STATS_MIN_GAMES) return null;
  return { dbfId, stats: {
    avgPlacementWith: withMinion,
    avgPlacementWithout: place(row.avg_placement_without),
    popularity: percent(row.popularity),
    gamesWith: games,
  } };
}

/** The slice of the whole answer. Throws when the answer is not the base slice or has no minion at all. */
export function projectLibraryStatsSlice(payload: unknown): PublicLibraryStatsSlice {
  const root = record(payload);
  const run = record(root?.latest_run);
  if (!root || !Array.isArray(root.minions) || root.minions.length === 0) throw new Error('Library statistics answer has no minions');
  if (run?.mmr_percentile !== LIBRARY_STATS_MMR) throw new Error('Library statistics answer is not the base rating range');
  const byDbf = new Map<number, PublicLibraryMinionStats>();
  for (const raw of root.minions) {
    const projected = projectLibraryMinionStats(raw);
    if (projected) byDbf.set(projected.dbfId, projected.stats);
  }
  if (byDbf.size === 0) throw new Error('Library statistics answer has no minion above the sample');
  const completed = typeof run?.completed_at === 'string' ? run.completed_at : '';
  return { mmr: LIBRARY_STATS_MMR, source: 'HSReplay', byDbf,
    updatedAt: completed && Number.isFinite(Date.parse(completed)) ? new Date(completed).toISOString() : null };
}

export type LibraryStatsRead = { slice: PublicLibraryStatsSlice; stale: boolean };

export type LibraryStatsStoreOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Live window of a read, ms. hs-data-api refreshes the slice once a day. */
  ttlMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
  url?: string;
};

/**
 * The base slice with a live window, one deduplicated refresh and the last known good copy. `get` rejects
 * only when the source fails and there is no copy at all (a cold start with the source down): the route
 * then answers 503 with `Retry-After`, never a 200 without the figures a page counts as facts.
 */
export function createLibraryStatsStore(options: LibraryStatsStoreOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? 300_000;
  let entry: { slice: PublicLibraryStatsSlice; expiresAt: number } | null = null;
  let running: Promise<{ slice: PublicLibraryStatsSlice; expiresAt: number }> | null = null;
  const refresh = () => {
    if (running) return running;
    const timeoutMs = options.timeoutMs ?? 12_000;
    const controller = new AbortController();
    const read = (async () => {
      const response = await fetchImpl(options.url ?? STATS_URL, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'HearthPulse/BattlegroundLibraryStats' },
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Library statistics HTTP ${response.status}`); }
      return projectLibraryStatsSlice(await response.json());
    })();
    // The deadline also bounds a read that ignores the abort signal.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Library statistics deadline exceeded')); }, timeoutMs);
    });
    const request = Promise.race([read, deadline]).then(slice => {
      entry = { slice, expiresAt: now() + ttlMs };
      return entry;
    }).finally(() => { clearTimeout(timer); read.catch(() => undefined); running = null; });
    running = request;
    return request;
  };
  return {
    async get(): Promise<LibraryStatsRead> {
      if (entry && entry.expiresAt > now()) return { slice: entry.slice, stale: false };
      try {
        return { slice: (await refresh()).slice, stale: false };
      } catch (error) {
        try { options.onError?.(error); } catch { /* diagnostics are best-effort */ }
        if (!entry) throw error;
        return { slice: entry.slice, stale: true };
      }
    },
  };
}

export type LibraryStatsStore = ReturnType<typeof createLibraryStatsStore>;
