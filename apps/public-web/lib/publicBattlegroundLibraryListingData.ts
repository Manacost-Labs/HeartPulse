/**
 * The open listing of the Battlegrounds library as the page keeps it. Express answers
 * `GET /api/bg/library/public/listing/:kind` with the allowlisted projection; this parser copies field by
 * field and caps the lists, so a figure the projection should not carry (impact, combat win rate, rounds,
 * positions, history) cannot reach the HTML, the RSC payload (`self.__next_f`) or the page's JSON-LD even if
 * it arrived. The one statistic a guest gets is the base slice: average place, popularity and the sample.
 */
export const LIBRARY_LISTING_LIMIT = 400;
export const LIBRARY_LISTING_KINDS = [
  'minions', 'spells', 'anomalies', 'dark-gifts', 'quests', 'rewards', 'darkmoon-prizes', 'trinkets', 'timewarped',
] as const;
export type LibraryListingKind = typeof LIBRARY_LISTING_KINDS[number];

export type PublicLibraryListingItem = {
  dbfId: number;
  name: string;
  path: string;
  tavernTier: number | null;
  typeName: string;
  group: string | null;
  attack: number | null;
  health: number | null;
  stats: { avgPlacementWith: number; popularity: number | null; gamesWith: number } | null;
  /** The facts of the card's tile (added fields, `null`/`false` when the projection has none): catalog id, English
   * name, golden picture under the catalog's `/uploads/`, a Darkmoon prize's rating, the Duos-only mark. */
  cardId: string | null;
  nameEn: string | null;
  golden: string | null;
  tier: string | null;
  duosOnly: boolean;
};

export type PublicLibraryListing = {
  kind: LibraryListingKind;
  total: number;
  updatedAt: string | null;
  items: PublicLibraryListingItem[];
};

export const libraryListingPath = (kind: LibraryListingKind) => `/api/bg/library/public/listing/${kind}`;
export const LIBRARY_INDEX_PATH = '/api/bg/library/public/listing';

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, maximum = 180): string => typeof value === 'string' ? value.trim().slice(0, maximum) : '';
const integer = (value: unknown, maximum: number): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null;
const percent = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 100) / 100 : null;

const CARD_ID = /^[A-Za-z0-9_]{1,60}$/;
const UPLOAD_PATH = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/[A-Za-z0-9_.-]+\.(?:png|webp|jpg)$/;
const matching = (value: unknown, pattern: RegExp, maximum: number): string | null => {
  const found = text(value, maximum);
  return found && pattern.test(found) && !found.includes('..') ? found : null;
};

const ITEM_PATH = /^\/library\/(?:minions|spells|anomalies|dark-gifts|quests|rewards|darkmoon-prizes|trinkets|timewarped)\/[a-zа-я0-9-]{1,80}-[1-9][0-9]*\/$/u;

function item(value: unknown): PublicLibraryListingItem | null {
  const card = record(value);
  const dbfId = Number(card?.dbfId);
  const name = text(card?.name);
  const path = text(card?.path, 300);
  const typeName = text(card?.typeName, 100);
  if (!card || !Number.isSafeInteger(dbfId) || dbfId <= 0 || !name || !typeName
    || !ITEM_PATH.test(path) || !path.endsWith(`-${dbfId}/`)) return null;
  const stats = record(card.stats);
  const placement = Number(stats?.avgPlacementWith);
  const games = Number(stats?.gamesWith);
  return {
    dbfId, name, path, typeName,
    tavernTier: integer(card.tavernTier, 7),
    group: text(card.group, 120) || null,
    attack: integer(card.attack, 1000), health: integer(card.health, 1000),
    stats: stats && Number.isFinite(placement) && placement >= 1 && placement <= 8 && Number.isSafeInteger(games) && games > 0
      ? { avgPlacementWith: Math.round(placement * 100) / 100, popularity: percent(stats.popularity), gamesWith: games }
      : null,
    cardId: matching(card.cardId, CARD_ID, 60), nameEn: text(card.nameEn) || null,
    golden: matching(card.golden, UPLOAD_PATH, 200), tier: text(card.tier, 12) || null, duosOnly: card.duosOnly === true,
  };
}

/** `null` when the answer is not a listing of this kind or has no card: the page then must not be served empty. */
export function parsePublicLibraryListing(raw: unknown, kind: LibraryListingKind): PublicLibraryListing | null {
  const data = record(raw);
  if (!data || data.kind !== kind || !Array.isArray(data.items)) return null;
  const seen = new Set<number>();
  const items = data.items.slice(0, LIBRARY_LISTING_LIMIT).flatMap(entry => {
    const parsed = item(entry);
    if (!parsed || seen.has(parsed.dbfId)) return [];
    seen.add(parsed.dbfId);
    return [parsed];
  });
  if (!items.length) return null;
  const slice = record(data.slice);
  const updatedAt = text(slice?.updatedAt, 40);
  return { kind, total: items.length, items, updatedAt: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null };
}

/** The sizes of the listings for the hub page; an unreadable answer is an empty map (the links stay). */
export function parsePublicLibraryIndex(raw: unknown): Partial<Record<LibraryListingKind, number>> {
  const kinds = record(raw)?.kinds;
  const sizes: Partial<Record<LibraryListingKind, number>> = {};
  if (!Array.isArray(kinds)) return sizes;
  for (const entry of kinds) {
    const row = record(entry);
    const total = integer(row?.total, 100_000);
    if (row && (LIBRARY_LISTING_KINDS as readonly unknown[]).includes(row.kind) && total) sizes[row.kind as LibraryListingKind] = total;
  }
  return sizes;
}
