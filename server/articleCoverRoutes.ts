import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Router, type Request, type Response as ExpressResponse } from 'express';
import { ArticleCoverCache, canonicalArticleCoverUrl, type ArticleCoverEntry } from './articleCoverCache.js';
import {
  ARTICLE_COVER_VARIANT_ENCODING,
  type ArticleCoverFormat,
  createConcurrencyLimit,
  encodeArticleCoverVariant,
  isTransformableCoverType,
} from './articleCoverVariant.js';

/**
 * Widths `?w=` may request. Any other value is rejected, so the number of
 * re-encodes and cache entries per cover stays bounded. The article UI
 * (src/modules/articles, src/modules/home) builds its srcset from the same
 * list; tests/article-cover-markup.test.tsx keeps the copies equal.
 */
export const ARTICLE_COVER_WIDTHS = [480, 720, 960] as const;

const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CACHE_MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_CACHE_MAX_ENTRIES = 512;
/** The only names server/adminImageUploadRoutes.ts generates; anything else could leave the upload directory. */
const UPLOAD_NAME = /^[a-z0-9-]+\.webp$/;

export type ArticleCoverRouterDependencies = {
  allowedHosts: ReadonlySet<string>;
  maxBytes: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRedirects?: number;
  /** In-memory LRU of relayed covers and variants; entries live this long (default 24 h, the browser max-age). */
  cacheTtlMs?: number;
  cacheMaxBytes?: number;
  cacheMaxEntries?: number;
  now?: () => number;
  /** Re-encodes run at most this many at a time (default 2); the rest wait their turn. */
  maxConcurrentEncodes?: number;
  encodeVariant?: (source: Buffer, width: number, format: ArticleCoverFormat) => Promise<Buffer | null>;
  /**
   * Bytes of the admin upload `/uploads/admin/<name>`, or null when it does
   * not exist. Without it `?upload=` is rejected. Upload names are unique per
   * file, so their variants are cached like the canonical editorial covers.
   */
  readUpload?: (name: string) => Promise<Buffer | null>;
};

type CoverVariant = { width: number | null; format: ArticleCoverFormat };

/** `readUpload` for the admin upload directory. The router admits only generated names, so the join stays inside it. */
export function adminUploadReader(directory: string): (name: string) => Promise<Buffer | null> {
  return name => readFile(join(directory, name)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
}

type LoadDependencies = Required<Pick<ArticleCoverRouterDependencies, 'fetchImpl' | 'timeoutMs' | 'maxRedirects'>>
  & Pick<ArticleCoverRouterDependencies, 'allowedHosts' | 'maxBytes'>
  & { encode: (source: Buffer, width: number, format: ArticleCoverFormat) => Promise<Buffer | null> };

type CoverResult =
  | { kind: 'cover'; entry: ArticleCoverEntry; cacheable: boolean }
  | { kind: 'error'; status: number; error: string };

function parseAllowedUrl(value: string, allowedHosts: ReadonlySet<string>): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return allowedHosts.has(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
}

/** `null` asks for the original bytes; `false` is a width outside the allowlist. */
function parseCoverWidth(value: unknown): number | null | false {
  if (value === undefined) return null;
  return ARTICLE_COVER_WIDTHS.find(width => String(width) === value) ?? false;
}

/** WebP unless `avif` is asked for; a format is a re-encode, so it needs a width. */
function parseCoverFormat(value: unknown, width: number | null): ArticleCoverFormat | false {
  if (value === undefined) return 'webp';
  return value === 'avif' && width !== null ? 'avif' : false;
}

function parseVariant(query: Request['query']): CoverVariant | null {
  const width = parseCoverWidth(query.w);
  if (width === false) return null;
  const format = parseCoverFormat(query.format, width);
  return format === false ? null : { width, format };
}

async function fetchAllowedImage(
  initialUrl: URL,
  dependencies: Required<Pick<ArticleCoverRouterDependencies, 'fetchImpl' | 'timeoutMs' | 'maxRedirects'>>
    & Pick<ArticleCoverRouterDependencies, 'allowedHosts'>,
): Promise<{ response: Response; finalUrl: URL }> {
  let currentUrl = initialUrl;
  for (let redirectCount = 0; redirectCount <= dependencies.maxRedirects; redirectCount += 1) {
    const response = await dependencies.fetchImpl(currentUrl, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
        'User-Agent': 'HS-Arena article cover proxy/1.0',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(dependencies.timeoutMs),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: currentUrl };
    }
    if (redirectCount === dependencies.maxRedirects) throw new Error('Слишком много перенаправлений');
    const location = response.headers.get('location');
    const redirectedUrl = location ? parseAllowedUrl(new URL(location, currentUrl).href, dependencies.allowedHosts) : null;
    if (!redirectedUrl) throw new Error('Перенаправление на запрещённый домен');
    currentUrl = redirectedUrl;
  }
  throw new Error('Слишком много перенаправлений');
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel('article cover exceeds byte limit');
        const error = new Error('Обложка слишком большая');
        error.name = 'ArticleCoverTooLargeError';
        throw error;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}

