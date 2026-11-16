import { createHash } from 'node:crypto';
import { createDynamicDocumentLoader } from './entitySitemapDynamicLoader.js';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  type SemanticSitemapDocument,
  type SitemapSegment,
  type SitemapSemanticEntry,
} from './entitySitemapStore.js';
import {
  canonicalSitemapOrigin,
  projectBattlegroundHeroSitemapCatalog,
  projectBattlegroundLibrarySitemapCatalog,
  projectConstructedArchetypeSitemapCatalog,
  projectConstructedCardSitemapCatalog,
  projectStandardCardSitemapCatalog,
} from './entitySitemapProjections.js';
import { projectCosmeticsSitemapCatalog, projectGuideArchiveSitemapCatalog } from './entitySitemapEditorial.js';
import { createStaticPageDays, datedStaticLocations, latestDay, type DatedLocation } from './entitySitemapComposite.js';
import {
  loadStaticSitemapArtifact,
  renderSitemapIndex,
  renderSitemapUrlset,
} from './entitySitemapXml.js';

type DynamicSitemapDefinition = {
  segment: SitemapSegment;
  pathname: `/sitemaps/${string}.xml`;
  load: () => Promise<unknown[]>;
  project: (rows: unknown[], origin: string) => SitemapSemanticEntry[];
  minimumEntryCount: number;
  filename?: string;
};

type CachedDocument = {
  xml: string;
  etag: string;
  lastModified: string | null;
  source: 'catalog' | 'last-known-good' | 'static';
  expiresAt: number;
  entries: DatedLocation[];
};

