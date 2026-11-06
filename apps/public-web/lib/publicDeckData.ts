export type PublicDeckCard = { id: string; name: string; cost: number; rarity: string; count: number };
export type PublicDeck = {
  deckCode: string;
  format: 'standard' | 'wild';
  heroDbfId: number;
  /** The matched archetype's Russian label, or null. */
  archetype: string | null;
  cards: PublicDeckCard[];
  totalCards: number;
};

/** A deckstring as players paste it: base64 of the varint list (validated again by the resolver). */
const DECK_CODE = /^[A-Za-z0-9+/]{8,400}={0,2}$/;

/** Class names of the base heroes; a hero skin falls back to «Колода». */
const CLASS_BY_HERO_DBF: Record<number, string> = {
  7: 'Воин', 31: 'Охотник', 274: 'Друид', 637: 'Маг', 671: 'Паладин', 813: 'Жрец', 893: 'Чернокнижник', 930: 'Разбойник',
  1066: 'Шаман', 56550: 'Охотник на демонов', 78065: 'Рыцарь смерти',
};

export function deckClassName(heroDbfId: number): string {
  return CLASS_BY_HERO_DBF[heroDbfId] ?? '';
}

/** A deck code read from a URL path: `+` may arrive as a space, `/` split into segments. */
export function normalizeDeckCode(raw: string): string | null {
  const code = raw.trim().replace(/ /g, '+');
  return DECK_CODE.test(code) ? code : null;
}

/** Copies the resolver's answer into the embed's shape; null for anything else. Exported for tests. */
export function readDeck(value: unknown): PublicDeck | null {
  const body = value as Record<string, unknown> | null;
  if (!body || body.ok !== true || typeof body.deckCode !== 'string' || !Array.isArray(body.cards)) return null;
  const cards = (body.cards as Array<Record<string, unknown>>).flatMap(card => (
    typeof card.id === 'string' && typeof card.name === 'string'
      ? [{ id: card.id, name: card.name, cost: Number(card.cost) || 0, rarity: String(card.rarity ?? 'COMMON'), count: Number(card.count) || 1 }]
      : []));
  const archetype = body.archetype as { archetypeLabel?: unknown } | null;
  return {
    deckCode: body.deckCode,
    format: body.format === 'wild' ? 'wild' : 'standard',
    heroDbfId: Number(body.heroDbfId) || 0,
    archetype: typeof archetype?.archetypeLabel === 'string' && archetype.archetypeLabel ? archetype.archetypeLabel : null,
    cards,
    totalCards: Number(body.totalCards) || cards.reduce((sum, card) => sum + card.count, 0),
  };
}