function coverEtag(identity: string, source: Buffer, variant: string): string {
  const hash = createHash('sha1').update(identity).update(source);
  if (variant) hash.update(variant);
  return `"article-cover-${hash.digest('hex')}"`;
}

async function withVariant(
  original: ArticleCoverEntry, source: Buffer, identity: string, { width, format }: CoverVariant, encode: LoadDependencies['encode'],
): Promise<CoverResult> {
  if (width === null || !isTransformableCoverType(original.contentType)) return { kind: 'cover', entry: original, cacheable: true };
  try {
    const body = await encode(source, width, format);
    if (!body) return { kind: 'cover', entry: original, cacheable: true };
    const etag = coverEtag(identity, source, `w${width}-${ARTICLE_COVER_VARIANT_ENCODING[format]}`);
    return { kind: 'cover', entry: { body, contentType: `image/${format}`, etag }, cacheable: true };
  } catch {
    // A decoder failure may be transient, so the fallback is not cached.
    return { kind: 'cover', entry: original, cacheable: false };
  }
}

async function loadCover(target: URL, variant: CoverVariant, dependencies: LoadDependencies): Promise<CoverResult> {
  try {
    const { response: upstream, finalUrl } = await fetchAllowedImage(target, dependencies);
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = Number(upstream.headers.get('content-length') || 0);
    const rejection = !upstream.ok ? { status: upstream.status, error: 'Обложка недоступна' }
      : !/^image\//i.test(contentType) || /^image\/svg\+xml/i.test(contentType)
        ? { status: 415, error: 'URL не ведёт на изображение' }
        : Number.isFinite(contentLength) && contentLength > dependencies.maxBytes
          ? { status: 413, error: 'Обложка слишком большая' } : null;
    if (rejection) {
      await upstream.body?.cancel().catch(() => undefined);
      return { kind: 'error', ...rejection };
    }
    const source = await readLimitedBody(upstream, dependencies.maxBytes);
    const original = { body: source, contentType, etag: coverEtag(finalUrl.href, source, '') };
    return await withVariant(original, source, finalUrl.href, variant, dependencies.encode);
  } catch (error) {
    if (error instanceof Error && error.name === 'ArticleCoverTooLargeError') {
      return { kind: 'error', status: 413, error: 'Обложка слишком большая' };
    }
    return { kind: 'error', status: 502, error: error instanceof Error ? error.message : 'Не удалось загрузить обложку' };
  }
}

async function loadUpload(
  name: string, variant: CoverVariant, readUpload: (name: string) => Promise<Buffer | null>, dependencies: LoadDependencies,
): Promise<CoverResult> {
  let source: Buffer | null;
  try {
    source = await readUpload(name);
  } catch {
    return { kind: 'error', status: 502, error: 'Не удалось загрузить обложку' };
  }
  if (!source) return { kind: 'error', status: 404, error: 'Обложка недоступна' };
  if (source.length > dependencies.maxBytes) return { kind: 'error', status: 413, error: 'Обложка слишком большая' };
  const identity = `/uploads/admin/${name}`;
  const original = { body: source, contentType: 'image/webp', etag: coverEtag(identity, source, '') };
  return withVariant(original, source, identity, variant, dependencies.encode);
}

/** The response never varies by request header: the format is part of the URL (`?format=avif`), so no Vary is sent. */
function sendCover(request: Request, response: ExpressResponse, entry: ArticleCoverEntry, cacheStatus: 'HIT' | 'MISS') {
  response.set('Cache-Control', CACHE_CONTROL);
  response.set('ETag', entry.etag);
  response.set('Content-Type', entry.contentType);
  response.set('X-Content-Type-Options', 'nosniff');
  response.set('X-Article-Cover-Cache', cacheStatus);
  if (request.headers['if-none-match'] === entry.etag) return response.status(304).end();
  return response.send(entry.body);
}

