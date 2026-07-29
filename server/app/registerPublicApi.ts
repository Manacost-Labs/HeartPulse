import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import {
  createAdminApiKeyRouter,
  createApiKeyManager,
  createPublicApiRouter,
  createSqliteApiKeyRepository,
  initializePublicApiKeyRepository,
} from '../modules/publicApi/public.js';

type RegisterPublicApiDependencies<TAdmin> = {
  app: Application;
  getDatabase: () => DatabaseSync;
  adminAuth: (request: Request) => TAdmin | null;
  adminId: (admin: TAdmin) => string;
  setPrivateNoStore: (response: Response) => void;
  recordAudit: (
    admin: TAdmin,
    action: string,
    entityType: string,
    entityId: string,
    details?: Record<string, unknown>,
  ) => void;
};

/** Registers the public API and its administrator credential lifecycle. */
export function registerPublicApi<TAdmin>(dependencies: RegisterPublicApiDependencies<TAdmin>): void {
  initializePublicApiKeyRepository(dependencies.getDatabase);
  const apiKeys = createApiKeyManager({
    repository: createSqliteApiKeyRepository(dependencies.getDatabase),
  });
  dependencies.app.use('/api/v1', createPublicApiRouter({ apiKeys }));
  dependencies.app.use('/api', createAdminApiKeyRouter({
    apiKeys,
    adminAuth: dependencies.adminAuth,
    adminId: admin => dependencies.adminId(admin as TAdmin),
    setPrivateNoStore: dependencies.setPrivateNoStore,
    recordAudit: (admin, action, entityType, entityId, details) => {
      dependencies.recordAudit(admin as TAdmin, action, entityType, entityId, details);
    },
  }));
}
