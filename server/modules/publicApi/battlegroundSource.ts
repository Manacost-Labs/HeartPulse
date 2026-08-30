import type { PublicBattlegroundStatisticsSource } from './battlegroundStatistics.js';
import { fetchHsReplayStrategyPayload } from './hsreplayStrategySource.js';

const LOCAL_BATTLEGROUNDS_ORIGIN = 'http://127.0.0.1:3108';
const REQUEST_TIMEOUT_MS = 20_000;

async function fetchLocalJson(
  path: string,
  query: Record<string, string | null> = {},
): Promise<unknown> {
  const url = new URL(path, LOCAL_BATTLEGROUNDS_ORIGIN);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Manacost-Public-API/1.0' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Battlegrounds source returned HTTP ${response.status}`);
  return response.json();
}

/**
 * Connects the public serializer to fixed loopback-only Battlegrounds
 * endpoints. Callers cannot influence the origin or path, preventing SSRF.
 */
export function createLocalBattlegroundStatisticsSource(): PublicBattlegroundStatisticsSource {
  return {
    loadHeroes: selection => fetchLocalJson('/api/bg/heroes', {
      mode: selection.mode,
      mmr: selection.mmr,
      timeRange: selection.timeRange,
    }),
    loadHeroDetails: (heroId, selection) => fetchLocalJson(
      `/api/bg/heroes/${encodeURIComponent(heroId)}/details`,
      {
        mode: selection.mode,
        mmr: selection.mmr,
        timeRange: selection.timeRange,
      },
    ),
    loadMinions: () => fetchLocalJson('/api/bg/library/minion-stats'),
    loadMinionHistory: dbfId => fetchLocalJson(
      `/api/bg/library/minions/${encodeURIComponent(dbfId)}/history`,
    ),
    loadSpells: () => fetchLocalJson('/api/bg/library/spell-stats'),
    loadTierLists: selection => selection.kind === 'strategies' && selection.source === 'hsreplay'
      ? fetchHsReplayStrategyPayload()
      : fetchLocalJson('/api/bg/tier-lists', {
        list: selection.kind,
        source: selection.source,
        mmr: selection.mmr,
        timeRange: selection.timeRange,
      }),
  };
}
