import type { ConstructedCardPeriod, ConstructedCardRank } from './statisticsContext';

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
