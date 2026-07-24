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
