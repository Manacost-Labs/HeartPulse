import { createHash } from 'node:crypto';
import {
  isIndexableConstructedCard,
  projectPublicConstructedCardSeoData,
} from './constructedCardSeoRoutes.js';
import {
  canonicalBattlegroundCardSlug,
  projectPublicBattlegroundLibraryCard,
  type BattlegroundLibraryKind,
} from './battlegroundLibrarySeoRoutes.js';
import { projectPublicBattlegroundHero } from './battlegroundSeoRoutes.js';
import { isIndexableArchetype, type ArchetypeIndexingFacts } from '../shared/constructedArchetypeIndexing.js';
import type { SitemapSemanticEntry } from './entitySitemapStore.js';

type JsonRecord = Record<string, unknown>;

export function canonicalSitemapOrigin(value: string | undefined): string {
  try {
    const parsed = new URL(value ?? 'https://hearthpulse.net');
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('unsupported protocol');
    return parsed.origin;
  } catch {
    return 'https://hearthpulse.net';
  }
}

// The card catalog re-stamps `?v=<export time>` on every image daily. It is a
// cache-buster, not page content, so it must not move every card's lastmod.
function unversionedImage(value: string | null): string | null {
  if (!value) return value;
  try {
    const url = new URL(value);
    url.searchParams.delete('v');
    return url.href;
  } catch {
    return value;
  }
}

export function projectConstructedCardSitemapCatalog(
  cards: unknown[],
  format: 'standard' | 'wild',
  originValue?: string,
): SitemapSemanticEntry[] {
  if (!Array.isArray(cards)) return [];
  const origin = canonicalSitemapOrigin(originValue);
  const counts = new Map<string, number>();
  const dbfOwners = new Map<number, string>();
  for (const raw of cards) {
    const card = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonRecord : {};
    const id = typeof card.card_id === 'string' ? card.card_id.trim() : '';
    if (card.catalogPending === true) continue;
    if (!isIndexableConstructedCard(card)) throw new Error('Constructed card sitemap catalog contains an invalid entity');
    counts.set(id, (counts.get(id) ?? 0) + 1);
    const dbf = Number(card.dbf);
    if (Number.isSafeInteger(dbf) && dbf > 0) {
      const owner = dbfOwners.get(dbf);
      if (owner && owner !== id) throw new Error('Constructed card sitemap catalog contains a DBF alias collision');
      dbfOwners.set(dbf, id);
    }
  }
  if ([...counts.values()].some(count => count !== 1)) {
    throw new Error('Constructed card sitemap catalog contains a duplicate canonical ID');
  }
  return cards.flatMap(raw => {
    const card = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonRecord : {};
    if (card.catalogPending === true) return [];
    const projection = projectPublicConstructedCardSeoData(card, origin);
    const semanticHash = createHash('sha256')
      .update(JSON.stringify({ ...projection, image: unversionedImage(projection.image) }))
      .digest('hex');
    return [{
      key: projection.id,
      location: `${origin}/standard/cards/${format}/${encodeURIComponent(projection.id)}/`,
      semanticHash,
    }];
  }).sort((left, right) => left.key.localeCompare(right.key, 'en'));
}

export function projectStandardCardSitemapCatalog(cards: unknown[], originValue?: string) {
  return projectConstructedCardSitemapCatalog(cards, 'standard', originValue);
}

export function projectBattlegroundLibrarySitemapCatalog(
  cards: unknown[],
  kind: BattlegroundLibraryKind,
  originValue?: string,
): SitemapSemanticEntry[] {
  if (!Array.isArray(cards)) return [];
  const origin = canonicalSitemapOrigin(originValue);
  const entries = cards.map(raw => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonRecord : {};
    const card = projectPublicBattlegroundLibraryCard(source, kind, source.in_pool === true);
    if (!card) throw new Error(`Battleground ${kind} sitemap catalog contains an invalid entity`);
    return {
      key: String(card.dbfId),
      location: new URL(
        `/library/${kind === 'minion' ? 'minions' : 'spells'}/${canonicalBattlegroundCardSlug(card.nameRu)}-${card.dbfId}/`,
        origin,
      ).href,
      semanticHash: createHash('sha256').update(JSON.stringify(card)).digest('hex'),
    };
  });
  const keys = new Set<string>();
  for (const entry of entries) {
    if (keys.has(entry.key)) throw new Error(`Battleground ${kind} sitemap catalog contains a duplicate entity`);
    keys.add(entry.key);
  }
  return entries.sort((left, right) => left.key.localeCompare(right.key, 'en'));
}

