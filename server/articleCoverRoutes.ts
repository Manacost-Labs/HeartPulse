import { createHash } from 'node:crypto';
import { Router } from 'express';

export type ArticleCoverRouterDependencies = {
  allowedHosts: ReadonlySet<string>;
  maxBytes: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRedirects?: number;
};

function parseAllowedUrl(value: unknown, allowedHosts: ReadonlySet<string>): URL | null {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return allowedHosts.has(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
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

export function createArticleCoverRouter(dependencies: ArticleCoverRouterDependencies): Router {
  const router = Router();
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const timeoutMs = dependencies.timeoutMs ?? 10_000;
  const maxRedirects = dependencies.maxRedirects ?? 3;

  router.get('/article-cover', async (request, response) => {
    const target = parseAllowedUrl(request.query.url, dependencies.allowedHosts);
    if (!target) return response.status(400).json({ error: 'Домен обложки не разрешён' });

    try {
      const { response: upstream, finalUrl } = await fetchAllowedImage(target, {
        allowedHosts: dependencies.allowedHosts,
        fetchImpl,
        timeoutMs,
        maxRedirects,
      });
      if (!upstream.ok) return response.status(upstream.status).json({ error: 'Обложка недоступна' });

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      if (!contentType.toLowerCase().startsWith('image/')) {
        return response.status(415).json({ error: 'URL не ведёт на изображение' });
      }

      const contentLength = Number(upstream.headers.get('content-length') || 0);
      if (Number.isFinite(contentLength) && contentLength > dependencies.maxBytes) {
        return response.status(413).json({ error: 'Обложка слишком большая' });
      }

      const body = await readLimitedBody(upstream, dependencies.maxBytes);
      const etag = `"article-cover-${createHash('sha1').update(finalUrl.href).update(body).digest('hex')}"`;
      response.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      response.set('ETag', etag);
      response.set('Content-Type', contentType);
      response.set('X-Content-Type-Options', 'nosniff');
      if (request.headers['if-none-match'] === etag) return response.status(304).end();
      return response.send(body);
    } catch (error: any) {
      if (error?.name === 'ArticleCoverTooLargeError') {
        return response.status(413).json({ error: 'Обложка слишком большая' });
      }
      return response.status(502).json({ error: error?.message ?? 'Не удалось загрузить обложку' });
    }
  });

  return router;
}
