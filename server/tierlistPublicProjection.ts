import { createHash } from 'node:crypto';

/**
 * The open layer of the Arena tier list for anonymous visitors (guests and
 * robots): the whole card pool with tier, base winrate and pick rate. The
 * object is built field by field, never by spreading a source row, so a figure
 * the dataset gains later (mulligan winrate, ArenaSmith rank, exact games) stays closed.
 *
 * Open: cardId, name, classKey, className, tier, cost, rarity, type, image,
 * winrate (rounded to 0.1), pickRate (rounded to 0.1); updatedAt, source,
 * sampleGamesAtLeast. Everything else is paid.
 */
export const PUBLIC_TIERLIST_SOURCES = ['hsreplay', 'firestone'] as const;
export type PublicTierlistSource = typeof PUBLIC_TIERLIST_SOURCES[number];

const MIN_PUBLIC_SAMPLE = 1000;
const TIERS = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'U'];

export type PublicTierlistCard = {
  cardId: string;
  name: string;
  classKey: string;
  className: string;
  tier: string;
  cost: number | null;
  rarity: string | null;
  type: string | null;
  image: string | null;
  winrate: number | null;
  pickRate: number | null;
};

export type PublicTierlist = {
  updatedAt: string | null;
  /** Human label of the source, as the dataset names it. */
  source: string;
  sourceId: PublicTierlistSource;
  warning?: 'stale' | 'fallback';
  /** A lower bound of the sample (two significant digits), never an exact count. */
  sampleGamesAtLeast: number | null;
  classes: Array<{ id: string; name: string; cards: PublicTierlistCard[] }>;
};

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const finite = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** 55.5555 → 55.6: one digit after the point is all a guest gets. */
const tenth = (value: unknown): number | null => {
  const number = finite(value);
  return number === null ? null : Math.round(number * 10) / 10;
};

/** `987654` → `980000`: two significant digits, rounded down; `null` below the smallest figure worth showing. */
export function sampleGamesLowerBound(games: number): number | null {
  if (!Number.isFinite(games) || games < MIN_PUBLIC_SAMPLE) return null;
  const step = 10 ** (Math.floor(Math.log10(games)) - 1);
  return Math.floor(games / step) * step;
}

/** `null` when no card survives: the caller must not answer 200 then. */
export function projectTierlistPublic(
  dataset: unknown,
  sourceId: PublicTierlistSource,
  warning?: 'stale' | 'fallback',
): PublicTierlist | null {
  const data = record(dataset);
  const lookup = record(data.cards);
  let largestGames = 0;
  const classes: PublicTierlist['classes'] = [];

  for (const entry of list(data.sections)) {
    const section = record(entry);
    const classKey = text(section.id);
    const className = text(section.name);
    if (!classKey || !className) continue;
    const cards: PublicTierlistCard[] = [];
    for (const groupEntry of list(section.tiers)) {
      const group = record(groupEntry);
      const tier = text(group.tier);
      for (const rowEntry of list(group.cards)) {
        const row = record(rowEntry);
        const games = finite(row.totalGames);
        if (games !== null && games > largestGames) largestGames = Math.floor(games);
        const cardId = text(row.cardId);
        const name = text(row.name);
        if (!TIERS.includes(tier) || !cardId || !name) continue;
        const extra = record(lookup[cardId]);
        const image = extra.imageRu;
        cards.push({
          cardId, name, classKey, className, tier,
          cost: finite(extra.cost),
          rarity: text(row.rarity) || null,
          type: text(extra.type) || null,
          image: typeof image === 'string' && image.startsWith('/') ? image : null,
          winrate: tenth(row.winrate ?? row.deckWinrate),
          pickRate: tenth(row.pickRate),
        });
      }
    }
    if (cards.length) classes.push({ id: classKey, name: className, cards });
  }
  if (!classes.length) return null;
  const updatedAt = text(data.updatedAt);
  return {
    updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null,
    source: text(data.source),
    sourceId,
    ...(warning ? { warning } : {}),
    sampleGamesAtLeast: sampleGamesLowerBound(largestGames),
    classes,
  };
}

export function tierlistPublicEtag(body: PublicTierlist): string {
  return `"tierlist-public-${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 24)}"`;
}
