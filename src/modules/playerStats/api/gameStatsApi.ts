import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import type { PlayerStats, PlayerStatsMode, PlayerStatsQuery } from '../model/stats';

const MODES: PlayerStatsMode[] = ['battlegrounds', 'standard', 'wild', 'arena'];

export class GameStatsSignedOutError extends Error {
  constructor() {
    super('Войдите, чтобы увидеть свою статистику');
    this.name = 'GameStatsSignedOutError';
  }
}

export function gameStatsUrl(query: PlayerStatsQuery): string {
  const params = new URLSearchParams({ mode: query.mode, period: query.period });
  if (query.mode === 'battlegrounds') {
    params.set('duos', query.duos ? '1' : '0');
    params.set('mmr', query.mmr);
  }
  return `/api/account/game-stats?${params}`;
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
  return payload as PlayerStats;
}

export async function fetchGameStats(query: PlayerStatsQuery, signal?: AbortSignal): Promise<PlayerStats> {
  const response = await fetchWithDeadline(gameStatsUrl(query), { signal, headers: { Accept: 'application/json' } });
  if (response.status === 401) throw new GameStatsSignedOutError();
  const payload: unknown = await response.json().catch(() => null);
  const stats = response.ok ? gameStatsFromPayload(payload, query.mode) : null;
  if (!stats) throw new Error('Не удалось загрузить статистику. Повторите позже.');
  return stats;
}

/**
 * Version 2 events per tab, or `null` when the account has none to show: the
 * statistics are switched off on this deployment (404), the visitor is signed
 * out or the request failed. The page then shows no statistics section at all.
 */
export async function fetchGameStatsModes(signal?: AbortSignal): Promise<Record<PlayerStatsMode, number> | null> {
  try {
    const response = await fetchWithDeadline('/api/account/game-stats/modes', { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const payload: unknown = await response.json().catch(() => null);
    const modes = isRecord(payload) && isRecord(payload.modes) ? payload.modes : null;
    if (!modes) return null;
    const counts = Object.fromEntries(MODES.map(mode => [mode, Number.isSafeInteger(modes[mode]) ? Number(modes[mode]) : 0]));
    return Object.values(counts).some(count => count > 0) ? counts as Record<PlayerStatsMode, number> : null;
  } catch {
    return null;
  }
}
