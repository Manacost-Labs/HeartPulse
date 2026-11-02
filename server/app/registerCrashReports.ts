import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import {
  createCrashReportRouter,
  createSqliteCrashReportRepository,
  initializeCrashReportRepository,
} from '../modules/crashReports/public.js';
import { getTrustedClientIp } from '../networkBoundary.js';

type RegisterCrashReportsDependencies = {
  app: Application;
  getDatabase: () => DatabaseSync;
  setPrivateNoStore: (response: Response) => void;
  /** Runs the daily prune of old reports (off where background jobs are off). */
  backgroundJobs: boolean;
};

/** A player sends a report now and then: 10 an hour from one address. The address is never stored. */
export function registerCrashReportsRateLimit(app: Application): void {
  app.post('/api/v1/crash-reports', rateLimit({ windowMs: 60 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (request: Request) => ipKeyGenerator(getTrustedClientIp(request) || 'unknown') }));
}

/** Crash reports from the Hearthpulse app (plan 0.5, docs/specs/crash-reports.md). */
export function registerCrashReports(dependencies: RegisterCrashReportsDependencies): void {
  initializeCrashReportRepository(dependencies.getDatabase);
  const repository = createSqliteCrashReportRepository(dependencies.getDatabase);
  dependencies.app.use('/api', createCrashReportRouter({ repository, setPrivateNoStore: dependencies.setPrivateNoStore }));
  if (dependencies.backgroundJobs) {
    const prune = () => {
      try {
        repository.prune(Date.now());
      } catch (error) {
        console.warn('[crash-reports] Prune failed:', (error as Error)?.message ?? error);
      }
    };
    setTimeout(prune, 60_000).unref();
    setInterval(prune, 24 * 60 * 60_000).unref();
  }
}
