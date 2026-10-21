/**
 * "Лучшие колоды" on the home page: the public top three of the HSGuru meta
 * (`/api/standard-meta/teaser`, Diamond–Legend, 100+ games), ranked by win
 * rate. The change of a deck is its place against the top three of the next,
 * wider window: a deck absent there was fourth or lower, so it has risen.
 */
export type WeeklyDecksPeriod = 'past_day' | 'past_3_days' | 'past_week';

export const WEEKLY_DECKS_PERIODS: { value: WeeklyDecksPeriod; label: string; title: string; wider: string; widerLabel: string }[] = [
  { value: 'past_day', label: 'Сутки', title: 'Лучшие колоды за сутки', wider: 'past_3_days', widerLabel: '3 дня' },
  { value: 'past_3_days', label: '3 дня', title: 'Лучшие колоды за 3 дня', wider: 'past_week', widerLabel: 'неделю' },
  { value: 'past_week', label: 'Неделя', title: 'Лучшие колоды недели', wider: 'past_2_weeks', widerLabel: '2 недели' },
];

export type WeeklyDeckSource = {
  slug: string;
  archetypeLabel: string;
  classKey: string | null;
  winrate: number | null;
  games: number | null;
};

export type WeeklyDeckRow = WeeklyDeckSource & {
  place: number;
  /** Place in the wider window's top three; `null` when the deck was not in it. */
  widerPlace: number | null;
  trend: 'up' | 'down' | 'flat' | null;
};

/** The guest teaser request of one period (the slice the server prewarms). */
export function weeklyDecksPath(period: string): string {
  const params = new URLSearchParams({ format: 'standard', rank: 'diamond_legend', coin: 'any_player', min_games: '100', period });
  return `/api/standard-meta/teaser?${params}`;
}

/** The teaser's decks by win rate, best first, with the fields the board needs; malformed items are dropped. */
export function weeklyDeckItems(payload: unknown): WeeklyDeckSource[] {
  const items = (payload as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap(item => {
    if (!item || typeof item.slug !== 'string' || typeof item.archetypeLabel !== 'string') return [];
    const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
    return [{ slug: item.slug, archetypeLabel: item.archetypeLabel,
      classKey: typeof item.classKey === 'string' ? item.classKey : null,
      winrate: number(item.winrate), games: number(item.games) }];
  }).sort((left, right) => (right.winrate ?? -1) - (left.winrate ?? -1)).slice(0, 3);
}

/** Ranks the current top three; without the wider window (`null`) no trend is claimed. */
export function weeklyDeckRows(current: WeeklyDeckSource[], wider: WeeklyDeckSource[] | null): WeeklyDeckRow[] {
  return current.map((deck, index) => {
    const place = index + 1;
    if (!wider) return { ...deck, place, widerPlace: null, trend: null };
    const at = wider.findIndex(item => item.slug === deck.slug);
    const widerPlace = at === -1 ? null : at + 1;
    const trend = widerPlace === null || widerPlace > place ? 'up' : widerPlace < place ? 'down' : 'flat';
    return { ...deck, place, widerPlace, trend };
  });
}
