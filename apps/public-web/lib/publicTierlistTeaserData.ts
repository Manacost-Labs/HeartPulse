/**
 * The open slice of the Arena tier list as the page keeps it. Express answers
 * `GET /api/tierlist/public-teaser` with the whitelisted projection; this
 * parser copies field by field and caps the lists, so a figure the projection
 * should not carry (a winrate, a per-card game count) cannot reach the HTML,
 * the RSC payload (`self.__next_f`) or the page's JSON-LD even if it arrived.
 */
export const TIERLIST_TEASER_TOP_COUNT = 10;
export const TIERLIST_TEASER_CLASS_COUNT = 3;
const TIERS = new Set(['S', 'A', 'B', 'C', 'D', 'E', 'F']);

export type PublicTierlistTeaserCard = { cardId: string; name: string; className: string; tier: string };
export type PublicTierlistTeaser = {
  updatedAt: string | null;
  source: string;
  sampleGames: number | null;
  top: PublicTierlistTeaserCard[];
  classes: Array<{ id: string; name: string; cards: PublicTierlistTeaserCard[] }>;
};

export const TIERLIST_TEASER_PATH = '/api/tierlist/public-teaser';

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

function card(value: unknown): PublicTierlistTeaserCard | null {
  const row = record(value);
  const parsed = { cardId: text(row?.cardId), name: text(row?.name), className: text(row?.className), tier: text(row?.tier) };
  return parsed.cardId && parsed.name && parsed.className && TIERS.has(parsed.tier) ? parsed : null;
}

const cards = (value: unknown, limit: number): PublicTierlistTeaserCard[] =>
  (Array.isArray(value) ? value : []).slice(0, limit).flatMap(item => card(item) ?? []);

/** `null` when the answer is not a teaser or has no top cards: the page then renders without the slice. */
export function parsePublicTierlistTeaser(raw: unknown): PublicTierlistTeaser | null {
  const data = record(raw);
  if (!data) return null;
  const top = cards(data.top, TIERLIST_TEASER_TOP_COUNT);
  if (!top.length) return null;
  const updatedAt = text(data.updatedAt);
  const games = Number(data.sampleGames);
  return {
    updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
    source: text(data.source),
    sampleGames: Number.isInteger(games) && games > 0 ? games : null,
    top,
    classes: (Array.isArray(data.classes) ? data.classes : []).flatMap(item => {
      const entry = record(item);
      const group = { id: text(entry?.id), name: text(entry?.name), cards: cards(entry?.cards, TIERLIST_TEASER_CLASS_COUNT) };
      return group.id && group.name && group.cards.length ? group : [];
    }),
  };
}
