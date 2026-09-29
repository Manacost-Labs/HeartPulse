import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import { createAdminCrmRouter } from '../adminCrmRoutes.js';
import { createSqlRepository } from './sqlRepository.js';

type RegisterAdminCrmDependencies = {
  app: Application;
  getDatabase: () => DatabaseSync;
  adminAuth: (request: Request) => { id: string } | null;
  csrfAllowed: (request: Request) => boolean;
  setPrivateNoStore: (response: Response) => void;
  recordAudit: (actorId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown>) => void;
};

/** Mounts the admin CRM API (docs/specs/admin-crm.md). The schema is created with the ecosystem database. */
export function registerAdminCrm({ app, getDatabase, recordAudit, ...access }: RegisterAdminCrmDependencies): void {
  app.use('/api', createAdminCrmRouter({
    ...access,
    repository: createSqlRepository(getDatabase),
    recordAudit: (actorId, action, userId, details) => recordAudit(actorId, action, 'user', userId, details),
  }));
}
