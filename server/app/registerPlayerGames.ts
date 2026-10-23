import type { Application, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createPlayerStatsRouter,
  createPlayerStatsService,
  type GlobalStatisticsSources,
  type GlobalStatsEntitlement,
  type LoadStatisticsEvents,
} from '../modules/playerGames/public.js';

type RegisterPlayerGamesDependencies = {
  app: Application;
  /** The tracker ingestion repository's event reader: the statistics never read its table directly. */
  loadEvents: LoadStatisticsEvents;
  userAuth: (request: Request) => { id: string } | null;
  hasEntitlement: (request: Request, entitlement: GlobalStatsEntitlement) => Promise<boolean>;
  global: GlobalStatisticsSources;
  resolveCardNames?: (cardIds: string[]) => Promise<Record<string, string>>;
  setPrivateNoStore: (response: Response) => void;
};

/** Each statistics request aggregates up to 5 000 events, so it is limited before any work starts. */
export function registerPlayerGamesRateLimit(app: Application): void {
  app.use('/api/account/game-stats', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
}

export function registerPlayerGames(dependencies: RegisterPlayerGamesDependencies): void {
  dependencies.app.use('/api', createPlayerStatsRouter({
    userAuth: dependencies.userAuth,
    hasEntitlement: dependencies.hasEntitlement,
    service: createPlayerStatsService({
      loadEvents: dependencies.loadEvents,
      global: dependencies.global,
      resolveCardNames: dependencies.resolveCardNames,
    }),
    setPrivateNoStore: dependencies.setPrivateNoStore,
  }));
}
