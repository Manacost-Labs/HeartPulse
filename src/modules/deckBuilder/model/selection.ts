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
};
export type BuilderEntry = BuilderCard & { count: number };
export type DeckLimit = (cards: Array<{ dbfId: number }>) => number;
export type BuilderCatalogQuery = {
  heroClass: BuilderClass; format: BuilderFormat; query: string; mana: string;
  rarity: string; pool: string; page: number;
};
export type BuilderCatalog = { cards: BuilderCard[]; total: number; totalPages: number };

export function deckCount(deck: BuilderEntry[]): number {
  return deck.reduce((total, card) => total + card.count, 0);
}

export function cardCopyLimit(card: BuilderCard): number {
  return card.rarity === 'LEGENDARY' ? 1 : 2;
}

export function canAddDeckCard(deck: BuilderEntry[], card: BuilderCard, heroClass: BuilderClass, limit: DeckLimit): boolean {
  if (!card.classes.includes('NEUTRAL') && !card.classes.includes(heroClass)) return false;
  const count = deck.find(entry => entry.dbfId === card.dbfId)?.count ?? 0;
  return count < cardCopyLimit(card) && deckCount(deck) < limit([...deck, card]);
}

export function changeDeckCopies(deck: BuilderEntry[], card: BuilderCard, delta: 1 | -1, heroClass: BuilderClass, limit: DeckLimit): BuilderEntry[] {
  if (delta > 0 && !canAddDeckCard(deck, card, heroClass, limit)) return deck;
  const existing = deck.find(entry => entry.dbfId === card.dbfId);
  if (!existing) return delta > 0 ? [...deck, { ...card, count: 1 }] : deck;
  return deck.map(entry => entry.dbfId === card.dbfId ? { ...entry, count: entry.count + delta } : entry)
    .filter(entry => entry.count > 0);
}
