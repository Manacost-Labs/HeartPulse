import type { DatabaseSync } from 'node:sqlite';
import type { Application, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { ApplicationAuthManager } from '../modules/applicationAuth/public.js';
import {
  createSqliteTrackerEventRepository,
  createTrackerIngestionRouter,
  initializeTrackerEventRepository,
} from '../modules/trackerIngestion/public.js';

type RegisterTrackerIngestionDependencies = {
  app: Application;
  getDatabase: () => DatabaseSync;
  accessTokens: ApplicationAuthManager;
  setPrivateNoStore: (response: Response) => void;
};

export function registerTrackerIngestionRateLimit(app: Application): void {
  app.use('/api/v1/tracker/events/batch', rateLimit({
    windowMs: 15 * 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }));
}

export function registerTrackerIngestion(dependencies: RegisterTrackerIngestionDependencies): void {
  initializeTrackerEventRepository(dependencies.getDatabase);
  dependencies.app.use('/api/v1', createTrackerIngestionRouter({
    accessTokens: dependencies.accessTokens,
    repository: createSqliteTrackerEventRepository(dependencies.getDatabase),
    setPrivateNoStore: dependencies.setPrivateNoStore,
  }));
}
