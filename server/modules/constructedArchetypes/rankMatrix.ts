type Format = 'standard' | 'wild';

/** Ranks of the site's meta filters, lowest first; ids are the Standard meta ranks. */
export const ARCHETYPE_MATRIX_RANKS = [
  { id: 'diamond', label: 'Алмаз 1–4' },
  { id: 'diamond_legend', label: 'Алмаз — Легенда' },
  { id: 'legend', label: 'Легенда' },
  { id: 'top_5k', label: 'Топ-5000' },
  { id: 'top_legend', label: 'Топ-1000' },
] as const;

/** Rolling windows shortest first, then the current expansion window and its Bans window. */
export const ARCHETYPE_MATRIX_PERIODS = [
  { id: 'past_day', label: 'Сутки' },
  { id: 'past_3_days', label: '3 дня' },
  { id: 'past_week', label: 'Неделя' },
  { id: 'past_2_weeks', label: '2 недели' },
  { id: 'past_30_days', label: '30 дней' },
  { id: 'black_empire', label: 'Тёмная империя' },
  { id: 'black_empire_ban', label: 'Баны' },
] as const;

/** Whose turn the games started on; split for the Bans window, the window the meta opens on. */
export const ARCHETYPE_MATRIX_COINS = [
  { id: 'going_first', label: 'Первым ходом' },
  { id: 'on_coin', label: 'С монеткой' },
] as const;
const COIN_PERIOD = 'black_empire_ban';

export type ArchetypeMatrixRank = (typeof ARCHETYPE_MATRIX_RANKS)[number]['id'];
export type ArchetypeMatrixPeriod = (typeof ARCHETYPE_MATRIX_PERIODS)[number]['id'];
export type ArchetypeMatrixCoin = 'any_player' | (typeof ARCHETYPE_MATRIX_COINS)[number]['id'];

export type ArchetypeRankMatrixCell = { rank: string; period: string; winrate: number | null; games: number | null };
export type ArchetypeRankMatrix = {
  ranks: { id: string; label: string }[];
  periods: { id: string; label: string }[];
  cells: ArchetypeRankMatrixCell[];
  /** The same ranks in the Bans window by coin: `cells[].period` is the coin id. */
  coins: { period: string; columns: { id: string; label: string }[]; cells: ArchetypeRankMatrixCell[] };
  updatedAt: string | null;
};

type MetaSlice = { updatedAt?: unknown; items?: unknown };

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Winrate of one archetype in every rank × period slice of the HSGuru meta matrix.
 * Slices come from the injected (cached) meta reader; a slice that fails or lacks the
 * archetype leaves an empty cell instead of failing the whole matrix.
 */
export function createArchetypeRankMatrixLoader(
  loadSlice: (format: Format, rank: ArchetypeMatrixRank, period: ArchetypeMatrixPeriod, coin: ArchetypeMatrixCoin) => Promise<unknown>,
) {
  return async (format: Format, archetype: string): Promise<ArchetypeRankMatrix> => {
    const key = archetype.toLocaleLowerCase('en-US');
    const readCell = async (rank: ArchetypeMatrixRank, period: ArchetypeMatrixPeriod, coin: ArchetypeMatrixCoin, column: string) => {
      const slice = await loadSlice(format, rank, period, coin).catch(() => null) as MetaSlice | null;
      const items = Array.isArray(slice?.items) ? slice.items as Record<string, unknown>[] : [];
      const row = items.find(item => String(item.archetype ?? '').toLocaleLowerCase('en-US') === key);
      return {
        cell: { rank, period: column, winrate: finiteOrNull(row?.winrate), games: finiteOrNull(row?.games) },
        updatedAt: typeof slice?.updatedAt === 'string' ? slice.updatedAt : null,
      };
    };
    const [results, coinResults] = await Promise.all([
      Promise.all(ARCHETYPE_MATRIX_RANKS.flatMap(rank => ARCHETYPE_MATRIX_PERIODS.map(period =>
        readCell(rank.id, period.id, 'any_player', period.id)))),
      Promise.all(ARCHETYPE_MATRIX_RANKS.flatMap(rank => ARCHETYPE_MATRIX_COINS.map(coin =>
        readCell(rank.id, COIN_PERIOD, coin.id, coin.id)))),
    ]);
    if (results.every(result => result.updatedAt === null)) throw new Error('No meta slice is available');
    const updatedAt = results.map(result => result.updatedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    return {
      ranks: ARCHETYPE_MATRIX_RANKS.map(rank => ({ ...rank })),
      periods: ARCHETYPE_MATRIX_PERIODS.map(period => ({ ...period })),
      cells: results.map(result => result.cell),
      coins: { period: COIN_PERIOD, columns: ARCHETYPE_MATRIX_COINS.map(coin => ({ ...coin })), cells: coinResults.map(result => result.cell) },
      updatedAt,
    };
  };
}