export type EntitySitemapRouterDependencies = {
  loadStandardCards: () => Promise<unknown[]>;
  loadWildCards?: () => Promise<unknown[]>;
  loadBattlegroundMinions?: () => Promise<unknown[]>;
  loadBattlegroundSpells?: () => Promise<unknown[]>;
  loadBattlegroundHeroes?: () => Promise<unknown[]>;
  loadCosmetics?: () => Promise<unknown[]>;
  loadGuidesArchive?: () => Promise<unknown[]>;
  loadArchetypes?: () => Promise<unknown[]>;
  staticUrls: string[];
  /** Content fingerprint by address of each static page, written by the build. The store dates a page by when it first saw one. */
  staticFingerprints?: ReadonlyMap<string, string>;
  stateDirectory: string;
  canonicalOrigin?: string;
  stateFilename?: string;
  cacheTtlMs?: number;
  minimumStandardCardCount?: number;
  minimumWildCardCount?: number;
  minimumBattlegroundMinionCount?: number;
  minimumBattlegroundSpellCount?: number;
  minimumBattlegroundHeroCount?: number;
  minimumCosmeticsCount?: number;
  minimumGuideCount?: number;
  minimumArchetypeCount?: number;
  staticLastModifiedMs?: number;
  retryAfterSeconds?: number;
  /** A request waits this long for a rebuild before it gets the last known good document. Default 2 s. */
  responseDeadlineMs?: number;
  /** A rebuild that has not settled by then is abandoned, so the next request starts a new one. Default 25 s. */
  loadDeadlineMs?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

const ENTITY_SITEMAP_PATHS: DynamicSitemapDefinition['pathname'][] = [
  '/sitemaps/standard-cards.xml',
  '/sitemaps/wild-cards.xml',
  '/sitemaps/battleground-minions.xml',
  '/sitemaps/battleground-spells.xml',
  '/sitemaps/battleground-heroes.xml',
  '/sitemaps/cosmetics.xml',
  '/sitemaps/guides-archive.xml',
  '/sitemaps/archetypes.xml',
];

export {
  loadStaticSitemapArtifact,
  renderSitemapIndex,
  renderSitemapUrlset,
  projectBattlegroundHeroSitemapCatalog,
  projectBattlegroundLibrarySitemapCatalog,
  projectConstructedCardSitemapCatalog,
  projectStandardCardSitemapCatalog,
};

function documentFromXml(
  xml: string,
  source: CachedDocument['source'],
  modifiedAt: number | null,
  expiresAt: number,
  entries: DatedLocation[] = [],
): CachedDocument {
  const digest = createHash('sha256').update(xml).digest('hex');
  return {
    xml,
    etag: `"sha256-${digest}"`,
    lastModified: modifiedAt === null ? null : new Date(modifiedAt).toUTCString(),
    source,
    expiresAt,
    entries,
  };
}

function dynamicDocument(
  state: SemanticSitemapDocument,
  source: CachedDocument['source'],
  expiresAt: number,
): CachedDocument {
  return documentFromXml(
    renderSitemapUrlset(state.entries),
    source,
    Date.parse(state.updatedAt),
    expiresAt,
    state.entries,
  );
}

function sendDocument(request: Request, response: Response, document: CachedDocument, maxAgeSeconds: number): Response {
  response.set('Content-Type', 'application/xml; charset=utf-8');
  // An outage copy must not be pinned by the edge cache for a full sitemap lifetime.
  const seconds = document.source === 'last-known-good' ? Math.min(maxAgeSeconds, 30) : maxAgeSeconds;
  response.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds}`);
  response.set('ETag', document.etag);
  if (document.lastModified) response.set('Last-Modified', document.lastModified);
  response.set('X-Sitemap-Source', document.source);
  if (request.get('If-None-Match') === document.etag) return response.status(304).end();
  // Express' send() applies weak ETag/If-Modified-Since freshness rules and
  // could silently broaden this endpoint's deliberately exact validator
  // contract. Write the already-complete XML document directly instead.
  response.status(200);
  return response.end(document.xml);
}

function assertValidStaticSitemapUrls(locations: string[], origin: string): void {
  if (!Array.isArray(locations) || locations.length === 0) {
    throw new Error('Static sitemap must contain at least one URL');
  }
  const uniqueLocations = new Set<string>();
  for (const location of locations) {
    let parsed: URL;
    try {
      parsed = new URL(location);
    } catch {
      throw new Error('Static sitemap contains an invalid URL');
    }
    if (parsed.origin !== origin || parsed.search || parsed.hash
      || (parsed.pathname !== '/' && !parsed.pathname.endsWith('/'))
      || /^\/(?:admin|404|api|health|metrics|_internal|r|decks|jobs)(?:\/|$)/.test(parsed.pathname)
      || uniqueLocations.has(parsed.href)) {
      throw new Error('Static sitemap contains an invalid, private, noindex or duplicate URL');
    }
    uniqueLocations.add(parsed.href);
  }
}

function dynamicSitemapDefinitions(
  dependencies: EntitySitemapRouterDependencies,
  origin: string,
): DynamicSitemapDefinition[] {
  const definitions: DynamicSitemapDefinition[] = [{
    segment: 'standard-cards',
    pathname: '/sitemaps/standard-cards.xml',
    load: dependencies.loadStandardCards,
    project: projectStandardCardSitemapCatalog,
    minimumEntryCount: dependencies.minimumStandardCardCount ?? 500,
    filename: dependencies.stateFilename,
  }];
  if (dependencies.loadWildCards) definitions.push({
    segment: 'wild-cards', pathname: '/sitemaps/wild-cards.xml', load: dependencies.loadWildCards,
    project: rows => projectConstructedCardSitemapCatalog(rows, 'wild', origin),
    minimumEntryCount: dependencies.minimumWildCardCount ?? 500,
  });
  if (dependencies.loadBattlegroundMinions) definitions.push({
    segment: 'battleground-minions', pathname: '/sitemaps/battleground-minions.xml',
    load: dependencies.loadBattlegroundMinions,
    project: rows => projectBattlegroundLibrarySitemapCatalog(rows, 'minion', origin),
    minimumEntryCount: dependencies.minimumBattlegroundMinionCount ?? 500,
  });
  if (dependencies.loadBattlegroundSpells) definitions.push({
    segment: 'battleground-spells', pathname: '/sitemaps/battleground-spells.xml',
    load: dependencies.loadBattlegroundSpells,
    project: rows => projectBattlegroundLibrarySitemapCatalog(rows, 'spell', origin),
    minimumEntryCount: dependencies.minimumBattlegroundSpellCount ?? 50,
  });
  if (dependencies.loadBattlegroundHeroes) definitions.push({
    segment: 'battleground-heroes', pathname: '/sitemaps/battleground-heroes.xml',
    load: dependencies.loadBattlegroundHeroes,
    project: projectBattlegroundHeroSitemapCatalog,
    minimumEntryCount: dependencies.minimumBattlegroundHeroCount ?? 80,
  });
  if (dependencies.loadCosmetics) definitions.push({
    segment: 'cosmetics', pathname: '/sitemaps/cosmetics.xml', load: dependencies.loadCosmetics,
    project: projectCosmeticsSitemapCatalog, minimumEntryCount: dependencies.minimumCosmeticsCount ?? 500,
  });
  if (dependencies.loadGuidesArchive) definitions.push({
    segment: 'guides-archive', pathname: '/sitemaps/guides-archive.xml', load: dependencies.loadGuidesArchive,
    project: projectGuideArchiveSitemapCatalog, minimumEntryCount: dependencies.minimumGuideCount ?? 500,
  });
  if (dependencies.loadArchetypes) definitions.push({
    segment: 'archetypes', pathname: '/sitemaps/archetypes.xml', load: dependencies.loadArchetypes,
    project: rows => projectConstructedArchetypeSitemapCatalog(rows, origin),
    minimumEntryCount: dependencies.minimumArchetypeCount ?? 30,
  });
  return definitions;
}

export function createEntitySitemapRouter(dependencies: EntitySitemapRouterDependencies): Router {
  const router = Router({ caseSensitive: true, strict: true });
  const origin = canonicalSitemapOrigin(dependencies.canonicalOrigin);
  const now = dependencies.now ?? Date.now;
  const cacheTtlMs = Math.max(5 * 60_000, Math.min(15 * 60_000, dependencies.cacheTtlMs ?? 10 * 60_000));
  const maxAgeSeconds = Math.floor(cacheTtlMs / 1_000);
  const retryAfterSeconds = Math.max(1, Math.floor(dependencies.retryAfterSeconds ?? 300));
  assertValidStaticSitemapUrls(dependencies.staticUrls, origin);
  const definitions = dynamicSitemapDefinitions(dependencies, origin);
  const dynamicLoaders = new Map(definitions.map(definition => [
    definition.pathname,
    createDynamicDocumentLoader({
      definition, origin, now, cacheTtlMs, stateDirectory: dependencies.stateDirectory,
      responseDeadlineMs: dependencies.responseDeadlineMs, loadDeadlineMs: dependencies.loadDeadlineMs,
      onError: dependencies.onError, toDocument: dynamicDocument,
    }),
  ]));
  // A segment that cannot be loaded leaves a static page on its own day.
  const loadSegments = async () => Promise.allSettled(definitions.map(async definition => (
    [definition, await dynamicLoaders.get(definition.pathname)!()] as const
  )));
  const staticPageDays = createStaticPageDays({
    urls: dependencies.staticUrls, fingerprints: dependencies.staticFingerprints ?? new Map(),
    origin, now, cacheTtlMs, stateDirectory: dependencies.stateDirectory,
  });
  const staticEntries = async (): Promise<DatedLocation[]> => datedStaticLocations(
    dependencies.staticUrls,
    await staticPageDays(),
    new Map((await loadSegments()).flatMap(result => (
      result.status === 'fulfilled' ? [[result.value[0].segment, result.value[1].entries] as const] : []
    ))),
  );
  router.get('/sitemaps/static.xml', async (request, response) => {
    const entries = await staticEntries();
    return sendDocument(request, response, documentFromXml(
      renderSitemapUrlset(entries),
      'static',
      Number.isFinite(dependencies.staticLastModifiedMs) ? dependencies.staticLastModifiedMs! : null,
      Number.POSITIVE_INFINITY,
      entries,
    ), maxAgeSeconds);
  });
  // The index dates each sitemap by the latest `lastmod` among its addresses; a segment
  // that cannot be loaded stays listed, undated, so the monitor flags it instead of crawlers losing the index.
  router.get('/sitemap.xml', async (request, response) => {
    const results = await loadSegments();
    const entries = [
      { location: `${origin}/sitemaps/static.xml`, lastmod: latestDay((await staticEntries()).map(entry => entry.lastmod)) },
      ...definitions.map((definition, position) => {
        const result = results[position];
        return {
          location: `${origin}${definition.pathname}`,
          lastmod: result.status === 'fulfilled' ? latestDay(result.value[1].entries.map(entry => entry.lastmod)) : undefined,
        };
      }),
    ];
    return sendDocument(request, response, documentFromXml(
      renderSitemapIndex(entries), 'static', null, Number.POSITIVE_INFINITY,
    ), maxAgeSeconds);
  });
  router.get(ENTITY_SITEMAP_PATHS, async (request, response, next) => {
    const loadDocument = dynamicLoaders.get(request.path as DynamicSitemapDefinition['pathname']);
    if (!loadDocument) return next();
    try {
      return sendDocument(request, response, await loadDocument(), maxAgeSeconds);
    } catch {
      response.set('Content-Type', 'text/plain; charset=utf-8');
      response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      response.set('Retry-After', String(retryAfterSeconds));
      return response.status(503).send('Sitemap temporarily unavailable');
    }
  });
  router.all(/^\/sitemaps\/.*$/, (_request, response) => {
    response.set('Content-Type', 'text/plain; charset=utf-8');
    response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return response.status(404).send('Sitemap not found');
  });
  return router;
}
