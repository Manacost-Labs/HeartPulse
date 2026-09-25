export type CosmeticKind = 'heroes' | 'coins' | 'pets';

const descriptions: Record<CosmeticKind, { heading: string; description: string }> = {
  heroes: {
    heading: 'Скины героев',
    description: 'Портреты всех классов с редкостью, способом получения, полными артами и анимациями на отдельных страницах.',
  },
  coins: {
    heading: 'Косметические монеты',
    description: 'Варианты Монетки, их арты и карты, связанные с механикой монет.',
  },
  pets: {
    heading: 'Питомцы',
    description: 'Все семейства и раскраски питомцев с End Screen и дополнительными артами.',
  },
};

export function cosmeticsListing(path: string) {
  const normalized = path.replace(/\/+$/, '');
  const match = normalized.match(/^\/cosmetics(?:\/(heroes|coins|pets))?$/);
  if (!match) return null;
  const kind = (match[1] ?? 'heroes') as CosmeticKind;
  return { pathname: `${normalized}/`, kind, ...descriptions[kind] };
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
