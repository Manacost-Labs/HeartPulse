import type { DatabaseSync } from 'node:sqlite';
import type { Application, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { ApplicationAuthManager } from '../modules/applicationAuth/public.js';
import {
  createSqliteTrackerEventRepository,
  createTrackerIngestionRouter,
  initializeTrackerEventRepository,
  type TrackerEventRepository,
  type TrackerPayloadValidator,
} from '../modules/trackerIngestion/public.js';

type RegisterTrackerIngestionDependencies = {
  app: Application;
  getDatabase: () => DatabaseSync;
  accessTokens: ApplicationAuthManager;
  setPrivateNoStore: (response: Response) => void;
  /** Strict check of `schemaVersion` 2 payloads, owned by the statistics module. */
  validatePayload?: TrackerPayloadValidator;
};

export function registerTrackerIngestionRateLimit(app: Application): void {
  app.use('/api/v1/tracker/events/batch', rateLimit({
    windowMs: 15 * 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }));
}

/** Returns the repository so composition can hand its event reader to the account statistics. */
export function registerTrackerIngestion(dependencies: RegisterTrackerIngestionDependencies): TrackerEventRepository {
  initializeTrackerEventRepository(dependencies.getDatabase);
  const repository = createSqliteTrackerEventRepository(dependencies.getDatabase);
  dependencies.app.use('/api/v1', createTrackerIngestionRouter({
    accessTokens: dependencies.accessTokens,
    repository,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    validatePayload: dependencies.validatePayload,
  }));
  return repository;
}
