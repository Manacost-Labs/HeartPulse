import { createHash } from 'node:crypto';
import { createDynamicDocumentLoader } from './entitySitemapDynamicLoader.js';
import type { SitemapSegment, SitemapSemanticEntry } from './entitySitemapTypes.js';

/** An address of a sitemap with the day its content last changed. */
export type DatedLocation = { location: string; lastmod?: string };

type Listing = { segment: SitemapSegment; prefix?: string };

/**
 * The static pages that list the entities of a segment, and so change when one
 * of them does. A page not named here (text pages, pages fed by data this
 * router does not load) is dated by its own record in the page ledger alone.
 * A `prefix` narrows a segment to the entities such a page lists.
 */
const STATIC_PAGE_LISTINGS: Record<string, Listing[]> = {
  '/standard/cards/': [{ segment: 'standard-cards' }],
  '/standard/archetypes/': [{ segment: 'archetypes' }],
  '/heroes/': [{ segment: 'battleground-heroes' }],
  '/library/': [{ segment: 'battleground-minions' }, { segment: 'battleground-spells' }],
  '/library/minions/': [{ segment: 'battleground-minions' }],
  '/library/spells/': [{ segment: 'battleground-spells' }],
  '/cosmetics/': [{ segment: 'cosmetics' }],
  '/cosmetics/heroes/': [{ segment: 'cosmetics', prefix: '/cosmetics/heroes/' }],
  '/cosmetics/coins/': [{ segment: 'cosmetics', prefix: '/cosmetics/coins/' }],
  '/cosmetics/pets/': [{ segment: 'cosmetics', prefix: '/cosmetics/pets/' }],
  '/guides-archive/': [{ segment: 'guides-archive' }],
};

/** The latest of `YYYY-MM-DD` days; undefined when there is none. Such days sort as text. */
export function latestDay(days: Iterable<string | undefined | null>): string | undefined {
  let latest: string | undefined;
  for (const day of days) if (day && (latest === undefined || day > latest)) latest = day;
  return latest;
}

const UNVERSIONED = createHash('sha256').update('unversioned').digest('hex');

/**
 * The static pages as store entries: keyed by canonical path, hashed by the
 * content fingerprint of the build. A page the build gave no fingerprint is
 * hashed as a constant, so its day is the day the store first saw it.
 */
function projectStaticPageEntries(
  locations: string[],
  fingerprints: ReadonlyMap<string, string>,
): SitemapSemanticEntry[] {
  return locations.map(location => ({
    key: new URL(location).pathname,
    location,
    semanticHash: fingerprints.get(location) ?? UNVERSIONED,
  })).sort((left, right) => left.key.localeCompare(right.key, 'en'));
}

/**
 * The day each static page's content was first seen in its present form, by
 * address, from the same durable store as the entity segments: a rebuild or
 * deploy of unchanged content keeps it. Empty when the store cannot answer.
 */
export function createStaticPageDays(options: {
  urls: string[];
  fingerprints: ReadonlyMap<string, string>;
  origin: string;
  now: () => number;
  cacheTtlMs: number;
  stateDirectory: string;
}): () => Promise<Map<string, string>> {
  const load = createDynamicDocumentLoader({
    definition: {
      segment: 'static-pages',
      load: async () => options.urls,
      project: rows => projectStaticPageEntries(rows as string[], options.fingerprints),
      minimumEntryCount: 1,
    },
    origin: options.origin,
    now: options.now,
    cacheTtlMs: options.cacheTtlMs,
    stateDirectory: options.stateDirectory,
    toDocument: (state, _source, expiresAt) => ({ expiresAt, entries: state.entries }),
  });
  return async () => {
    const document = await load().catch(() => null);
    return new Map((document?.entries ?? []).flatMap(entry => (entry.lastmod ? [[entry.location, entry.lastmod] as const] : [])));
  };
}

/**
 * Static pages with their `lastmod`: the day of the page's own record (the
 * build ledger) or, for a page that lists the entities of a segment, the
 * latest `lastmod` among those entities, whichever is later. A segment that
 * could not be loaded is simply left out: the page keeps its ledger day.
 */
export function datedStaticLocations(
  locations: string[],
  ledgerDays: ReadonlyMap<string, string>,
  segmentEntries: ReadonlyMap<SitemapSegment, DatedLocation[]>,
): DatedLocation[] {
  return locations.map(location => {
    const pathname = new URL(location).pathname;
    const listed = (STATIC_PAGE_LISTINGS[pathname] ?? []).flatMap(({ segment, prefix }) => (
      (segmentEntries.get(segment) ?? [])
        .filter(entry => prefix === undefined || new URL(entry.location).pathname.startsWith(prefix))
        .map(entry => entry.lastmod)
    ));
    const lastmod = latestDay([ledgerDays.get(location), ...listed]);
    return lastmod ? { location, lastmod } : { location };
  });
}
