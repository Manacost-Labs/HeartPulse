import type { RequestHandler, Response, Router } from 'express';
import type { ArenaClassId } from '../shared/arenaSynergyContract.js';
import { createAdminArenaSynergyRouter } from './adminArenaSynergyRoutes.js';
import { analyzeArenaSynergies } from './arenaSynergyAnalysis.js';

type ArenaSynergySourceCache = {
  expiresAt: number;
  winningDecks: unknown;
  cardStats: unknown;
  patches: unknown;
};

export type AdminArenaSynergyServiceDependencies = {
  adminGuard: RequestHandler;
  setPrivateNoStore: (response: Response) => void;
  fetchDataset: (datasetId: string, timeoutMs?: number) => Promise<unknown>;
};

let sourceCache: ArenaSynergySourceCache | null = null;

export function createAdminArenaSynergyServiceRouter(
  dependencies: AdminArenaSynergyServiceDependencies,
): Router {
  return createAdminArenaSynergyRouter({
    adminGuard: dependencies.adminGuard,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    loadAnalysis: async (
      className: ArenaClassId,
      options: { forceRefresh: boolean },
    ) => {
      if (options.forceRefresh || !sourceCache || sourceCache.expiresAt <= Date.now()) {
        const timeoutMs = Number(process.env.HS_DATA_API_ADMIN_TIMEOUT_MS || 30_000);
        const [winningDecks, cardStats, patches] = await Promise.all([
          dependencies.fetchDataset('hsreplay_arena_winning_decks', timeoutMs),
          dependencies.fetchDataset('hsreplay_arena_cards_advanced', timeoutMs),
          dependencies.fetchDataset('api/patches?limit=20&include_content=false', timeoutMs),
        ]);
        sourceCache = {
          expiresAt: Date.now()
            + Number(process.env.ADMIN_ARENA_SYNERGY_CACHE_MS || 15 * 60_000),
          winningDecks,
          cardStats,
          patches,
        };
      }
      return analyzeArenaSynergies({ ...sourceCache, className });
    },
    onError: error => console.error(
      '[admin arena synergies]',
      error instanceof Error ? error.message : error,
    ),
  });
}
