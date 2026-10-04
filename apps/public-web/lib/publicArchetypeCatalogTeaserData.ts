import type { ArchetypeCatalog } from '@/src/features/ConstructedArchetypes';

type RecordValue = Record<string, unknown>;
type CatalogItem = ArchetypeCatalog['items'][number];
const CLASSES = new Set(['deathknight', 'demonhunter', 'druid', 'hunter', 'mage',
  'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior']);
// The anonymous teaser lists every archetype once; more is not a catalog.
const MAX_ITEMS = 500;

class InvalidCatalog extends Error {}

function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidCatalog();
  return value as RecordValue;
}

function text(value: unknown, maxLength = 200): string {
  if (typeof value !== 'string' || value.length > maxLength) throw new InvalidCatalog();
  return value;
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new InvalidCatalog();
  return value;
}

function metric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidCatalog();
  return value;
}

function httpsUrl(value: unknown): string {
  const source = text(value ?? '', 500);
  try { return source && new URL(source).protocol === 'https:' ? source : ''; } catch { return ''; }
}

function item(raw: unknown, format: ArchetypeCatalog['format']): CatalogItem {
  const row = record(raw);
  const slug = text(row.slug, 90);
  if (!/^[a-z0-9-]{1,90}$/.test(slug) || row.format !== format) throw new InvalidCatalog();
  const classKey = typeof row.classKey === 'string' && CLASSES.has(row.classKey)
    ? row.classKey as CatalogItem['classKey'] : null;
  return {
    slug, format, classKey,
    archetype: text(row.archetype), archetypeLabel: text(row.archetypeLabel), translated: row.translated === true,
    games: count(row.games), winrate: metric(row.winrate), popularity: metric(row.popularity),
    turns: metric(row.turns), durationMinutes: metric(row.durationMinutes), climbingSpeed: metric(row.climbingSpeed),
    deckCount: count(row.deckCount), sourceUrl: httpsUrl(row.sourceUrl),
    // Builds (deck codes) are paid data; the teaser never carries them.
    builds: [],
  };
}

/**
 * Whitelists the anonymous catalog teaser before it is serialized into the
 * page, or returns `null` for a response that is not one.
 */
export function publicArchetypeCatalog(raw: unknown, format: ArchetypeCatalog['format']): ArchetypeCatalog | null {
  try {
    const payload = record(raw);
    if (payload.format !== format || !Array.isArray(payload.items) || payload.items.length > MAX_ITEMS) return null;
    return {
      format, formatLabel: text(payload.formatLabel, 80), patch: text(payload.patch ?? '', 40),
      minimumGames: count(payload.minimumGames),
      updatedAt: payload.updatedAt === null || payload.updatedAt === undefined ? null : text(payload.updatedAt, 64),
      coverage: {},
      items: payload.items.map(row => item(row, format)),
    };
  } catch (error) {
    if (error instanceof InvalidCatalog) return null;
    throw error;
  }
}
