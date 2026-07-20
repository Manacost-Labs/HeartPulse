import { Router, type Request } from 'express';
import type { TierlistDataResult } from './tierlistRoutes.js';

export interface TierlistCacheBustRouterDependencies {
  resolveSource: (source: string | undefined) => string | null;
  getData: (source: string, now: number, bypassCache: boolean) => Promise<TierlistDataResult>;
  now?: () => number;
  onError?: (source: string, error: unknown) => void;
}

const PROXY_IDENTITY_HEADERS = [
  'forwarded',
  'x-forwarded-for',
  'x-real-ip',
] as const;

export function isDirectLoopbackRequest(request: Request): boolean {
  if (PROXY_IDENTITY_HEADERS.some(header => request.headers[header] !== undefined)) return false;
  const remoteAddress = request.socket.remoteAddress ?? '';
  return remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1';
}

export function createTierlistCacheBustRouter(
  dependencies: TierlistCacheBustRouterDependencies,
): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;

  router.post('/tierlist/cache-bust', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    if (!isDirectLoopbackRequest(request)) return response.status(404).end();

    const requestedSource = typeof request.query.source === 'string'
      ? request.query.source
      : undefined;
    const source = dependencies.resolveSource(requestedSource);
    if (!source) return response.status(400).json({ error: 'Unknown tier-list source' });

    try {
      const result = await dependencies.getData(source, now(), true);
      return response.json({
        source,
        updatedAt: result.data?.updatedAt ?? null,
        provisional: result.data?.provisional === true,
        acceptedRows: result.data?.accepted_rows ?? null,
        etag: result.etag,
      });
    } catch (error) {
      dependencies.onError?.(source, error);
      return response.status(502).json({ error: 'Tier-list refresh failed' });
    }
  });

  return router;
}
