import type { ArchetypeDetail } from '../../../src/features/ConstructedArchetypes';

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
      deckCount: count(item.deckCount), sourceUrl: safeSourceUrl(item.sourceUrl), builds: [],
    },
    featuredBuild: rawBuild ? {
      games: nullableNumber(rawBuild.games), winrate: nullableNumber(rawBuild.winrate),
      updatedAt: nullableString(rawBuild.updatedAt), sampleRank: string(rawBuild.sampleRank),
      samplePeriod: string(rawBuild.samplePeriod),
    } : null,
    history: [], analysis: null,
  };
}
