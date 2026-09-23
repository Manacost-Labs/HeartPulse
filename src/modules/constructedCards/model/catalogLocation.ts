import type { CardFormat } from './cardRoute';
import { EMPTY_CONSTRUCTED_CARD_FILTERS, type ConstructedCardCatalogContext, type ConstructedCardCatalogFilters } from './catalogQuery';
import { constructedCardPeriodFromSearch, constructedCardRankFromSearch } from './statisticsContext';

export type CatalogLocation = ConstructedCardCatalogContext & {
  filters: ConstructedCardCatalogFilters;
  page: number;
  perPage: number;
  view: 'gallery' | 'table';
};
const SORTS = new Set(['set', 'popularity', 'winrate', 'games', 'mana', 'attack', 'health', 'name', 'class', 'mechanics']);
const FILTERS = ['query', 'class', 'set', 'mana', 'attack', 'health', 'mechanic', 'type', 'rarity'] as const;

/** Normalize a shared URL identically during SSR, hydration and history navigation. */
export function catalogLocation(format: CardFormat, search: string): CatalogLocation {
  const params = new URLSearchParams(search);
  const filters = { ...EMPTY_CONSTRUCTED_CARD_FILTERS };
  for (const key of FILTERS) filters[key] = (params.get(key) ?? '').trim().slice(0, 120);
  const sort = params.get('sort') ?? '';
  filters.sort = SORTS.has(sort) ? sort : 'set';
  filters.direction = params.get('direction') === 'desc' ? 'desc' : 'asc';
  const page = Number(params.get('page'));
  return {
    format, filters, period: constructedCardPeriodFromSearch(search), rank: constructedCardRankFromSearch(search),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    perPage: params.get('perPage') === '120' ? 120 : 60,
    view: params.get('view') === 'table' ? 'table' : 'gallery',
  };
}

/** Preserve unrelated campaign parameters while removing cleared/default controls. */
export function catalogLocationUrl(pathname: string, state: CatalogLocation, search = ''): string {
  const params = new URLSearchParams(search);
  const defaults = catalogLocation(state.format, '');
  const values = { ...state.filters, period: state.period, rank: state.rank, page: state.page, perPage: state.perPage, view: state.view };
  const defaultValues = { ...defaults.filters, period: defaults.period, rank: defaults.rank, page: defaults.page, perPage: defaults.perPage, view: defaults.view };
  params.delete('format');
  for (const key of Object.keys(values) as Array<keyof typeof values>) {
    if (values[key] === defaultValues[key]) params.delete(key);
    else params.set(key, String(values[key]));
  }
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}`;
}
