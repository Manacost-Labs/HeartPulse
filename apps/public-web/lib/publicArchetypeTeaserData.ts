import type { ArchetypeDetail } from '@/src/features/ConstructedArchetypes';
import type { OpenDeckCard } from '@/src/features/archetypeOpenBuilds';

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

const MAX_BUILDS = 12;
const MAX_DECK_CARDS = 80;

function openCard(raw: unknown): OpenDeckCard {
  const row = record(raw);
  return { dbfId: count(row.dbfId), name: string(row.name).slice(0, 120), cost: count(row.cost), rarity: string(row.rarity).slice(0, 20), count: count(row.count) };
}

/** A build of the open layer: the deck code and its card list, field by field; nothing else the API sends is copied. */
function openBuild(raw: unknown, classKey: ArchetypeDetail['item']['classKey']): ArchetypeDetail['item']['builds'][number] {
  const row = record(raw);
  const deckCode = string(row.deckCode);
  if (!/^[A-Za-z0-9+/=]{20,600}$/.test(deckCode) || !Array.isArray(row.cards) || row.cards.length > MAX_DECK_CARDS) {
    throw new Error('Invalid public archetype teaser');
  }
  return {
    deckCode, games: nullableNumber(row.games), winrate: nullableNumber(row.winrate), sourceUrl: '', updatedAt: nullableString(row.updatedAt),
    classKey, sampleRank: string(row.sampleRank), samplePeriod: string(row.samplePeriod), cards: row.cards.map(openCard),
  };
}

function openBuilds(value: unknown, classKey: ArchetypeDetail['item']['classKey']): ArchetypeDetail['item']['builds'] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_BUILDS) throw new Error('Invalid public archetype teaser');
  return value.map(build => openBuild(build, classKey));
}

/** Whitelists the anonymous API response before it is serialized into Next HTML. */
export function publicArchetypeTeaser(raw: unknown, format: 'standard' | 'wild', slug: string): ArchetypeDetail {
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
      deckCount: count(item.deckCount), sourceUrl: safeSourceUrl(item.sourceUrl),
      // Deck codes and card lists are the open layer; the endpoint lists at most the first builds.
      builds: openBuilds(item.builds, classKey),
    },
    featuredBuild: rawBuild ? {
      games: nullableNumber(rawBuild.games), winrate: nullableNumber(rawBuild.winrate),
      updatedAt: nullableString(rawBuild.updatedAt), sampleRank: string(rawBuild.sampleRank),
      samplePeriod: string(rawBuild.samplePeriod),
    } : null,
    history: [], analysis: null,
  };
}
