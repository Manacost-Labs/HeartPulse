import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { ApplicationAuthManager } from '../modules/applicationAuth/public.js';
import { archetypeFallbackTranslations } from '../modules/constructedArchetypes/public.js';
import {
  createReplayShareRouter,
  createSqliteReplayShareRepository,
  initializeReplayShareRepository,
  type ReplayShareRepository,
} from '../modules/replayShares/public.js';
import { getTrustedClientIp } from '../networkBoundary.js';

type RegisterReplaySharesDependencies = {
  app: Application;
  getDatabase: () => DatabaseSync;
  accessTokens: ApplicationAuthManager;
  setPrivateNoStore: (response: Response) => void;
  userAuth: (request: Request) => { id: string } | null;
  publicOrigin: string;
  resolveCardNames?: (cardIds: string[]) => Promise<Record<string, string>>;
  /** Runs the daily retention prune (off where background jobs are off). */
  backgroundJobs: boolean;
};

const clientKey = (request: Request) => ipKeyGenerator(getTrustedClientIp(request) || 'unknown');
// The public page reads the API from the Next server over loopback: that is every viewer, not one client.
const loopback = (request: Request) => request.ip === '127.0.0.1' || request.ip === '::1';

/**
 * Uploads: 20 an hour from one address (a player uploads a game now and then); deleting is not counted. Reads: 120 a
 * minute from one address, the site's own page excepted.
 */
export function registerReplaySharesRateLimit(app: Application): void {
  const uploads = rateLimit({ windowMs: 60 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false, keyGenerator: clientKey });
  app.post('/api/v1/tracker/replays', uploads);
  app.use('/api/v1/replays', rateLimit({
    windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false, keyGenerator: clientKey, skip: loopback,
  }));
}

/**
 * Web replays (plan 2.2, docs in the module): upload from the app, the public page's read, deleting. Returns the
 * repository's readers, so the account's data export includes the replays and the profile links its games to them.
 */
export function registerReplayShares(dependencies: RegisterReplaySharesDependencies): Pick<ReplayShareRepository, 'exportRows' | 'replaysOfGames'> {
  initializeReplayShareRepository(dependencies.getDatabase);
  const knownArchetypes = new Set(Object.keys(archetypeFallbackTranslations()).map(name => name.toLowerCase()));
  const repository = createSqliteReplayShareRepository(dependencies.getDatabase);
  const router = createReplayShareRouter({
    accessTokens: dependencies.accessTokens,
    repository,
    knownArchetypes,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    userAuth: dependencies.userAuth,
    publicOrigin: dependencies.publicOrigin,
    resolveCardNames: dependencies.resolveCardNames,
  });
  dependencies.app.use('/api', router);
  if (dependencies.backgroundJobs) {
    // The retention holds without uploads too: at start, then once a day.
    const prune = () => {
      try {
        router.prune();
      } catch (error) {
        console.warn('[replays] Retention prune failed:', (error as Error)?.message ?? error);
      }
    };
    setTimeout(prune, 60_000).unref();
    setInterval(prune, 24 * 60 * 60_000).unref();
  }
  return { exportRows: repository.exportRows, replaysOfGames: repository.replaysOfGames };
}
