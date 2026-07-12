import { Router, type Request, type RequestHandler, type Response } from 'express';

type DatasetEntry = { data?: Record<string, any>; mtime?: number };
type AuthenticatedUser = { id: string };

export type OperationalRouterDependencies = {
  loadDataset: (filename: 'winrates.json' | 'tierlist.json') => DatasetEntry | null;
  authenticate: (request: Request) => AuthenticatedUser | null;
  isAdmin: (user: AuthenticatedUser | null) => boolean;
  getClientIp: (request: Request) => string;
  scrapeGuard: RequestHandler;
  scrapeLimiter: RequestHandler;
  scrapeQueueHandler: RequestHandler;
  publicCacheHeader?: string;
};

function setPrivateNoStore(response: Response) {
  response.set('Cache-Control', 'no-store');
  response.vary('Cookie');
  response.vary('Authorization');
}

export function createOperationalRouter(dependencies: OperationalRouterDependencies): Router {
  const router = Router();
  const cacheHeader = dependencies.publicCacheHeader ?? 'public, max-age=300, stale-while-revalidate=300';

  router.get('/status', (request, response) => {
    const winrates = dependencies.loadDataset('winrates.json');
    const tierlist = dependencies.loadDataset('tierlist.json');
    const data = {
      winrates: {
        updatedAt: winrates?.data?.updatedAt ?? null,
        source: winrates?.data?.source ?? null,
      },
      tierlist: {
        updatedAt: tierlist?.data?.updatedAt ?? null,
        source: tierlist?.data?.source ?? null,
      },
      nextScrape: 'каждые 6 часов',
    };
    const etag = `"status-${winrates?.mtime?.toString(36) ?? '0'}-${tierlist?.mtime?.toString(36) ?? '0'}"`;
    response.set('Cache-Control', cacheHeader);
    response.set('ETag', etag);
    if (request.headers['if-none-match'] === etag) return response.status(304).end();
    return response.json(data);
  });

  router.post(
    '/scrape',
    dependencies.scrapeGuard,
    dependencies.scrapeLimiter,
    dependencies.scrapeQueueHandler,
  );

  router.get('/check-ip', (request, response) => {
    setPrivateNoStore(response);
    const user = dependencies.authenticate(request);
    return response.json({
      allowed: dependencies.isAdmin(user),
      id: user?.id ?? null,
      ip: dependencies.getClientIp(request),
    });
  });

  return router;
}
