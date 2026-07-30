import type { PublicBattlegroundStatisticsSource } from './battlegroundStatistics.js';

const LOCAL_BATTLEGROUNDS_ORIGIN = 'http://127.0.0.1:3108';
const REQUEST_TIMEOUT_MS = 20_000;

async function fetchLocalJson(path: string): Promise<unknown> {
  const response = await fetch(new URL(path, LOCAL_BATTLEGROUNDS_ORIGIN), {
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
    loadHeroes: () => fetchLocalJson('/api/bg/heroes'),
    loadMinions: () => fetchLocalJson('/api/bg/library/minion-stats'),
    loadTierLists: () => fetchLocalJson('/api/bg/tier-lists'),
  };
}
