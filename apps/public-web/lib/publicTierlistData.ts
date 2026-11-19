/**
 * The open layer of the Arena tier list as the page keeps it. Express answers
 * `GET /api/tierlist/public?source=hsreplay` with the whitelisted projection;
 * this parser copies field by field, so a figure the projection should not
 * carry (mulligan winrate, ArenaSmith rank, exact game counts, a winrate more
 * precise than 0.1) cannot reach the HTML, the RSC payload (`self.__next_f`)
 * or the page's JSON-LD even if it arrived.
 */
const TIERS = new Set(['S', 'A', 'B', 'C', 'D', 'E', 'F', 'U']);

export type PublicTierlistCard = {
  cardId: string;
  name: string;
  tier: string;
  cost: number | null;
  rarity: string | null;
  type: string | null;
  /** Percent, one digit after the point. */
  winrate: number | null;
  pickRate: number | null;
};
export type PublicTierlistClass = { id: string; name: string; cards: PublicTierlistCard[] };
export type PublicTierlist = {
  updatedAt: string | null;
  source: string;
  /** A rounded lower bound (two significant digits), never an exact game count. */
  sampleGamesAtLeast: number | null;
  classes: PublicTierlistClass[];
};

export const PUBLIC_TIERLIST_PATH = '/api/tierlist/public?source=hsreplay';

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const tenth = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 10) / 10 : null;
const cost = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99 ? value : null;
const anchorSafe = (value: string) => /^[a-z0-9-]{1,32}$/.test(value);

function card(value: unknown): PublicTierlistCard | null {
  const row = record(value);
  const parsed = {
    cardId: text(row?.cardId), name: text(row?.name), tier: text(row?.tier), cost: cost(row?.cost),
    rarity: text(row?.rarity) || null, type: text(row?.type) || null,
    winrate: tenth(row?.winrate), pickRate: tenth(row?.pickRate),
  };
  return parsed.cardId && parsed.name && TIERS.has(parsed.tier) ? parsed : null;
}

/** Only a figure rounded down to two significant digits and not below 1000 passes: an exact count is dropped. */
function isRoundedLowerBound(games: number): boolean {
  if (!Number.isInteger(games) || games < 1000) return false;
  const step = 10 ** (Math.floor(Math.log10(games)) - 1);
  return games % step === 0;
}

/** `null` when the answer is not a tier list or has no cards: the page then renders without the open layer. */
export function parsePublicTierlist(raw: unknown): PublicTierlist | null {
  const data = record(raw);
  if (!data || !Array.isArray(data.classes)) return null;
  const classes = data.classes.flatMap(item => {
    const entry = record(item);
    const id = text(entry?.id);
    const cards = (Array.isArray(entry?.cards) ? entry.cards : []).flatMap(row => card(row) ?? []);
    return anchorSafe(id) && text(entry?.name) && cards.length ? [{ id, name: text(entry?.name), cards }] : [];
  });
  if (!classes.length) return null;
  const updatedAt = text(data.updatedAt);
  const games = Number(data.sampleGamesAtLeast);
  return {
    updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
    source: text(data.source),
    sampleGamesAtLeast: isRoundedLowerBound(games) ? games : null,
    classes,
  };
}
