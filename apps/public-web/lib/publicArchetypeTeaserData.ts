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

/** One line of an open build's card list; `id` names the card's page in the archetype's format. */
export type OpenArchetypeCard = { id: string; name: string; cost: number; count: number };
/** A build of the open layer: its deck code, numbers and card list (`null` when the source could not name every card). */
export type OpenArchetypeBuild = {
  deckCode: string; games: number | null; winrate: number | null; updatedAt: string | null; cards: OpenArchetypeCard[] | null;
};
export type PublicArchetypeDetail = ArchetypeDetail & { openBuilds: OpenArchetypeBuild[] };

const OPEN_BUILDS = 8;
const MAX_DECK_CARDS = 40;

function openCard(value: unknown): OpenArchetypeCard {
  const row = record(value);
  const id = string(row.id), name = string(row.name), cost = count(row.cost), copies = count(row.count);
  if (!/^[A-Za-z0-9_]{2,80}$/.test(id) || !name || name.length > 120 || !Number.isInteger(copies) || copies < 1 || copies > MAX_DECK_CARDS) {
    throw new Error('Invalid public archetype teaser');
  }
  return { id, name, cost, count: copies };
}

/** A build the page cannot show as a whole (no code, a malformed card) is left out, never passed through. */
function openBuild(value: unknown): OpenArchetypeBuild | null {
  try {
    const row = record(value);
    const deckCode = string(row.deckCode);
    if (!/^[A-Za-z0-9+/=]{20,600}$/.test(deckCode)) return null;
    const cards = row.cards === null || row.cards === undefined ? null
      : Array.isArray(row.cards) && row.cards.length <= MAX_DECK_CARDS ? row.cards.map(openCard) : null;
    return { deckCode, games: nullableNumber(row.games), winrate: nullableNumber(row.winrate), updatedAt: nullableString(row.updatedAt), cards };
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
    openBuilds: Array.isArray(item.builds)
      ? item.builds.slice(0, OPEN_BUILDS).map(openBuild).filter((build): build is OpenArchetypeBuild => build !== null) : [],
  };
}
