import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { ApplicationAuthManager } from '../modules/applicationAuth/public.js';
import {
  createSqliteTrackerEventRepository,
  createTrackerAccountDataRouter,
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
  /** Called after new events of an account were stored. */
  onStored?: (userId: string) => void;
  /** The site session of the account page, for the export and deletion of the own data. */
  userAuth: (request: Request) => { id: string } | null;
  /** Called after the account deleted its tracker data. */
  onDeleted?: (userId: string) => void;
};

export function registerTrackerIngestionRateLimit(app: Application): void {
  app.use('/api/v1/tracker/events/batch', rateLimit({
    windowMs: 15 * 60_000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  }));
  // An export reads every event of the account; a few per hour are enough.
  app.use('/api/account/tracker-data/export', rateLimit({ windowMs: 60 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false }));
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
    onStored: dependencies.onStored,
  }));
  dependencies.app.use('/api', createTrackerAccountDataRouter({
    userAuth: dependencies.userAuth,
    repository,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    onDeleted: dependencies.onDeleted,
  }));
  return repository;
}
