import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { ApplicationAuthManager } from '../modules/applicationAuth/public.js';
import { archetypeFallbackTranslations } from '../modules/constructedArchetypes/public.js';
import {
  createReplayShareRouter,
  createSqliteReplayShareRepository,
  initializeReplayShareRepository,
} from '../modules/replayShares/public.js';

type RegisterReplaySharesDependencies = {
  app: Application;
  getDatabase: () => DatabaseSync;
  accessTokens: ApplicationAuthManager;
  setPrivateNoStore: (response: Response) => void;
  userAuth: (request: Request) => { id: string } | null;
  publicOrigin: string;
  resolveCardNames?: (cardIds: string[]) => Promise<Record<string, string>>;
};

/** Uploads: 20 an hour from one address (a player uploads a game now and then); reads: 120 a minute. */
export function registerReplaySharesRateLimit(app: Application): void {
  app.use('/api/v1/tracker/replays', rateLimit({ windowMs: 60 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/v1/replays', rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));
}

/** Web replays (plan 2.2, docs in the module): upload from the app, the public page's read, deleting. */
export function registerReplayShares(dependencies: RegisterReplaySharesDependencies): void {
  initializeReplayShareRepository(dependencies.getDatabase);
  const knownArchetypes = new Set(Object.keys(archetypeFallbackTranslations()).map(name => name.toLowerCase()));
  dependencies.app.use('/api', createReplayShareRouter({
    accessTokens: dependencies.accessTokens,
    repository: createSqliteReplayShareRepository(dependencies.getDatabase),
    knownArchetypes,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    userAuth: dependencies.userAuth,
    publicOrigin: dependencies.publicOrigin,
    resolveCardNames: dependencies.resolveCardNames,
  }));
}
