import { createHash } from 'node:crypto';
import type { SitemapSemanticEntry } from './entitySitemapTypes.js';

/**
 * Sitemap segments of the cosmetics and guides-archive detail pages. Both are
 * indexable server-rendered pages whose listings do not link them in HTML (the
 * cosmetics grid renders in the browser, the guide list is paywalled), so the
 * sitemap is how crawlers discover them.
 */

type JsonRecord = Record<string, unknown>;
type CosmeticKind = 'heroes' | 'coins' | 'pets';

export type CosmeticsCatalogLoader = (
  kind: CosmeticKind,
  query: { page: number; perPage: number; q: string },
) => Promise<JsonRecord>;

export type GuideSitemapDatabase = {
  prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] };
};

const COSMETIC_KINDS: readonly CosmeticKind[] = ['heroes', 'coins', 'pets'];
const COSMETIC_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const GUIDE_SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,159}$/;
// The upstream catalog re-syncs every record daily; its sync stamps are not
// page content and must not move lastmod (the same trap as card image `?v=`).
const COSMETIC_SYNC_FIELDS = new Set(['updatedAt', 'sourceAddedAt']);
const MAX_CATALOG_PAGES = 100;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function uniqueSorted(entries: SitemapSemanticEntry[], label: string): SitemapSemanticEntry[] {
  const byKey = new Map<string, SitemapSemanticEntry>();
  for (const entry of entries) {
    const previous = byKey.get(entry.key);
    if (previous && previous.semanticHash !== entry.semanticHash) {
      throw new Error(`${label} sitemap catalog contains a conflicting duplicate entity`);
    }
    byKey.set(entry.key, entry);
  }
  return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key, 'en'));
}

/** Rows are `{ kind, item }` pairs of public catalog summaries; see {@link loadCosmeticsSitemapRows}. */
export function projectCosmeticsSitemapCatalog(rows: unknown[], origin: string): SitemapSemanticEntry[] {
  if (!Array.isArray(rows)) return [];
  return uniqueSorted(rows.map(raw => {
    const row = record(raw);
    const item = record(row.item);
    const kind = row.kind as CosmeticKind;
    const cardId = typeof item.cardId === 'string' ? item.cardId : '';
    if (!COSMETIC_KINDS.includes(kind) || !COSMETIC_ID_PATTERN.test(cardId)) {
      throw new Error('Cosmetics sitemap catalog contains an invalid entity');
    }
    const content = Object.fromEntries(Object.entries(item).filter(([field]) => !COSMETIC_SYNC_FIELDS.has(field)));
    return { key: `${kind}/${cardId}`, location: `${origin}/cosmetics/${kind}/${cardId}/`, semanticHash: hash(content) };
  }), 'Cosmetics');
}

export function projectGuideArchiveSitemapCatalog(rows: unknown[], origin: string): SitemapSemanticEntry[] {
  if (!Array.isArray(rows)) return [];
  return uniqueSorted(rows.map(raw => {
    const guide = record(raw);
    const slug = typeof guide.slug === 'string' ? guide.slug : '';
    if (!GUIDE_SLUG_PATTERN.test(slug)) throw new Error('Guide archive sitemap catalog contains an invalid entity');
    return { key: slug, location: `${origin}/guides-archive/${slug}/`, semanticHash: hash(guide) };
  }), 'Guide archive');
}

/** Every public detail target of the three cosmetics catalogs; a pet family contributes each variant. */
export async function loadCosmeticsSitemapRows(loadCatalog: CosmeticsCatalogLoader): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (const kind of COSMETIC_KINDS) {
    let totalPages = 1;
    for (let page = 1; page <= Math.min(totalPages, MAX_CATALOG_PAGES); page += 1) {
      const payload = record(await loadCatalog(kind, { page, perPage: 100, q: '' }));
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (page === 1 && items.length === 0) throw new Error(`Entity sitemap ${kind} cosmetics catalog is empty`);
      totalPages = Number(record(payload.pagination).totalPages) || 1;
      for (const item of items) {
        const variants = record(item).variants;
        const targets = kind === 'pets' && Array.isArray(variants) ? variants : [item];
        rows.push(...targets.map(target => ({ kind, item: target })));
      }
    }
  }
  return rows;
}

/** The columns the public guide teaser renders; the archive itself is frozen. */
export function loadGuideArchiveSitemapRows(database: GuideSitemapDatabase): unknown[] {
  return database.prepare(`
    SELECT slug, title, description, image, published_iso, published_at, menu_name, kind, kind_slug
    FROM guides
  `).all();
}
