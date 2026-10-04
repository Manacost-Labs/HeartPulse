export type CosmeticKind = 'heroes' | 'coins' | 'pets';

const kinds = new Set<CosmeticKind>(['heroes', 'coins', 'pets']);
const cardIdPattern = /^[A-Za-z0-9_-]{1,100}$/;

export function cosmeticsDetailPath(kind: string, cardId: string): string | null {
  if (!kinds.has(kind as CosmeticKind) || !cardIdPattern.test(cardId)) return null;
  return `/cosmetics/${kind}/${cardId}/`;
}

const headings: Record<CosmeticKind, string> = {
  heroes: 'Скины героев', coins: 'Косметические монеты', pets: 'Питомцы',
};

export function cosmeticsListing(path: string) {
  const normalized = path.replace(/\/+$/, '');
  const match = normalized.match(/^\/cosmetics(?:\/(heroes|coins|pets))?$/);
  if (!match) return null;
  const kind = (match[1] ?? 'heroes') as CosmeticKind;
  return { pathname: `${normalized}/`, kind, heading: headings[kind] };
}

export type CosmeticsCatalogFilters = { q: string; classSlug: string; rarity: string; category: string };

/**
 * Reads catalog filters and page from a listing's query string. The page
 * and the server loader both parse with it, so a server-rendered first page
 * answers exactly the request the page would make.
 */
export function cosmeticsCatalogControls(search: string): { filters: CosmeticsCatalogFilters; page: number } {
  const params = new URLSearchParams(search);
  return {
    filters: {
      q: params.get('search') || '',
      classSlug: params.get('class') || '',
      rarity: params.get('rarity') || '',
      category: params.get('category') || '',
    },
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

/** Mirrors the public catalog filter contract without carrying browser state into the domain. */
export function cosmeticsCatalogRequest(kind: CosmeticKind, query: string, filters: {
  classSlug: string; rarity: string; category: string;
}, page: number) {
  const params = new URLSearchParams();
  if (kind === 'heroes') {
    if (query) params.set('search', query);
    if (filters.classSlug) params.set('class', filters.classSlug);
    if (filters.rarity) params.set('rarity', filters.rarity);
    if (filters.category) params.set('category', filters.category);
  }
  if (page > 1) params.set('page', String(page));
  const search = params.toString();
  return { query: search, url: `/api/cosmetics/${kind}${search ? `?${search}` : ''}` };
}
