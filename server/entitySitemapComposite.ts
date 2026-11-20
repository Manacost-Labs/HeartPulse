import { createHash } from 'node:crypto';
import type { Response } from 'express';
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
  '/standard/archetypes/': [{ segment: 'archetypes', prefix: '/standard/archetypes/standard/' }],
  '/standard/archetypes/wild/': [{ segment: 'archetypes', prefix: '/standard/archetypes/wild/' }],
  // The deck hub prints the best Standard archetype of each class, the class pages more of them.
  '/standard/decks/': [{ segment: 'decks' }, { segment: 'archetypes', prefix: '/standard/archetypes/standard/' }],
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

/** A loaded sitemap document as the index sees it: its dated addresses and when its state was last written. */
export type IndexedSegment = { pathname: string; document: { entries: DatedLocation[]; lastModified: string | null } | null };

/**
 * The records of `/sitemap.xml`: each sitemap dated by the latest `lastmod`
 * among its addresses. A segment whose stored addresses carry no day (state
 * written before the store dated every address) takes the day its state was
 * last written. A segment that has no day at all (it could not be loaded and
 * has no stored state) is left out: there is nothing to serve at its address,
 * and one failing segment must not take the whole index from crawlers; the
 * production monitor compares the exact set of segments. Null only when no
 * record has a day, so the caller answers 503.
 */
export function sitemapIndexEntries(
  origin: string,
  staticEntries: DatedLocation[],
  segments: IndexedSegment[],
): DatedLocation[] | null {
  const records = [
    { location: `${origin}/sitemaps/static.xml`, lastmod: latestDay(staticEntries.map(entry => entry.lastmod)) },
    ...segments.map(({ pathname, document }) => ({
      location: `${origin}${pathname}`,
      lastmod: document ? latestDay(document.entries.map(entry => entry.lastmod)) ?? (document.lastModified ? new Date(document.lastModified).toISOString().slice(0, 10) : undefined) : undefined,
    })),
  ];
  const dated = records.filter((record): record is DatedLocation & { lastmod: string } => Boolean(record.lastmod));
  return dated.length > 0 ? dated : null;
}

/** The answer to a request that cannot be served now; a crawler or the monitor retries. */
export function sendUnavailable(response: Response, retryAfterSeconds: number): Response {
  response.set('Content-Type', 'text/plain; charset=utf-8');
  response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.set('Retry-After', String(retryAfterSeconds));
  return response.status(503).send('Sitemap temporarily unavailable');
}
