import type { Application, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createPlayerStatsRouter,
  createPlayerStatsService,
  type CountStatisticsEvents,
  type GlobalStatisticsSources,
  type GlobalStatsEntitlement,
  type LoadStatisticsEvents,
} from '../modules/playerGames/public.js';

type RegisterPlayerGamesDependencies = {
  app: Application;
  /** The tracker ingestion repository's readers: the statistics never read its table directly. */
  loadEvents: LoadStatisticsEvents;
  countEvents: CountStatisticsEvents;
  userAuth: (request: Request) => { id: string } | null;
  hasEntitlement: (request: Request, entitlement: GlobalStatsEntitlement) => Promise<boolean>;
  global: GlobalStatisticsSources;
  resolveCardNames?: (cardIds: string[]) => Promise<Record<string, string>>;
  setPrivateNoStore: (response: Response) => void;
  environment?: NodeJS.ProcessEnv;
};

/** Each statistics request may aggregate up to 5 000 events, so it is limited before any work starts. */
export function registerPlayerGamesRateLimit(app: Application): void {
  app.use('/api/account/game-stats', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
}

/**
 * The account statistics stay off until `PLAYER_STATS_ENABLED=1`: no desktop
 * client sends version 2 events yet (docs/decisions/2026-10-23-tracker-events-schema-v2.md).
 * While off, the routes answer 404 and the account page shows no section.
 * Returns the cache invalidation the tracker ingestion calls after storing events.
 */
export function registerPlayerGames(dependencies: RegisterPlayerGamesDependencies): { invalidate: (userId: string) => void } {
  const environment = dependencies.environment ?? process.env;
  if (environment.PLAYER_STATS_ENABLED !== '1') return { invalidate: () => {} };
  const service = createPlayerStatsService({
    loadEvents: dependencies.loadEvents,
    countEvents: dependencies.countEvents,
    global: dependencies.global,
    resolveCardNames: dependencies.resolveCardNames,
  });
  dependencies.app.use('/api', createPlayerStatsRouter({
    userAuth: dependencies.userAuth,
    hasEntitlement: dependencies.hasEntitlement,
    service,
    setPrivateNoStore: dependencies.setPrivateNoStore,
  }));
  return { invalidate: service.invalidate };
}
