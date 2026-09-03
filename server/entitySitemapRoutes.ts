import { createHash } from 'node:crypto';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  SemanticSitemapStore,
  type SemanticSitemapDocument,
  type SitemapSegment,
  type SitemapSemanticEntry,
} from './entitySitemapStore.js';
import {
  canonicalSitemapOrigin,
  projectBattlegroundHeroSitemapCatalog,
  projectBattlegroundLibrarySitemapCatalog,
  projectConstructedCardSitemapCatalog,
  projectStandardCardSitemapCatalog,
} from './entitySitemapProjections.js';
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
};

export type EntitySitemapRouterDependencies = {
  loadStandardCards: () => Promise<unknown[]>;
  loadWildCards?: () => Promise<unknown[]>;
  loadBattlegroundMinions?: () => Promise<unknown[]>;
  loadBattlegroundSpells?: () => Promise<unknown[]>;
  loadBattlegroundHeroes?: () => Promise<unknown[]>;
  staticUrls: string[];
  stateDirectory: string;
  canonicalOrigin?: string;
  stateFilename?: string;
  cacheTtlMs?: number;
  minimumStandardCardCount?: number;
  minimumWildCardCount?: number;
  minimumBattlegroundMinionCount?: number;
  minimumBattlegroundSpellCount?: number;
  minimumBattlegroundHeroCount?: number;
  staticLastModifiedMs?: number;
  retryAfterSeconds?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

const ENTITY_SITEMAP_PATHS: DynamicSitemapDefinition['pathname'][] = [
  '/sitemaps/standard-cards.xml',
  '/sitemaps/wild-cards.xml',
  '/sitemaps/battleground-minions.xml',
  '/sitemaps/battleground-spells.xml',
  '/sitemaps/battleground-heroes.xml',
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
): CachedDocument {
  const digest = createHash('sha256').update(xml).digest('hex');
  return {
    xml,
    etag: `"sha256-${digest}"`,
    lastModified: modifiedAt === null ? null : new Date(modifiedAt).toUTCString(),
    source,
    expiresAt,
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
  );
}

function sendDocument(request: Request, response: Response, document: CachedDocument, maxAgeSeconds: number): Response {
  response.set('Content-Type', 'application/xml; charset=utf-8');
  response.set('Cache-Control', `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds}`);
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
  return definitions;
}

function createDynamicDocumentLoader(
  definition: DynamicSitemapDefinition,
  dependencies: EntitySitemapRouterDependencies,
  origin: string,
  now: () => number,
  cacheTtlMs: number,
): () => Promise<CachedDocument> {
  const store = new SemanticSitemapStore({
    directory: dependencies.stateDirectory,
    filename: definition.filename,
    segment: definition.segment,
    canonicalOrigin: origin,
    now,
    minimumEntryCount: definition.minimumEntryCount,
  });
  let cache: CachedDocument | null = null;
  let inflight: Promise<CachedDocument> | null = null;
  return async () => {
    const current = now();
    if (cache && cache.expiresAt > current) return cache;
    if (inflight) return inflight;
    const job = (async () => {
      try {
        cache = dynamicDocument(store.publish(
          definition.project(await definition.load(), origin),
        ), 'catalog', now() + cacheTtlMs);
        return cache;
      } catch (error) {
        try {
          dependencies.onError?.(new Error(`${definition.segment} sitemap refresh failed`, { cause: error }));
        } catch {
          // Diagnostics must never alter the public contract.
        }
        const lastKnownGood = store.readLastKnownGood();
        if (!lastKnownGood) throw error;
        cache = dynamicDocument(lastKnownGood, 'last-known-good', now() + cacheTtlMs);
        return cache;
      }
    })().finally(() => {
      if (inflight === job) inflight = null;
    });
    inflight = job;
    return job;
  };
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
  const indexDocument = documentFromXml(renderSitemapIndex([
    `${origin}/sitemaps/static.xml`,
    ...definitions.map(definition => `${origin}${definition.pathname}`),
  ]), 'static', null, Number.POSITIVE_INFINITY);
  const staticDocument = documentFromXml(
    renderSitemapUrlset(dependencies.staticUrls.map(location => ({ location }))),
    'static',
    Number.isFinite(dependencies.staticLastModifiedMs) ? dependencies.staticLastModifiedMs! : null,
    Number.POSITIVE_INFINITY,
  );
  const fixedHandler = (document: CachedDocument): RequestHandler => (request, response) => (
    sendDocument(request, response, document, maxAgeSeconds)
  );
  router.get('/sitemap.xml', fixedHandler(indexDocument));
  router.get('/sitemaps/static.xml', fixedHandler(staticDocument));
  const dynamicLoaders = new Map(definitions.map(definition => [
    definition.pathname,
    createDynamicDocumentLoader(definition, dependencies, origin, now, cacheTtlMs),
  ]));
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
