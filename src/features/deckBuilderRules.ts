import type {
  ConstructedHeroClass as HeroClass,
} from './constructedDeckCode';

export type DeckBuilderEntry = {
  id: string;
  dbfId: number;
  name: string;
  cost: number;
  rarity: string;
  elite: boolean;
  count: number;
  image: string;
  cardImage: string;
};

export type DeckBuilderCatalogCard = {
  class?: string | null;
  multi_class?: string[];
};

export const XL_DECK_DBF_IDS = new Set([
  79767, // Prince Renathal
  111689, // CORE Prince Renathal
  119432, // Rafaam, Time Thief
  52119,
  111455,
]);

export function totalDeckCards(entries: Array<Pick<DeckBuilderEntry, 'count'>>): number {
  return entries.reduce((sum, entry) => sum + entry.count, 0);
}

export function deckSizeLimit(entries: Array<Pick<DeckBuilderEntry, 'dbfId'>>): 30 | 40 {
  return entries.some(entry => XL_DECK_DBF_IDS.has(entry.dbfId)) ? 40 : 30;
}

export function maxCardCopies(rarity: string): number {
  return rarity.toUpperCase() === 'LEGENDARY' ? 1 : 2;
}

export function catalogCardClasses(card: DeckBuilderCatalogCard): string[] {
  return [...new Set([
    card.class,
    ...(Array.isArray(card.multi_class) ? card.multi_class : []),
  ]
    .map(value => String(value ?? '').trim().toUpperCase())
    .filter(Boolean))];
}

export function isCatalogCardLegalForHero(
  card: DeckBuilderCatalogCard,
  heroClass: HeroClass,
): boolean {
  const classes = catalogCardClasses(card);
  return classes.includes('NEUTRAL') || classes.includes(heroClass);
}

export function deckCompletionLabel(cardCount: number, limit: 30 | 40): string {
  if (cardCount === limit) return 'Колода готова';
  if (cardCount < limit) return `Не хватает ${limit - cardCount} карт`;
  return `Лишних карт: ${cardCount - limit}`;
}
