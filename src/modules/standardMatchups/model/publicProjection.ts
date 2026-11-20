import { matchupArchetypeSlug } from './overview';
import type { StandardMatchupsClassKey, StandardMatchupsFormat } from './types';

/**
 * The open general slice of the matchup matrix: what `GET /api/standard/matchups/public`
 * answers, copied field by field. The ranks, the period list and the history of the
 * subscribers' answer are not read here, so none of it can reach the server HTML, the
 * RSC payload or the JSON-LD even if it arrived.
 */
export const PUBLIC_STANDARD_MATCHUPS_PATH = '/api/standard/matchups/public';
/** The only rank the open slice may carry. */
export const PUBLIC_STANDARD_MATCHUPS_RANK = 'all';
/** The archetypes printed in the server HTML; the rest of the slice loads in the browser. */
export const PUBLIC_STANDARD_MATCHUPS_HTML_LIMIT = 20;

const CLASS_KEYS = new Set(['deathknight', 'demonhunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue',
  'shaman', 'warlock', 'warrior']);

export type PublicStandardMatchupsArchetype = {
  name: string; label: string; slug: string | null; classKey: StandardMatchupsClassKey | null;
  /** Share of the source's games, as published: "9.6%". */
  popularity: string | null; games: number; winrate: number | null;
};
export type PublicStandardMatchupsPair = { winrate: number | null; games: number };
export type PublicStandardMatchups = {
  format: StandardMatchupsFormat;
  formatLabel: string;
  rankLabel: string;
  period: string | null;
  minGames: number;
  totalGames: number;
  sourceUrl: string;
  updatedAt: string | null;
  warning?: 'stale' | 'fallback';
  /** Rows and columns of the matrix, in the same order. */
  archetypes: PublicStandardMatchupsArchetype[];
  /** `pairs[row][column]`; `null` for a pair without games or below the floor. */
  pairs: Array<Array<PublicStandardMatchupsPair | null>>;
  /** The slice has more archetypes than this copy holds. */
  truncated: boolean;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const rate = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;

/**
 * `null` when the answer is not the open general slice of `format` or has no
 * matrix: the page then says the data is temporarily unavailable. At most `limit`
 * archetypes are kept (the most played first, as the server sent them).
 */
export function parsePublicStandardMatchups(
  raw: unknown, format: StandardMatchupsFormat, limit = Number.POSITIVE_INFINITY,
): PublicStandardMatchups | null {
  const data = record(raw);
  if (!data || data.format !== format || data.rank !== PUBLIC_STANDARD_MATCHUPS_RANK
    || !Array.isArray(data.columns) || !Array.isArray(data.rows)) return null;
  const columns = data.columns.flatMap(column => {
    const item = record(column);
    const name = text(item?.name);
    return item && name ? [{ name, item }] : [];
  });
  const rows = new Map(data.rows.flatMap(row => {
    const item = record(row);
    const archetype = text(item?.archetype);
    return item && archetype && Array.isArray(item.cells) ? [[archetype, item] as const] : [];
  }));
  const names = columns.map(column => column.name).filter(name => rows.has(name));
  if (!names.length) return null;
  const kept = names.slice(0, Math.max(1, limit));
  const keptSet = new Set(kept);
  const byName = new Map(columns.map(column => [column.name, column.item]));
  const archetypes: PublicStandardMatchupsArchetype[] = [];
  const pairs: Array<Array<PublicStandardMatchupsPair | null>> = [];
  for (const name of kept) {
    const column = byName.get(name);
    const row = rows.get(name);
    if (!column || !row) continue;
    const classKey = text(column.classKey) || text(row.classKey);
    archetypes.push({
      name, label: text(row.archetypeLabel) || text(column.label) || name, slug: matchupArchetypeSlug(name),
      classKey: CLASS_KEYS.has(classKey) ? classKey as StandardMatchupsClassKey : null,
      popularity: text(column.popularity) || null, games: count(column.games ?? row.games), winrate: rate(row.winrate),
    });
    const cells = new Map((row.cells as unknown[]).flatMap(cell => {
      const item = record(cell);
      const opponent = text(item?.opponent);
      return item && keptSet.has(opponent) ? [[opponent, item] as const] : [];
    }));
    pairs.push(kept.map((opponent): PublicStandardMatchupsPair | null => {
      const cell = cells.get(opponent);
      const games = count(cell?.games);
      return cell && games > 0 ? { winrate: rate(cell.winrate), games } : null;
    }));
  }
  const updatedAt = text(data.updatedAt);
  const warning = data.warning === 'stale' || data.warning === 'fallback' ? data.warning : undefined;
  return {
    format, formatLabel: text(data.formatLabel), rankLabel: text(data.rankLabel),
    period: text(data.period) || null, minGames: count(data.minGames), totalGames: count(data.totalGames),
    sourceUrl: text(data.sourceUrl), updatedAt: Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
    ...(warning ? { warning } : {}), archetypes, pairs, truncated: names.length > kept.length,
  };
}

/** The open slice for the browser; `null` on any failure, so the page keeps what it has. */
export async function loadPublicStandardMatchups(format: StandardMatchupsFormat, options: {
  request?: typeof fetch; signal?: AbortSignal;
} = {}): Promise<PublicStandardMatchups | null> {
  const { request = fetch, signal } = options;
  try {
    const response = await request(`${PUBLIC_STANDARD_MATCHUPS_PATH}?format=${format}`, { credentials: 'omit', signal });
    if (!response.ok) return null;
    return parsePublicStandardMatchups(await response.json(), format);
  } catch { return null; }
}
