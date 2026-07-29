import {
  CONSTRUCTED_CARD_PERIOD_OPTIONS,
  CONSTRUCTED_CARD_RANK_OPTIONS,
  type ConstructedCardPeriod,
  type ConstructedCardRank,
} from './constructedCardPeriods';

export type ConstructedCardFormat = 'standard' | 'wild';

export type ConstructedCardCatalogFilters = {
  query: string;
  class: string;
  set: string;
  mana: string;
  attack: string;
  health: string;
  mechanic: string;
  type: string;
  rarity: string;
  sort: string;
  direction: 'asc' | 'desc';
};

export type ConstructedCardCatalogContext = {
  format: ConstructedCardFormat;
  period: ConstructedCardPeriod;
  rank: ConstructedCardRank;
};

export const EMPTY_CONSTRUCTED_CARD_FILTERS: ConstructedCardCatalogFilters = {
  query: '',
  class: '',
  set: '',
  mana: '',
  attack: '',
  health: '',
  mechanic: '',
  type: '',
  rarity: '',
  sort: 'set',
  direction: 'asc',
};

export function constructedCardCatalogUrl({
  format,
  period,
  rank,
  page,
  perPage,
  filters,
  query,
}: ConstructedCardCatalogContext & {
  page: number;
  perPage: number;
  filters: ConstructedCardCatalogFilters;
  query: string;
}): string {
  const params = new URLSearchParams({
    format,
    period,
    rank,
    page: String(page),
    perPage: String(perPage),
    sort: filters.sort,
    direction: filters.direction,
  });
  const requestFilters = { ...filters, query: query.trim() };
  Object.entries(requestFilters).forEach(([key, value]) => {
    if (value && key !== 'sort' && key !== 'direction') params.set(key, String(value));
  });
  return `/api/constructed-cards?${params}`;
}

function adjacentOption<T extends string>(
  options: ReadonlyArray<{ id: T }>,
  current: T,
): T | null {
  const currentIndex = options.findIndex(option => option.id === current);
  if (currentIndex < 0) return null;
  return options[currentIndex + 1]?.id ?? options[currentIndex - 1]?.id ?? null;
}

/**
 * Warms only the three transitions that are adjacent to the current catalog.
 * The previous all-options strategy transferred more than 1 MB of JSON after
 * every filter change and could compete with visible card images.
 */
export function adjacentConstructedCardCatalogContexts(
  context: ConstructedCardCatalogContext,
): ConstructedCardCatalogContext[] {
  const period = adjacentOption(CONSTRUCTED_CARD_PERIOD_OPTIONS, context.period);
  const rank = adjacentOption(CONSTRUCTED_CARD_RANK_OPTIONS, context.rank);
  const candidates: ConstructedCardCatalogContext[] = [];
  if (period) candidates.push({ ...context, period });
  if (rank) candidates.push({ ...context, rank });
  candidates.push({
    ...context,
    format: context.format === 'standard' ? 'wild' : 'standard',
  });
  return candidates;
}
