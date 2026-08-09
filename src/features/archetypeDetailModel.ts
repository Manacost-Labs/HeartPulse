export type MulliganSortKey =
  | 'hsreplay_rank'
  | 'keep_percentage'
  | 'opening_hand_winrate'
  | 'winrate_when_drawn'
  | 'winrate_when_played'
  | 'avg_turn_played_on'
  | 'times_presented_in_initial_cards'
  | 'times_card_played';

export type MulliganSort = {
  key: MulliganSortKey;
  direction: 'asc' | 'desc';
};

type SortableMulliganRow = {
  dbf_id: number;
} & Partial<Record<MulliganSortKey, number | null>>;

function sortableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sortMulliganRows<T extends SortableMulliganRow>(
  rows: readonly T[],
  sort: MulliganSort,
): T[] {
  return rows
    .map((row, index) => ({ row, index, value: sortableNumber(row[sort.key]) }))
    .sort((left, right) => {
      if (left.value === null && right.value === null) return left.index - right.index;
      if (left.value === null) return 1;
      if (right.value === null) return -1;
      const difference = left.value - right.value;
      if (difference !== 0) return sort.direction === 'asc' ? difference : -difference;
      return left.index - right.index;
    })
    .map(item => item.row);
}

export type HsguruCardStatSortKey =
  | 'mulliganImpact'
  | 'mulliganCount'
  | 'drawnImpact'
  | 'drawnCount'
  | 'keptImpact'
  | 'keptCount';

export type HsguruCardStatSort = {
  key: HsguruCardStatSortKey;
  direction: 'asc' | 'desc';
};

type SortableHsguruCardStat = {
  cardName: string;
} & Partial<Record<HsguruCardStatSortKey, number | null>>;

export function sortHsguruCardStats<T extends SortableHsguruCardStat>(
  rows: readonly T[],
  sort: HsguruCardStatSort,
): T[] {
  return rows
    .map((row, index) => ({ row, index, value: sortableNumber(row[sort.key]) }))
    .sort((left, right) => {
      if (left.value === null && right.value === null) {
        return left.row.cardName.localeCompare(right.row.cardName, 'ru') || left.index - right.index;
      }
      if (left.value === null) return 1;
      if (right.value === null) return -1;
      const difference = left.value - right.value;
      if (difference !== 0) return sort.direction === 'asc' ? difference : -difference;
      return left.row.cardName.localeCompare(right.row.cardName, 'ru') || left.index - right.index;
    })
    .map(item => item.row);
}

export function hsguruImpactTone(value: number | null): 'positive' | 'neutral' | 'negative' | 'unknown' {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (value > 0.25) return 'positive';
  if (value < -0.25) return 'negative';
  return 'neutral';
}

export function hsguruMatchupTone(winrate: number | null): 'favored' | 'even' | 'unfavored' | 'unknown' {
  if (winrate === null || !Number.isFinite(winrate)) return 'unknown';
  if (winrate >= 52) return 'favored';
  if (winrate >= 48) return 'even';
  return 'unfavored';
}

export type HsguruAnalysisState = 'ok' | 'partial' | 'error';
export type HsguruAnalysisSection = 'matchups' | 'cards';

export function hsguruAnalysisEmptyMessage(
  state: HsguruAnalysisState | null,
  section: HsguruAnalysisSection,
): string {
  const subject = section === 'matchups' ? 'матчапов' : 'статистики карт';
  if (state === 'error') {
    return `Последнее обновление завершилось ошибкой. Мы уже повторяем сбор ${subject}.`;
  }
  if (state === 'partial') {
    return section === 'matchups'
      ? 'HSGuru не вернул матчапы в последнем срезе. Данные появятся, когда у архетипа будет достаточная выборка.'
      : 'HSGuru не вернул статистику карт в последнем срезе. Данные появятся, когда у архетипа будет достаточная выборка.';
  }
  return section === 'matchups'
    ? 'Матчапы ещё не получены.'
    : 'Статистика карт ещё не получена.';
}
