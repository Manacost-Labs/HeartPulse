type JsonRecord = Record<string, unknown>;

/** The parts of the hs-data-api `hsreplay_arena` dataset read by the class and matchup endpoints. */
export type HsReplayArenaDataset = {
  classes: unknown[];
  matchups: unknown[];
  classesUpdatedAt: string | null;
  matchupsUpdatedAt: string | null;
};

export type HsReplayArenaDatasetSource = {
  url: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function firstString(...values: unknown[]): string | null {
  const found = values.find(value => typeof value === 'string');
  return typeof found === 'string' ? found : null;
}

/**
 * Validates the dataset envelope. Rows stay `unknown` because the arena
 * normalizers already validate every row; this only rejects a payload that is
 * not a dataset at all, so callers fall back instead of serving garbage.
 */
export function parseHsReplayArenaDataset(payload: unknown): HsReplayArenaDataset {
  const root = record(payload);
  if (!root) throw new Error('HSReplay arena dataset is not an object');
  const data = record(root.data);
  const structured = record(data?.structured) ?? record(root.structured) ?? {};
  return {
    classes: Array.isArray(structured.classes) ? structured.classes : [],
    matchups: Array.isArray(structured.matchups) ? structured.matchups : [],
    classesUpdatedAt: firstString(root.fetched_at, data?.updatedAt, data?.updated_at),
    matchupsUpdatedAt: firstString(root.fetched_at, data?.fetched_at),
  };
}

/**
 * Reads the dataset with a hard deadline that also covers the body. A timeout
 * rejects, and the winrate/matchup routers answer from their stale cache or
 * snapshot instead of holding the request open.
 */
export async function fetchHsReplayArenaDataset(source: HsReplayArenaDatasetSource): Promise<HsReplayArenaDataset> {
  const upstream = await (source.fetchImpl ?? fetch)(source.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    signal: AbortSignal.timeout(source.timeoutMs),
  });
  if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`);
  return parseHsReplayArenaDataset(await upstream.json());
}
