import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createPlayerGameRouter,
  createPlayerStatsRouter,
  createPlayerStatsService,
  createSqlitePlayerGameStore,
  initializePlayerGameStore,
  type GameUploadToken,
  type GlobalStatisticsSources,
  type GlobalStatsEntitlement,
} from '../modules/playerGames/public.js';

type RegisterPlayerGamesDependencies = {
  app: Application;
  getDatabase: () => DatabaseSync;
  /** Undefined when browser identity is disabled: uploads then answer 503. */
  accessTokens?: { verify: (token: string) => Promise<GameUploadToken | null> };
  userAuth: (request: Request) => { id: string } | null;
  hasEntitlement: (request: Request, entitlement: GlobalStatsEntitlement) => Promise<boolean>;
  global: GlobalStatisticsSources;
  resolveCardNames?: (cardIds: string[]) => Promise<Record<string, string>>;
  setPrivateNoStore: (response: Response) => void;
};

/** Runs before the JSON parser, so floods are refused before their bodies are read. */
export function registerPlayerGamesRateLimit(app: Application): void {
  app.use('/api/v1/me/games', rateLimit({ windowMs: 15 * 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));
  app.use('/api/account/game-stats', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
}

export function registerPlayerGames(dependencies: RegisterPlayerGamesDependencies): void {
  initializePlayerGameStore(dependencies.getDatabase);
  const store = createSqlitePlayerGameStore(dependencies.getDatabase);
  dependencies.app.use('/api/v1', createPlayerGameRouter({
    accessTokens: dependencies.accessTokens ?? null,
    store,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    requiredScope: null,
  }));
  dependencies.app.use('/api', createPlayerStatsRouter({
    userAuth: dependencies.userAuth,
    hasEntitlement: dependencies.hasEntitlement,
    service: createPlayerStatsService({ store, global: dependencies.global, resolveCardNames: dependencies.resolveCardNames }),
    setPrivateNoStore: dependencies.setPrivateNoStore,
  }));
}