export function projectBattlegroundHeroSitemapCatalog(
  heroes: unknown[],
  originValue?: string,
): SitemapSemanticEntry[] {
  if (!Array.isArray(heroes)) return [];
  const origin = canonicalSitemapOrigin(originValue);
  const entries = new Map<string, SitemapSemanticEntry>();
  for (const raw of heroes) {
    const hero = projectPublicBattlegroundHero(raw);
    if (!hero) throw new Error('Battleground hero sitemap catalog contains an invalid entity');
    const key = String(hero.dbfId);
    const semanticHash = createHash('sha256').update(JSON.stringify(hero)).digest('hex');
    const previous = entries.get(key);
    if (previous && previous.semanticHash !== semanticHash) {
      throw new Error('Battleground hero sitemap catalog contains a conflicting duplicate entity');
    }
    entries.set(key, { key, location: `${origin}/heroes/${hero.dbfId}/`, semanticHash });
  }
  return [...entries.values()].sort((left, right) => left.key.localeCompare(right.key, 'en'));
}

/**
 * One archetype of the catalog the archetype pages open on, with what the
 * sitemap needs to know of that catalog: when its data was produced and for
 * which period.
 */
export type ArchetypeSitemapRow = {
  item: unknown;
  updatedAt: string | null;
  period: string | null;
};

/** The page route's own idea of a slug (`apps/public-web/lib/publicArchetypeRoute.ts`). */
const ARCHETYPE_PAGE_SLUG = /^[a-z0-9-]{1,90}$/;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** What the indexing rule reads of a catalog row: the same fields the page reads of its teaser item. */
export function archetypeIndexingFacts(item: unknown): ArchetypeIndexingFacts {
  const row = asRecord(item);
  return {
    format: typeof row.format === 'string' ? row.format : '',
    games: typeof row.games === 'number' ? row.games : Number.NaN,
    deckCount: finiteNumber(row.deckCount) ?? 0,
    popularity: finiteNumber(row.popularity),
  };
}

/** The slug of a catalog row, when the page route would serve it. */
export function archetypePageSlug(item: unknown): string | null {
  const slug = asRecord(item).slug;
  return typeof slug === 'string' && ARCHETYPE_PAGE_SLUG.test(slug) ? slug : null;
}

function catalogDataDay(updatedAt: unknown): string {
  const time = typeof updatedAt === 'string' ? Date.parse(updatedAt) : Number.NaN;
  if (!Number.isFinite(time)) throw new Error('Archetype sitemap catalog has no data date');
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * Sitemap entries of the Standard archetype pages that are indexable. The rows
 * come filtered by `isIndexableArchetype`; a row the rule keeps out is a wiring
 * mistake, and the whole candidate is rejected instead of listing a `noindex`
 * page. The semantic hash covers what the page prints of the archetype (names,
 * numbers, period), so `lastmod` moves with the catalog's data date only when
 * one of them changed. Builds, deck codes and history are not read.
 */
export function projectConstructedArchetypeSitemapCatalog(
  rows: unknown[],
  originValue?: string,
): SitemapSemanticEntry[] {
  if (!Array.isArray(rows)) return [];
  const origin = canonicalSitemapOrigin(originValue);
  return rows.map(raw => {
    const row = asRecord(raw);
    const item = asRecord(row.item);
    const slug = archetypePageSlug(item);
    if (!slug || !isIndexableArchetype(archetypeIndexingFacts(item))) {
      throw new Error('Archetype sitemap catalog contains a page that is not indexable');
    }
    const publicFacts = {
      slug,
      archetype: item.archetype ?? null,
      archetypeLabel: item.archetypeLabel ?? null,
      classKey: item.classKey ?? null,
      games: item.games,
      winrate: item.winrate ?? null,
      popularity: item.popularity ?? null,
      turns: item.turns ?? null,
      durationMinutes: item.durationMinutes ?? null,
      climbingSpeed: item.climbingSpeed ?? null,
      deckCount: item.deckCount ?? null,
      sourceUrl: item.sourceUrl ?? null,
      period: row.period ?? null,
    };
    return {
      key: slug,
      location: `${origin}/standard/archetypes/standard/${slug}/`,
      semanticHash: createHash('sha256').update(JSON.stringify(publicFacts)).digest('hex'),
      dataDate: catalogDataDay(row.updatedAt),
    };
  }).sort((left, right) => left.key.localeCompare(right.key, 'en'));
}
