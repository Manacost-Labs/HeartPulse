import type { ArchetypeDetail } from '@/src/features/ConstructedArchetypes';

type RecordValue = Record<string, unknown>;
const CLASSES = new Set(['deathknight', 'demonhunter', 'druid', 'hunter', 'mage',
  'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior']);

function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid public archetype teaser');
  return value as RecordValue;
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid public archetype teaser');
  return value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Invalid public archetype teaser');
  return value;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid public archetype teaser');
  return value;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : string(value);
}

function safeSourceUrl(value: unknown): string {
  const source = string(value);
  if (!source) return '';
  try { return new URL(source).protocol === 'https:' ? source : ''; } catch { return ''; }
}

/**
 * One line of an open build's card list. `hasPage`: `/standard/cards/<format>/<id>/` exists (the card is in the
 * format's catalog); a companion card of a Fabled legendary is named without a link; `name: null` is a card no
 * dictionary knows, kept for its count.
 */
export type OpenArchetypeCard = { id: string | null; name: string | null; cost: number | null; rarity?: string | null; count: number; hasPage: boolean };
/** The cards that travel with `keyId`, a card of the build's list (the E.T.C. band, Zilliax's modules), decoded from its code. */
export type OpenArchetypeSideboard = { keyId: string; cards: OpenArchetypeCard[] };
/**
 * A build of the open layer: its deck code, numbers and card list (`null` when the source could not name every card),
 * and the sideboards of its code, when it has any.
 */
export type OpenArchetypeBuild = {
  deckCode: string; games: number | null; winrate: number | null; updatedAt: string | null; sampleRank?: string; samplePeriod?: string;
  cards: OpenArchetypeCard[] | null; sideboards?: OpenArchetypeSideboard[];
};
/**
 * `openBuilds` is one page of the open builds (from `buildsOffset`), without the ones the allowlist refuses and
 * without repeated codes; `openBuildsTotal` counts the source's builds; `openBuildsNext` is the source offset of the
 * next page (`null`: none), never derived from how many builds of this page passed.
 */
export type PublicArchetypeDetail = ArchetypeDetail & { openBuilds: OpenArchetypeBuild[]; openBuildsTotal: number; openBuildsNext: number | null };

const OPEN_BUILDS = 8;
const MAX_DECK_CARDS = 40;
const MAX_SIDEBOARDS = 4;
const MAX_SIDEBOARD_CARDS = 10;

function openCard(value: unknown): OpenArchetypeCard {
  const row = record(value);
  // An id or name the page refuses leaves the card unlinked or unnamed; it never drops the build.
  const copies = count(row.count);
  const id = typeof row.id === 'string' && /^[A-Za-z0-9_]{2,80}$/.test(row.id) ? row.id : null;
  const name = typeof row.name === 'string' && row.name && row.name.length <= 120 ? row.name : null;
  const cost = row.cost === null || row.cost === undefined ? null : count(row.cost);
  if (!Number.isInteger(copies) || copies < 1 || copies > MAX_DECK_CARDS) throw new Error('Invalid public archetype teaser');
  const rarity = typeof row.rarity === 'string' && /^[A-Z_]{2,20}$/.test(row.rarity) ? row.rarity : null;
  return { id, name, cost, rarity, count: copies, hasPage: row.hasPage === true && id !== null && name !== null };
}

/**
 * The sideboards of a build with a card list: each under a key card of that list, its lines read as the list's; the
 * first `MAX_SIDEBOARDS` of them with their first `MAX_SIDEBOARD_CARDS` lines. A sideboard that does not read is left
 * out; it never costs the build its list.
 */
