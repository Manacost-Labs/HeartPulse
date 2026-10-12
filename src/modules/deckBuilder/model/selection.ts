export const BUILDER_CLASSES = [
  { id: 'DEATHKNIGHT', label: 'Рыцарь смерти', icon: 'deathknight' },
  { id: 'DEMONHUNTER', label: 'Охотник на демонов', icon: 'demonhunter' },
  { id: 'DRUID', label: 'Друид', icon: 'druid' },
  { id: 'HUNTER', label: 'Охотник', icon: 'hunter' },
  { id: 'MAGE', label: 'Маг', icon: 'mage' },
  { id: 'PALADIN', label: 'Паладин', icon: 'paladin' },
  { id: 'PRIEST', label: 'Жрец', icon: 'priest' },
  { id: 'ROGUE', label: 'Разбойник', icon: 'rogue' },
  { id: 'SHAMAN', label: 'Шаман', icon: 'shaman' },
  { id: 'WARLOCK', label: 'Чернокнижник', icon: 'warlock' },
  { id: 'WARRIOR', label: 'Воин', icon: 'warrior' },
] as const;

export type BuilderClass = typeof BUILDER_CLASSES[number]['id'];
export type BuilderFormat = 'standard' | 'wild';
export type BuilderCard = {
  id: string; dbfId: number; name: string; cost: number; rarity: string;
  classes: string[]; image: string; tile: string;
  attack?: number; health?: number; text?: string;
  set?: string;
};
export type BuilderEntry = BuilderCard & { count: number; sideboard?: BuilderEntry[] };
export type DeckLimit = (cards: Array<{ dbfId: number }>) => number;
export type BuilderCatalogQuery = {
  heroClass: BuilderClass; format: BuilderFormat; query: string; mana: string;
  rarity: string; pool: string; page: number;
  set?: string; type?: string; mechanic?: string; minionType?: string; spellSchool?: string;
  sort?: string; direction?: 'asc' | 'desc';
  guestClass?: BuilderClass;
};
export type BuilderFacet = 'sets' | 'types' | 'mechanics' | 'minionTypes' | 'spellSchools';
export type BuilderCatalog = {
  cards: BuilderCard[]; total: number; totalPages: number;
  facets?: Record<BuilderFacet, string[]>; mechanicTranslations?: Record<string, string>;
};

export function deckCount(deck: BuilderEntry[]): number {
  return deck.reduce((total, card) => total + card.count, 0);
}

export function cardCopyLimit(card: BuilderCard): number {
  return card.rarity === 'LEGENDARY' ? 1 : 2;
}

export function canAddDeckCard(deck: BuilderEntry[], card: BuilderCard, heroClass: BuilderClass, limit: DeckLimit,
  legal?: (card: BuilderCard, current: BuilderEntry[]) => boolean): boolean {
  if (legal ? !legal(card, deck) : !card.classes.includes('NEUTRAL') && !card.classes.includes(heroClass)) return false;
  const count = deck.reduce((total, entry) => total + (entry.dbfId === card.dbfId ? entry.count : 0)
    + (entry.id === 'ETC_080' ? (entry.sideboard ?? []).filter(item => item.dbfId === card.dbfId).reduce((sum, item) => sum + item.count, 0) : 0), 0);
  return count < cardCopyLimit(card) && deckCount(deck) < limit([...deck, card]);
}

export function changeDeckCopies(deck: BuilderEntry[], card: BuilderCard, delta: 1 | -1, heroClass: BuilderClass, limit: DeckLimit,
  legal?: (card: BuilderCard, current: BuilderEntry[]) => boolean): BuilderEntry[] {
  if (delta > 0 && !canAddDeckCard(deck, card, heroClass, limit, legal)) return deck;
  const existing = deck.find(entry => entry.dbfId === card.dbfId);
  if (!existing) return delta > 0 ? [...deck, { ...card, count: 1 }] : deck;
  return deck.map(entry => entry.dbfId === card.dbfId ? { ...entry, count: entry.count + delta } : entry)
    .filter(entry => entry.count > 0);
}