/**
 * Relays allowlisted editorial covers (`?url=`) and admin uploads
 * (`?upload=<name>`). `?w=` returns a WebP no wider than an allowlisted width,
 * `&format=avif` an AVIF instead. HTTPS upload files (canonicalArticleCoverUrl) are kept in
 * a bounded in-memory LRU and concurrent misses share one upstream fetch, so a
 * cached cover or its revalidation never reaches the upstream. Only responses
 * that passed the host, redirect, type and size checks are ever cached.
 */
export function createArticleCoverRouter(dependencies: ArticleCoverRouterDependencies): Router {
  const router = Router();
  const encodeLimit = createConcurrencyLimit(dependencies.maxConcurrentEncodes ?? 2);
  const encodeVariant = dependencies.encodeVariant ?? encodeArticleCoverVariant;
  const loadDependencies: LoadDependencies = {
    allowedHosts: dependencies.allowedHosts,
    maxBytes: dependencies.maxBytes,
    fetchImpl: dependencies.fetchImpl ?? fetch,
    timeoutMs: dependencies.timeoutMs ?? 10_000,
    maxRedirects: dependencies.maxRedirects ?? 3,
    encode: (source, width, format) => encodeLimit(() => encodeVariant(source, width, format)),
  };
  const cache = new ArticleCoverCache({
    ttlMs: dependencies.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    maxBytes: dependencies.cacheMaxBytes ?? DEFAULT_CACHE_MAX_BYTES,
    maxEntries: dependencies.cacheMaxEntries ?? DEFAULT_CACHE_MAX_ENTRIES,
  }, dependencies.now ?? Date.now);
  const inFlight = new Map<string, Promise<CoverResult>>();

  const loadOnce = (key: string, load: () => Promise<CoverResult>, cacheable: boolean): Promise<CoverResult> => {
    const pending = inFlight.get(key);
    if (pending) return pending;
    const loading = load().then(result => {
      if (cacheable && result.kind === 'cover' && result.cacheable) cache.set(key, result.entry);
      return result;
    }).finally(() => inFlight.delete(key));
    inFlight.set(key, loading);
    return loading;
  };

  const respond = async (request: Request, response: ExpressResponse, key: string, load: () => Promise<CoverResult>, cacheable: boolean) => {
    const cached = cacheable ? cache.get(key) : undefined;
    if (cached) return sendCover(request, response, cached, 'HIT');
    const result = await loadOnce(key, load, cacheable);
    if (result.kind === 'error') return response.status(result.status).json({ error: result.error });
    return sendCover(request, response, result.entry, 'MISS');
  };

  router.get('/article-cover', async (request, response) => {
    const { upload } = request.query;
    if (upload !== undefined) {
      if (request.query.url !== undefined || !dependencies.readUpload || typeof upload !== 'string' || !UPLOAD_NAME.test(upload)) {
        return response.status(400).json({ error: 'Недопустимая обложка' });
      }
      const variant = parseVariant(request.query);
      if (!variant) return response.status(400).json({ error: 'Недопустимая ширина или формат обложки' });
      const { readUpload } = dependencies;
      const key = `upload:${upload}|${variant.width ?? 'original'}|${variant.format}`;
      return respond(request, response, key, () => loadUpload(upload, variant, readUpload, loadDependencies), true);
    }

    const requested = String(request.query.url ?? '').trim();
    const target = parseAllowedUrl(requested, dependencies.allowedHosts);
    if (!target) return response.status(400).json({ error: 'Домен обложки не разрешён' });
    const variant = parseVariant(request.query);
    if (!variant) return response.status(400).json({ error: 'Недопустимая ширина или формат обложки' });

    // Anything else is relayed as before: uncached and never re-encoded.
    const canonical = canonicalArticleCoverUrl(requested, target, dependencies.allowedHosts);
    if (!canonical) {
      return respond(request, response, `${target.href}|original`,
        () => loadCover(target, { width: null, format: 'webp' }, loadDependencies), false);
    }
    const key = `${canonical.href}|${variant.width ?? 'original'}|${variant.format}`;
    return respond(request, response, key, () => loadCover(canonical, variant, loadDependencies), true);
  });

  return router;
}
