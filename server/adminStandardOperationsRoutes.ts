import { Router, type Request, type RequestHandler, type Response } from 'express';

type AdminIdentity = { id: string };
export type StandardCacheTarget = 'meta' | 'recommendations' | 'previews' | 'all';

export type AdminStandardOperationsDependencies = {
  adminGuard: RequestHandler;
  adminAuth: (request: Request) => AdminIdentity | null;
  getStatus: () => Record<string, unknown>;
  resetCache: (target: StandardCacheTarget) => void;
  setPrivateNoStore: (response: Response) => void;
  recordAudit?: (actor: AdminIdentity, action: string, entityId: string) => void;
};

const TARGETS = new Set<StandardCacheTarget>(['meta', 'recommendations', 'previews', 'all']);

export function createAdminStandardOperationsRouter(dependencies: AdminStandardOperationsDependencies): Router {
  const router = Router();
  router.use('/admin/standard-operations', dependencies.adminGuard, (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  });

  router.get('/admin/standard-operations', (_request, response) => response.json(dependencies.getStatus()));
  router.post('/admin/standard-operations/reset', (request, response) => {
    const actor = dependencies.adminAuth(request);
    if (!actor) return response.status(401).json({ error: 'Требуется вход' });
    const target = String(request.body?.target ?? '') as StandardCacheTarget;
    if (!TARGETS.has(target)) return response.status(400).json({ error: 'Неизвестная группа кеша' });
    dependencies.resetCache(target);
    dependencies.recordAudit?.(actor, 'standard-cache.reset', target);
    return response.json({ success: true, target, status: dependencies.getStatus() });
  });
  return router;
}