function openSideboards(value: unknown, cards: OpenArchetypeCard[] | null): OpenArchetypeSideboard[] | undefined {
  if (!cards || !Array.isArray(value) || !value.length) return undefined;
  const boards = value.slice(0, MAX_SIDEBOARDS).flatMap((raw): OpenArchetypeSideboard[] => {
    try {
      const board = record(raw);
      const keyId = typeof board.keyId === 'string' && cards.some(card => card.id === board.keyId) ? board.keyId : null;
      if (!keyId || !Array.isArray(board.cards) || !board.cards.length) return [];
      return [{ keyId, cards: board.cards.slice(0, MAX_SIDEBOARD_CARDS).map(openCard) }];
    } catch {
      return [];
    }
  });
  return boards.length ? boards : undefined;
}

/** A build the page cannot show as a whole (no code, a malformed card) is left out, never passed through. */
function openBuild(value: unknown): OpenArchetypeBuild | null {
  try {
    const row = record(value);
    const deckCode = string(row.deckCode);
    if (!/^[A-Za-z0-9+/=]{20,600}$/.test(deckCode)) return null;
    const cards = row.cards === null || row.cards === undefined ? null
      : Array.isArray(row.cards) && row.cards.length <= MAX_DECK_CARDS ? row.cards.map(openCard) : null;
    const sideboards = openSideboards(row.sideboards, cards);
    return {
      deckCode, games: nullableNumber(row.games), winrate: nullableNumber(row.winrate), updatedAt: nullableString(row.updatedAt),
      sampleRank: nullableString(row.sampleRank) ?? '', samplePeriod: nullableString(row.samplePeriod) ?? '', cards,
      ...(sideboards ? { sideboards } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Whitelists the anonymous API response before it is serialized into Next HTML.
 * The open builds are kept apart from `item.builds` (always empty here), which
 * the client gallery reads only from the subscriber answer.
 */
export function publicArchetypeTeaser(raw: unknown, format: 'standard' | 'wild', slug: string): PublicArchetypeDetail {
  const payload = record(raw);
  const item = record(payload.item);
  if (payload.format !== format || item.format !== format || item.slug !== slug
    || !/^[a-z0-9-]{1,90}$/.test(slug)) throw new Error('Invalid public archetype teaser');
  const rawClass = nullableString(item.classKey);
  const classKey = rawClass && CLASSES.has(rawClass) ? rawClass as ArchetypeDetail['item']['classKey'] : null;
  const openBuilds = Array.isArray(item.builds)
    ? item.builds.slice(0, OPEN_BUILDS).map(openBuild).filter((build): build is OpenArchetypeBuild => build !== null)
      .filter((build, index, all) => all.findIndex(other => other.deckCode === build.deckCode) === index) : [];
  const rawBuild = payload.featuredBuild === null || payload.featuredBuild === undefined
    ? null : record(payload.featuredBuild);
  return {
    format, formatLabel: string(payload.formatLabel), patch: string(payload.patch),
    minimumGames: count(payload.minimumGames), updatedAt: nullableString(payload.updatedAt),
    item: {
      slug, archetype: string(item.archetype), archetypeLabel: string(item.archetypeLabel),
      translated: item.translated === true, classKey, format,
      games: count(item.games), winrate: nullableNumber(item.winrate),
      popularity: nullableNumber(item.popularity), turns: nullableNumber(item.turns),
      durationMinutes: nullableNumber(item.durationMinutes), climbingSpeed: nullableNumber(item.climbingSpeed),
      deckCount: count(item.deckCount), sourceUrl: safeSourceUrl(item.sourceUrl), builds: [],
    },
    featuredBuild: rawBuild ? {
      games: nullableNumber(rawBuild.games), winrate: nullableNumber(rawBuild.winrate),
      updatedAt: nullableString(rawBuild.updatedAt), sampleRank: string(rawBuild.sampleRank),
      samplePeriod: string(rawBuild.samplePeriod),
    } : null,
    history: [], analysis: null,
    openBuilds, openBuildsTotal: payload.buildsTotal === undefined ? openBuilds.length : Math.max(openBuilds.length, count(payload.buildsTotal)),
    openBuildsNext: payload.nextOffset === null || payload.nextOffset === undefined ? null : count(payload.nextOffset),
  };
}
