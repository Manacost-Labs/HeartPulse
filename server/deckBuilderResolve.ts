import { decode, encode, type DeckDefinition, type FormatType, type Sideboard } from '@firestone-hs/deckstrings';

export type DeckBuilderFormat = 'standard' | 'wild';

export type DeckBuilderCardRecord = {
  card_id?: string;
  id?: string;
  dbf?: number | null;
  dbfId?: number | null;
  name?: { ru?: string | null; en?: string | null } | string | null;
  name_ru?: string | null;
  mana?: number | null;
  mana_cost?: number | null;
  cost?: number | null;
  rarity?: string | null;
  images?: { card?: string | null; crop?: string | null };
  crop_image?: string | null;
  image?: string | null;
};

export type DeckBuilderResolvedCard = {
  id: string;
  dbfId: number;
  name: string;
  cost: number;
  rarity: string;
  elite: boolean;
  count: number;
  image: string;
  cardImage: string;
  collectible: boolean;
  sideboardKeyDbfId: number | null;
};

export type DeckBuilderResolvedSideboard = {
  keyCardDbfId: number;
  keyCard: DeckBuilderResolvedCard | null;
  label: string;
  cards: DeckBuilderResolvedCard[];
};

export type DeckBuilderArchetypeMatch = {
  archetype: string;
  archetypeLabel: string;
  score: number;
  deckCode: string | null;
};

export type DeckBuilderResolveResult = {
  format: DeckBuilderFormat;
  heroDbfId: number;
  deckCode: string;
  cards: DeckBuilderResolvedCard[];
  sideboards: DeckBuilderResolvedSideboard[];
  totalCards: number;
  deckSizeLimit: 30 | 40;
  archetype: DeckBuilderArchetypeMatch | null;
};

const MAX_DBF_ID = 10_000_000;

/** Cards that expand constructed decks to 40. */
export const XL_DECK_DBF_IDS = new Set<number>([
  79767, // Prince Renathal
  111689, // CORE Prince Renathal
  119432, // Rafaam, Time Thief (and saga uses main XL list)
  52119, // Arch-Villain Rafaam (legacy XL enabler in some formats)
  111455, // CORE Arch-Villain Rafaam
]);

function formatType(format: DeckBuilderFormat): FormatType {
  return format === 'standard' ? 2 : 1;
}

function formatFromType(value: number | undefined): DeckBuilderFormat {
  return value === 1 ? 'wild' : 'standard';
}

