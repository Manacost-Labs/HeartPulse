import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  isIndexableConstructedCard,
  projectPublicConstructedCardSeoData,
} from './constructedCardSeoRoutes.js';
import {
  SemanticSitemapStore,
  type SemanticSitemapDocument,
  type SitemapSemanticEntry,
} from './entitySitemapStore.js';

type JsonRecord = Record<string, unknown>;
type SitemapUrlEntry = { location: string; lastmod?: string };
type XmlLimits = { maxEntries?: number; maxBytes?: number };

type CachedDocument = {
  xml: string;
  etag: string;
  lastModified: string | null;
  source: 'catalog' | 'last-known-good' | 'static';
  expiresAt: number;
};

export type EntitySitemapRouterDependencies = {
  loadStandardCards: () => Promise<unknown[]>;
  staticUrls: string[];
  stateDirectory: string;
  canonicalOrigin?: string;
  stateFilename?: string;
  cacheTtlMs?: number;
  minimumStandardCardCount?: number;
  expectedStaticUrlCount?: number;
  staticLastModifiedMs?: number;
  retryAfterSeconds?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
};

const MAX_SITEMAP_ENTRIES = 50_000;
const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;

function canonicalOrigin(value: string | undefined): string {
  try {
    const parsed = new URL(value ?? 'https://arena.hs-manacost.ru');
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('unsupported protocol');
    return parsed.origin;
  } catch {
    return 'https://arena.hs-manacost.ru';
  }
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function assertXmlSize(xml: string, maximum: number): string {
  if (Buffer.byteLength(xml, 'utf8') > maximum) throw new Error(`Sitemap document exceeds ${maximum} bytes`);
  return xml;
}

export function renderSitemapUrlset(entries: SitemapUrlEntry[], limits: XmlLimits = {}): string {
  const maxEntries = Math.min(MAX_SITEMAP_ENTRIES, Math.max(1, limits.maxEntries ?? MAX_SITEMAP_ENTRIES));
  const maxBytes = Math.min(MAX_SITEMAP_BYTES, Math.max(256, limits.maxBytes ?? MAX_SITEMAP_BYTES));
  if (entries.length > maxEntries) throw new Error(`Sitemap exceeds the 50,000 URL limit (${entries.length})`);
  const locations = new Set<string>();
  const rows = entries.map(entry => {
    if (!entry?.location || locations.has(entry.location)) throw new Error('Sitemap contains an invalid or duplicate location');
    locations.add(entry.location);
    if (entry.lastmod && !/^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod)) throw new Error('Sitemap contains an invalid lastmod');
    return `  <url><loc>${escapeXml(entry.location)}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ''}</url>`;
  });
  return assertXmlSize(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`,
    maxBytes,
  );
}

export function renderSitemapIndex(locations: string[], limits: XmlLimits = {}): string {
  const maxEntries = Math.min(MAX_SITEMAP_ENTRIES, Math.max(1, limits.maxEntries ?? MAX_SITEMAP_ENTRIES));
  const maxBytes = Math.min(MAX_SITEMAP_BYTES, Math.max(256, limits.maxBytes ?? MAX_SITEMAP_BYTES));
  if (locations.length > maxEntries) throw new Error(`Sitemap index exceeds the 50,000 URL limit (${locations.length})`);
  if (new Set(locations).size !== locations.length || locations.some(location => !location)) {
    throw new Error('Sitemap index contains an invalid or duplicate location');
  }
  const rows = locations.map(location => `  <sitemap><loc>${escapeXml(location)}</loc></sitemap>`);
  return assertXmlSize(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</sitemapindex>\n`,
    maxBytes,
  );
}

export function projectStandardCardSitemapCatalog(
  cards: unknown[],
  originValue?: string,
): SitemapSemanticEntry[] {
  if (!Array.isArray(cards)) return [];
  const origin = canonicalOrigin(originValue);
  const counts = new Map<string, number>();
  const dbfOwners = new Map<number, string>();
  for (const raw of cards) {
    const card = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonRecord : {};
    const id = typeof card.card_id === 'string' ? card.card_id.trim() : '';
    if (card.catalogPending === true) continue;
    if (!isIndexableConstructedCard(card)) throw new Error('Standard card sitemap catalog contains an invalid entity');
    counts.set(id, (counts.get(id) ?? 0) + 1);
    const dbf = Number(card.dbf);
    if (Number.isSafeInteger(dbf) && dbf > 0) {
      const owner = dbfOwners.get(dbf);
      if (owner && owner !== id) throw new Error('Standard card sitemap catalog contains a DBF alias collision');
      dbfOwners.set(dbf, id);
    }
  }
  if ([...counts.values()].some(count => count !== 1)) {
    throw new Error('Standard card sitemap catalog contains a duplicate canonical ID');
  }
  return cards.flatMap(raw => {
    const card = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonRecord : {};
    if (card.catalogPending === true) return [];
    const projection = projectPublicConstructedCardSeoData(card, origin);
    const semanticHash = createHash('sha256').update(JSON.stringify(projection)).digest('hex');
    return [{
      key: projection.id,
      location: `${origin}/standard/cards/standard/${encodeURIComponent(projection.id)}/`,
      semanticHash,
    }];
  }).sort((left, right) => left.key.localeCompare(right.key, 'en'));
}

