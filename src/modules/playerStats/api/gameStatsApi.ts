import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import type { GameStatsModes, PlayerStats, PlayerStatsMode, PlayerStatsQuery } from '../model/stats';

const MODES: PlayerStatsMode[] = ['battlegrounds', 'standard', 'wild', 'arena'];

export class GameStatsSignedOutError extends Error {
  constructor() {
    super('Войдите, чтобы увидеть свою статистику');
    this.name = 'GameStatsSignedOutError';
  }
}

/** The statistics endpoint of the own account, or of a public profile when its ID is given. */
function statsBase(publicProfileId?: string | null): string {
  return publicProfileId ? `/api/profiles/${encodeURIComponent(publicProfileId)}/game-stats` : '/api/account/game-stats';
}

export function gameStatsUrl(query: PlayerStatsQuery, publicProfileId?: string | null): string {
  const params = new URLSearchParams({ mode: query.mode, period: query.period });
  if (query.mode === 'battlegrounds') {
    params.set('duos', query.duos ? '1' : '0');
    params.set('mmr', query.mmr);
  }
  return `${statsBase(publicProfileId)}?${params}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Keeps only answers shaped for the requested mode; anything else is treated
 * as a failure instead of rendering a half-empty page from a wrong shape.
 */
export function gameStatsFromPayload(payload: unknown, mode: PlayerStatsQuery['mode']): PlayerStats | null {
  if (!isRecord(payload) || payload.mode !== mode || !Number.isSafeInteger(payload.games)
    || !isRecord(payload.summary) || !isRecord(payload.global)) return null;
  if (mode === 'battlegrounds' && (!Array.isArray(payload.ratingSeries) || !Array.isArray(payload.heroes) || !isRecord(payload.cards))) return null;
  if ((mode === 'standard' || mode === 'wild') && (!Array.isArray(payload.decks) || !Array.isArray(payload.rankSeries))) return null;
  if (mode === 'arena' && (!Array.isArray(payload.runs) || !Array.isArray(payload.classes))) return null;
  // «Последние игры» came later (plan 2.3): an older server answer simply has none.
  return { ...payload, recentGames: Array.isArray(payload.recentGames) ? payload.recentGames : [] } as PlayerStats;
}

export async function fetchGameStats(query: PlayerStatsQuery, signal?: AbortSignal, publicProfileId?: string | null): Promise<PlayerStats> {
  const response = await fetchWithDeadline(gameStatsUrl(query, publicProfileId), { signal, headers: { Accept: 'application/json' } });
  if (response.status === 401) throw new GameStatsSignedOutError();
  const payload: unknown = await response.json().catch(() => null);
  const stats = response.ok ? gameStatsFromPayload(payload, query.mode) : null;
  if (!stats) throw new Error('Не удалось загрузить статистику. Повторите позже.');
  return stats;
}

const count = (value: unknown): number => (Number.isSafeInteger(value) ? Number(value) : 0);

/**
 * Games per tab and per Battlegrounds queue, or `null` when the account has
 * none to show: the statistics are switched off on this deployment (404), the
 * visitor is signed out or the request failed. The page then shows no
 * statistics section at all. `queues` is null when the server sent no queue
 * counts (an older server).
 */
export async function fetchGameStatsModes(signal?: AbortSignal, publicProfileId?: string | null): Promise<GameStatsModes | null> {
  try {
    const response = await fetchWithDeadline(`${statsBase(publicProfileId)}/modes`, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const payload: unknown = await response.json().catch(() => null);
    if (!isRecord(payload) || !isRecord(payload.modes)) return null;
    const modes = payload.modes;
    const counts = Object.fromEntries(MODES.map(mode => [mode, count(modes[mode])])) as Record<PlayerStatsMode, number>;
    if (!Object.values(counts).some(value => value > 0)) return null;
    const queues = payload.battlegroundsQueues;
    return { counts, queues: isRecord(queues) ? { solo: count(queues.solo), duos: count(queues.duos) } : null };
  } catch {
    return null;
  }
}