function asTrimmedString(value: unknown): string {
  return String(value ?? '').trim();
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cardName(card: DeckBuilderCardRecord, fallback: string): string {
  if (typeof card.name === 'string' && card.name.trim()) return card.name.trim();
  if (card.name && typeof card.name === 'object') {
    const localized = asTrimmedString(card.name.ru || card.name.en);
    if (localized) return localized;
  }
  const legacy = asTrimmedString(card.name_ru);
  return legacy || fallback;
}

function rarityOf(card: DeckBuilderCardRecord): string {
  const rarity = asTrimmedString(card.rarity).toUpperCase();
  if (!rarity) return 'COMMON';
  if (rarity === 'FREE') return 'FREE';
  return rarity;
}

function costOf(card: DeckBuilderCardRecord): number {
  return finiteNumber(card.mana_cost) ?? finiteNumber(card.mana) ?? finiteNumber(card.cost) ?? 0;
}

function tileUrl(cardId: string, _card?: DeckBuilderCardRecord): string {
  return `/api/card-image/${encodeURIComponent(cardId)}/tile.webp?v=card_tile_v1`;
}

function renderUrl(cardId: string, card?: DeckBuilderCardRecord): string {
  return asTrimmedString(card?.images?.card || card?.image)
    || `https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/${encodeURIComponent(cardId)}.png`;
}

function cleanSagaName(name: string): string {
  const match = name.match(/^\s*.+?\s*\(\s*\d+\s*[-–—]\s*(.+?)\s*\)\s*$/);
  return match?.[1]?.trim() || name;
}

function sortResolvedCards(cards: DeckBuilderResolvedCard[]): DeckBuilderResolvedCard[] {
  return [...cards].sort((left, right) => (
    left.cost - right.cost
    || left.name.localeCompare(right.name, 'ru', { sensitivity: 'base' })
  ));
}

function countsFromPairs(pairs: Iterable<[unknown, unknown]>): Array<{ dbfId: number; count: number }> {
  const counts = new Map<number, number>();
  for (const [rawDbf, rawCount] of pairs) {
    const dbfId = Number(rawDbf);
    const count = Number(rawCount);
    if (!isValidDeckDbfId(dbfId) || !Number.isSafeInteger(count) || count <= 0) continue;
    counts.set(dbfId, (counts.get(dbfId) || 0) + count);
  }
  return [...counts.entries()].map(([dbfId, count]) => ({ dbfId, count }));
}

export function isValidDeckDbfId(dbfId: number): boolean {
  return Number.isSafeInteger(dbfId) && dbfId > 0 && dbfId <= MAX_DBF_ID;
}

export function normalizeArchetypeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function translateArchetypeName(
  name: string,
  translations: Record<string, string>,
): string {
  const normalized = normalizeArchetypeKey(name);
  if (translations[normalized]) return translations[normalized];
  let bestMatch = '';
  let bestLength = 0;
  for (const [english, russian] of Object.entries(translations)) {
    if (normalized.includes(english) && english.length > bestLength) {
      bestMatch = russian;
      bestLength = english.length;
    }
  }
  return bestMatch || name;
}

export function indexCardsByDbf(cards: DeckBuilderCardRecord[]): Map<number, DeckBuilderCardRecord> {
  const index = new Map<number, DeckBuilderCardRecord>();
  for (const card of cards) {
    const dbfId = finiteNumber(card.dbf ?? card.dbfId);
    if (dbfId === null || !isValidDeckDbfId(dbfId) || index.has(dbfId)) continue;
    index.set(dbfId, card);
  }
  return index;
}

export function indexCardsRuByDbf(cardsRu: Record<string, any> | null | undefined): Map<number, DeckBuilderCardRecord> {
  const index = new Map<number, DeckBuilderCardRecord>();
  for (const [cardId, row] of Object.entries(cardsRu ?? {})) {
    const dbfId = finiteNumber(row?.dbf ?? row?.dbfId);
    if (dbfId === null || !isValidDeckDbfId(dbfId) || index.has(dbfId)) continue;
    index.set(dbfId, {
      card_id: cardId,
      dbf: dbfId,
      name: asTrimmedString(row?.name) || cardId,
      mana: finiteNumber(row?.mana),
      rarity: asTrimmedString(row?.rarity) || 'COMMON',
    });
  }
  return index;
}

function sideboardKeyForCardId(
  cardId: string,
  cardsRu: Record<string, any> | null | undefined,
): number | null {
  const match = cardId.match(/^(.*?)t\d+[a-z]?$/i);
  if (!match) return null;
  const parent = cardsRu?.[match[1]];
  const parentDbf = finiteNumber(parent?.dbf ?? parent?.dbfId);
  return parentDbf !== null && isValidDeckDbfId(parentDbf) ? parentDbf : null;
}

export function resolveDeckCard(
  dbfId: number,
  count: number,
  catalogByDbf: Map<number, DeckBuilderCardRecord>,
  cardsRuByDbf: Map<number, DeckBuilderCardRecord>,
  cardsRu: Record<string, any> | null | undefined,
  sideboardKeyDbfId: number | null = null,
): DeckBuilderResolvedCard | null {
  if (!isValidDeckDbfId(dbfId) || !Number.isSafeInteger(count) || count <= 0) return null;
  const catalog = catalogByDbf.get(dbfId);
  const fallback = cardsRuByDbf.get(dbfId);
  const source = catalog || fallback;
  if (!source) return null;
  const id = asTrimmedString(source.card_id || source.id);
  if (!id || id.startsWith('dbf-')) return null;
  const rarity = rarityOf(source);
  const collectible = Boolean(catalog);
  return {
    id,
    dbfId,
    name: cleanSagaName(cardName(source, id)),
    cost: costOf(source),
    rarity,
    elite: rarity === 'LEGENDARY',
    count,
    image: tileUrl(id, source),
    cardImage: renderUrl(id, source),
    collectible,
    sideboardKeyDbfId: sideboardKeyDbfId ?? sideboardKeyForCardId(id, cardsRu),
  };
}

export function decodeDeckDefinition(deckCode: string): DeckDefinition | null {
  const code = deckCode.trim();
  if (!/^[A-Za-z0-9+/=]{20,}$/.test(code)) return null;
  try {
    return decode(code);
  } catch {
    return null;
  }
}

/** Main-deck card counts only (no Zilliax/ETC sideboard modules). */
export function extractMainDeckCardCounts(definition: DeckDefinition): Array<{ dbfId: number; count: number }> {
  return countsFromPairs(definition.cards ?? []);
}

/** Flat card set used for archetype Jaccard (main + sideboard modules). */
export function extractDeckCardCounts(definition: DeckDefinition): Array<{ dbfId: number; count: number }> {
  const counts = new Map<number, number>();
  const add = (rawDbf: unknown, rawCount: unknown) => {
    const dbfId = Number(rawDbf);
    const count = Number(rawCount);
    if (!isValidDeckDbfId(dbfId) || !Number.isSafeInteger(count) || count <= 0) return;
    counts.set(dbfId, (counts.get(dbfId) || 0) + count);
  };
  for (const [dbfId, count] of definition.cards ?? []) add(dbfId, count);
  for (const sideboard of definition.sideboards ?? []) {
    add(sideboard.keyCardDbfId, 1);
    for (const [dbfId, count] of sideboard.cards ?? []) add(dbfId, count);
  }
  return [...counts.entries()].map(([dbfId, count]) => ({ dbfId, count }));
}

export function extractSideboardParts(definition: DeckDefinition): Array<{
  keyCardDbfId: number;
  cards: Array<{ dbfId: number; count: number }>;
}> {
  return (definition.sideboards ?? []).flatMap((sideboard: Sideboard) => {
    const keyCardDbfId = Number(sideboard.keyCardDbfId);
    if (!isValidDeckDbfId(keyCardDbfId)) return [];
    return [{
      keyCardDbfId,
      cards: countsFromPairs(sideboard.cards ?? []),
    }];
  });
}

export function deckSizeLimitForCards(cards: Array<{ dbfId: number }>, totalCards: number): 30 | 40 {
  if (totalCards > 30) return 40;
  if (cards.some(card => XL_DECK_DBF_IDS.has(card.dbfId))) return 40;
  return 30;
}

export function encodeResolvedDeck(
  heroDbfId: number,
  format: DeckBuilderFormat,
  cards: DeckBuilderResolvedCard[],
  sideboards: DeckBuilderResolvedSideboard[] = [],
): string {
  return encode({
    heroes: [heroDbfId],
    format: formatType(format),
    cards: cards.map(card => [card.dbfId, card.count]),
    sideboards: sideboards
      .filter(sideboard => sideboard.keyCardDbfId > 0 && sideboard.cards.length > 0)
      .map(sideboard => ({
        keyCardDbfId: sideboard.keyCardDbfId,
        cards: sideboard.cards.map(card => [card.dbfId, card.count] as [number, number]),
      })),
  });
}

export function jaccardScore(left: Set<number>, right: Set<number>): number {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function matchArchetypeByDeckCode(
  deckCode: string,
  candidates: Array<{ nameEn: string; deckCode: string }>,
): { nameEn: string; deckCode: string; score: number } | null {
  const definition = decodeDeckDefinition(deckCode);
  if (!definition) return null;
  const target = new Set(extractDeckCardCounts(definition).map(card => card.dbfId));
  let best: { nameEn: string; deckCode: string; score: number } | null = null;
  let secondScore = 0;
  for (const candidate of candidates) {
    const decoded = decodeDeckDefinition(candidate.deckCode);
    if (!decoded) continue;
    const score = jaccardScore(target, new Set(extractDeckCardCounts(decoded).map(card => card.dbfId)));
    if (!best || score > best.score) {
      secondScore = best?.score ?? 0;
      best = { nameEn: candidate.nameEn, deckCode: candidate.deckCode, score };
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  if (!best) return null;
  if (best.score >= 0.55) return best;
  if (best.score >= 0.42 && best.score - secondScore >= 0.18) return best;
  return null;
}

function resolveCardList(
  pairs: Array<{ dbfId: number; count: number }>,
  catalogByDbf: Map<number, DeckBuilderCardRecord>,
  cardsRuByDbf: Map<number, DeckBuilderCardRecord>,
  cardsRu: Record<string, any> | null | undefined,
  sideboardKeyDbfId: number | null = null,
): DeckBuilderResolvedCard[] {
  return sortResolvedCards(pairs.flatMap(({ dbfId, count }) => {
    const resolved = resolveDeckCard(dbfId, count, catalogByDbf, cardsRuByDbf, cardsRu, sideboardKeyDbfId);
    return resolved ? [resolved] : [];
  }));
}

export function resolveDeckFromCode(input: {
  deckCode: string;
  catalogCards: DeckBuilderCardRecord[];
  cardsRu: Record<string, any> | null | undefined;
  archetypeCandidates: Array<{ nameEn: string; deckCode: string }>;
  archetypeTranslations: Record<string, string>;
  preferredArchetypeName?: string | null;
}): DeckBuilderResolveResult | null {
  const definition = decodeDeckDefinition(input.deckCode);
  if (!definition) return null;
  const heroDbfId = Number(definition.heroes?.[0]);
  if (!isValidDeckDbfId(heroDbfId)) return null;
  const format = formatFromType(definition.format);
  const catalogByDbf = indexCardsByDbf(input.catalogCards);
  const cardsRuByDbf = indexCardsRuByDbf(input.cardsRu);
  const cards = resolveCardList(
    extractMainDeckCardCounts(definition),
    catalogByDbf,
    cardsRuByDbf,
    input.cardsRu,
  );
  const sideboards: DeckBuilderResolvedSideboard[] = extractSideboardParts(definition).map(part => {
    const keyCard = resolveDeckCard(part.keyCardDbfId, 1, catalogByDbf, cardsRuByDbf, input.cardsRu);
    const modules = resolveCardList(part.cards, catalogByDbf, cardsRuByDbf, input.cardsRu, part.keyCardDbfId);
    return {
      keyCardDbfId: part.keyCardDbfId,
      keyCard,
      label: keyCard?.name || `Сайдборд ${part.keyCardDbfId}`,
      cards: modules,
    };
  }).filter(sideboard => sideboard.cards.length > 0);

  const totalCards = cards.reduce((sum, card) => sum + card.count, 0);
  const deckSizeLimit = deckSizeLimitForCards(cards, totalCards);
  const normalizedCode = encodeResolvedDeck(heroDbfId, format, cards, sideboards);
  const preferred = asTrimmedString(input.preferredArchetypeName);
  const matched = preferred
    ? { nameEn: preferred, deckCode: null as string | null, score: 1 }
    : (
      matchArchetypeByDeckCode(normalizedCode, input.archetypeCandidates)
      || matchArchetypeByDeckCode(input.deckCode.trim(), input.archetypeCandidates)
    );
  return {
    format,
    heroDbfId,
    deckCode: normalizedCode,
    cards,
    sideboards,
    totalCards,
    deckSizeLimit,
    archetype: matched
      ? {
        archetype: matched.nameEn,
        archetypeLabel: translateArchetypeName(matched.nameEn, input.archetypeTranslations),
        score: matched.score,
        deckCode: matched.deckCode,
      }
      : null,
  };
}