export function parseSitemapLocations(xml: string): string[] {
  if (!/<urlset\b[^>]*xmlns=["']http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9["']/i.test(xml)) return [];
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map(match => match[1]
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&'));
}

export function loadStaticSitemapArtifact(
  candidates: string[],
  options: { required: boolean; onMissing?: (message: string) => void },
): { path: string; urls: string[]; modifiedAt: number } | null {
  const pathname = candidates.find(candidate => existsSync(candidate));
  if (!pathname) {
    const message = 'Static sitemap artifact is missing; run the production build before starting sitemap routing';
    if (options.required) throw new Error(message);
    options.onMissing?.(message);
    return null;
  }
  const urls = parseSitemapLocations(readFileSync(pathname, 'utf8'));
  if (urls.length === 0) throw new Error('Static sitemap artifact is invalid or empty');
  return { path: pathname, urls, modifiedAt: statSync(pathname).mtimeMs };
}

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

export function createEntitySitemapRouter(dependencies: EntitySitemapRouterDependencies): Router {
  const router = Router({ caseSensitive: true, strict: true });
  const origin = canonicalOrigin(dependencies.canonicalOrigin);
  const now = dependencies.now ?? Date.now;
  const cacheTtlMs = Math.max(5 * 60_000, Math.min(15 * 60_000, dependencies.cacheTtlMs ?? 10 * 60_000));
  const maxAgeSeconds = Math.floor(cacheTtlMs / 1_000);
  const retryAfterSeconds = Math.max(1, Math.floor(dependencies.retryAfterSeconds ?? 300));
  const expectedStaticUrlCount = Math.max(1, Math.floor(dependencies.expectedStaticUrlCount ?? 24));
  if (!Array.isArray(dependencies.staticUrls) || dependencies.staticUrls.length !== expectedStaticUrlCount) {
    throw new Error(`Static sitemap must contain exactly ${expectedStaticUrlCount} URLs`);
  }
  const staticLocations = new Set<string>();
  for (const location of dependencies.staticUrls) {
    let parsed: URL;
    try {
      parsed = new URL(location);
    } catch {
      throw new Error('Static sitemap contains an invalid URL');
    }
    if (parsed.origin !== origin || parsed.search || parsed.hash
      || (parsed.pathname !== '/' && !parsed.pathname.endsWith('/'))
      || /^\/(?:admin|404|api|health|metrics|_internal|r|decks|jobs)(?:\/|$)/.test(parsed.pathname)
      || staticLocations.has(parsed.href)) {
      throw new Error('Static sitemap contains an invalid, private, noindex or duplicate URL');
    }
    staticLocations.add(parsed.href);
  }
  const store = new SemanticSitemapStore({
    directory: dependencies.stateDirectory,
    filename: dependencies.stateFilename,
    canonicalOrigin: origin,
    now,
    minimumEntryCount: dependencies.minimumStandardCardCount ?? 500,
  });
  const indexDocument = documentFromXml(renderSitemapIndex([
    `${origin}/sitemaps/static.xml`,
    `${origin}/sitemaps/standard-cards.xml`,
  ]), 'static', null, Number.POSITIVE_INFINITY);
  const staticDocument = documentFromXml(
    renderSitemapUrlset(dependencies.staticUrls.map(location => ({ location }))),
    'static',
    Number.isFinite(dependencies.staticLastModifiedMs) ? dependencies.staticLastModifiedMs! : null,
    Number.POSITIVE_INFINITY,
  );
  let standardCache: CachedDocument | null = null;
  let standardJob: Promise<CachedDocument> | null = null;

  const loadStandardDocument = async (): Promise<CachedDocument> => {
    const current = now();
    if (standardCache && standardCache.expiresAt > current) return standardCache;
    if (standardJob) return standardJob;
    const job = (async () => {
      try {
        const cards = await dependencies.loadStandardCards();
        const candidate = projectStandardCardSitemapCatalog(cards, origin);
        const state = store.publish(candidate);
        const document = dynamicDocument(state, 'catalog', now() + cacheTtlMs);
        standardCache = document;
        return document;
      } catch (error) {
        try { dependencies.onError?.(error); } catch { /* diagnostics must never alter the public contract */ }
        const lastKnownGood = store.readLastKnownGood();
        if (!lastKnownGood) throw error;
        const document = dynamicDocument(lastKnownGood, 'last-known-good', now() + cacheTtlMs);
        standardCache = document;
        return document;
      }
    })().finally(() => {
      if (standardJob === job) standardJob = null;
    });
    standardJob = job;
    return job;
  };

  const fixedHandler = (document: CachedDocument): RequestHandler => (request, response) => (
    sendDocument(request, response, document, maxAgeSeconds)
  );
  router.get('/sitemap.xml', fixedHandler(indexDocument));
  router.get('/sitemaps/static.xml', fixedHandler(staticDocument));
  router.get('/sitemaps/standard-cards.xml', async (request, response) => {
    try {
      return sendDocument(request, response, await loadStandardDocument(), maxAgeSeconds);
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
