import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { ApplicationAuthManager } from '../modules/applicationAuth/public.js';
import {
  appUsageConfig,
  createAppUsageRouter,
  createSqliteAppUsageRepository,
  initializeAppUsageRepository,
  type AppUsageFeature,
} from '../modules/appUsage/public.js';
import { getTrustedClientIp } from '../networkBoundary.js';

type RegisterAppUsageDependencies = {
  app: Application;
  getDatabase: () => DatabaseSync;
  accessTokens: ApplicationAuthManager;
  hasSection: (userId: string, section: AppUsageFeature['section']) => boolean;
  setPrivateNoStore: (response: Response) => void;
  /** Runs the daily prune of old claims (off where background jobs are off). */
  backgroundJobs: boolean;
  environment?: NodeJS.ProcessEnv;
};

/** The app asks at the start of a game and on its screens: 120 a minute from one address is plenty. */
export function registerAppUsageRateLimit(app: Application): void {
  app.use('/api/v1/usage', rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (request: Request) => ipKeyGenerator(getTrustedClientIp(request) || 'unknown') }));
}

/** Daily free use of the app's paid analytics (plan 3.1, docs/specs/app-usage-limits.md). */
export function registerAppUsage(dependencies: RegisterAppUsageDependencies): void {
  initializeAppUsageRepository(dependencies.getDatabase);
  const repository = createSqliteAppUsageRepository(dependencies.getDatabase);
  dependencies.app.use('/api', createAppUsageRouter({
    accessTokens: dependencies.accessTokens,
    repository,
    config: appUsageConfig(dependencies.environment ?? process.env),
    hasSection: dependencies.hasSection,
    setPrivateNoStore: dependencies.setPrivateNoStore,
  }));
  if (dependencies.backgroundJobs) {
    const prune = () => {
      try {
        repository.prune(Date.now());
      } catch (error) {
        console.warn('[usage] Prune failed:', (error as Error)?.message ?? error);
      }
    };
    setTimeout(prune, 60_000).unref();
    setInterval(prune, 24 * 60 * 60_000).unref();
  }
}
