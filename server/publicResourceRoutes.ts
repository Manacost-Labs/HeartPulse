import { Readable, Transform } from 'node:stream';
import { Router, type Request, type Response as ExpressResponse } from 'express';
import {
  battlegroundImageTransformFromQuery,
  optimizeBattlegroundImage,
} from './battlegroundImageOptimization.js';
import {
  PUBLIC_RESOURCE_SOURCES,
  type PublicResourceSource,
} from '../shared/publicResourceUrl.js';

type PublicResourceSourceKey = keyof typeof PUBLIC_RESOURCE_SOURCES;

const MAX_PUBLIC_RESOURCE_BYTES = 32 * 1024 * 1024;
const PUBLIC_CACHE_HEADER = 'public, max-age=86400, stale-while-revalidate=604800';
const SOURCE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
const MAX_PUBLIC_RESOURCE_REDIRECTS = 3;

type PublicResourceRouterOptions = {
  fetchResource?: (url: string, init?: RequestInit) => Promise<Response>;
};

function publicResourceSource(value: unknown): PublicResourceSource | null {
  const key = String(value ?? '').trim();
  if (!SOURCE_KEY_PATTERN.test(key)) return null;
  return PUBLIC_RESOURCE_SOURCES[key as PublicResourceSourceKey] ?? null;
}

function requestedPublicResourceUrl(request: Request, source: PublicResourceSource): URL | null {
  const rawPath = String(request.params[0] ?? '');
  if (!rawPath || rawPath.includes('\0') || rawPath.includes('\\')) return null;

  const target = new URL(`/${rawPath}`, source.origin);
  if (
    target.origin !== source.origin
    || !source.allowedPathPrefixes.some(prefix => target.pathname.startsWith(prefix))
  ) {
    return null;
  }

  const requestUrl = new URL(request.originalUrl, 'https://arena.hs-manacost.ru');
  requestUrl.searchParams.delete('width');
  requestUrl.searchParams.delete('quality');
  requestUrl.searchParams.delete('format');
  target.search = requestUrl.search;
  return target;
}

function isAllowedFinalUrl(value: string, source: PublicResourceSource): boolean {
  try {
    const finalUrl = new URL(value);
    return finalUrl.origin === source.origin
      && source.allowedPathPrefixes.some(prefix => finalUrl.pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

function isAllowedPublicContentType(contentType: string): boolean {
  if (/^image\/svg\+xml(?:;|$)/i.test(contentType)) return false;
  return /^(?:image|video|audio)\//i.test(contentType)
    || /^application\/json(?:;|$)/i.test(contentType);
}

function copyPublicResourceHeaders(response: ExpressResponse, upstream: Response, contentType: string) {
  response.set('Cache-Control', PUBLIC_CACHE_HEADER);
  response.set('Content-Type', contentType);
  response.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.set('X-Content-Type-Options', 'nosniff');
  for (const header of ['accept-ranges', 'content-range', 'etag', 'last-modified'] as const) {
    const value = upstream.headers.get(header);
    if (value) response.set(header, value);
  }
  if (!upstream.headers.has('content-encoding')) {
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) response.set('Content-Length', contentLength);
  }
}

async function readLimitedResourceBody(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PUBLIC_RESOURCE_BYTES) {
        await reader.cancel('public resource exceeded the transformation size limit');
        throw new Error('Public resource exceeded the transformation size limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function createPublicResourceRouter(options: PublicResourceRouterOptions = {}): Router {
  const router = Router();
  const fetchResource = options.fetchResource ?? fetch;

  router.get('/public-resource/:source/*', async (request, response) => {
    const source = publicResourceSource(request.params.source);
    if (!source) return response.status(400).json({ error: 'Неизвестный источник ресурса' });

    const target = requestedPublicResourceUrl(request, source);
    if (!target) return response.status(400).json({ error: 'Некорректный путь ресурса' });
    const imageTransform = battlegroundImageTransformFromQuery(request.query as Record<string, unknown>);

    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)',
        ...(!imageTransform && request.headers.range ? { Range: request.headers.range } : {}),
      };
      let currentUrl = target;
      let upstream: Response | null = null;
      for (let redirectCount = 0; redirectCount <= MAX_PUBLIC_RESOURCE_REDIRECTS; redirectCount += 1) {
        upstream = await fetchResource(currentUrl.toString(), {
          headers,
          redirect: 'manual',
          signal: AbortSignal.timeout(20_000),
        });
        if (upstream.status < 300 || upstream.status >= 400) break;
        const location = upstream.headers.get('location');
        await upstream.body?.cancel();
        if (!location) throw new Error('Public resource redirect is missing a location');
        const nextUrl = new URL(location, currentUrl);
        if (!isAllowedFinalUrl(nextUrl.toString(), source)) {
          throw new Error('Public resource redirect left the source allowlist');
        }
        currentUrl = nextUrl;
        upstream = null;
      }
      if (!upstream) throw new Error('Public resource exceeded the redirect limit');
      const finalUrl = upstream.url || currentUrl.toString();
      const contentType = String(upstream.headers.get('content-type') ?? '').trim().toLowerCase();
      const contentLength = Number(upstream.headers.get('content-length'));
      if (
        !upstream.ok
        || !isAllowedFinalUrl(finalUrl, source)
        || !isAllowedPublicContentType(contentType)
        || (Number.isFinite(contentLength) && contentLength > MAX_PUBLIC_RESOURCE_BYTES)
      ) {
        await upstream.body?.cancel();
        return response.status(502).json({ error: 'Источник вернул некорректный ресурс' });
      }

      response.status(upstream.status);
      if (imageTransform && contentType.startsWith('image/') && upstream.body) {
        const optimized = await optimizeBattlegroundImage(
          await readLimitedResourceBody(upstream.body),
          imageTransform,
        );
        response.status(200);
        response.set('Cache-Control', PUBLIC_CACHE_HEADER);
        response.set('Content-Type', optimized.contentType);
        response.set('Content-Length', String(optimized.body.byteLength));
        response.set('Cross-Origin-Resource-Policy', 'same-origin');
        response.set('X-Content-Type-Options', 'nosniff');
        return response.end(optimized.body);
      }

      copyPublicResourceHeaders(response, upstream, contentType);
      if (!upstream.body) return response.end();

      let streamedBytes = 0;
      const sizeLimiter = new Transform({
        transform(chunk, _encoding, callback) {
          streamedBytes += chunk.length;
          if (streamedBytes > MAX_PUBLIC_RESOURCE_BYTES) {
            callback(new Error('Public resource exceeded the streaming size limit'));
            return;
          }
          callback(null, chunk);
        },
      });
      const stream = Readable.fromWeb(upstream.body as any);
      const handleStreamError = (error: Error) => {
        console.warn('[public-resource] stream interrupted', target.toString(), error);
        response.destroy(error);
      };
      stream.on('error', handleStreamError);
      sizeLimiter.on('error', handleStreamError);
      response.once('close', () => {
        stream.destroy();
        sizeLimiter.destroy();
      });
      return stream.pipe(sizeLimiter).pipe(response);
    } catch (error) {
      console.warn('[public-resource] unavailable', target.toString(), error);
      return response.status(502).json({ error: 'Ресурс временно недоступен' });
    }
  });

  return router;
}
