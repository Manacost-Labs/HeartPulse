import type { DatabaseSync } from 'node:sqlite';
import type { Application, Request, Response } from 'express';
import {
  createCardImageResponder,
  type CardImageRouterDependencies,
} from '../cardImageRoutes.js';
import {
  createAdminApiKeyRouter,
  createApiKeyManager,
  createPublicApiRouter,
  createSqliteApiKeyRepository,
  initializePublicApiKeyRepository,
} from '../modules/publicApi/public.js';
import type { ConstructedCardDataService } from '../constructedCardRoutes.js';
import { createLocalBattlegroundStatisticsSource } from '../modules/publicApi/battlegroundSource.js';

type RegisterPublicApiDependencies<TAdmin> = {
  app: Application;
  getDatabase: () => DatabaseSync;
  adminAuth: (request: Request) => TAdmin | null;
  adminId: (admin: TAdmin) => string;
  setPrivateNoStore: (response: Response) => void;
  recordAudit: (
    admin: TAdmin,
    action: string,
    entityType: string,
    entityId: string,
    details?: Record<string, unknown>,
  ) => void;
  cardImageDependencies?: CardImageRouterDependencies;
  accessTokens?: Parameters<typeof createPublicApiRouter>[0]['accessTokens'];
  cardCatalog?: Parameters<typeof createPublicApiRouter>[0]['cardCatalog'];
  cardStatistics?: Parameters<typeof createPublicApiRouter>[0]['cardStatistics'];
  metaStatistics?: Parameters<typeof createPublicApiRouter>[0]['metaStatistics'];
  deckStatistics?: Parameters<typeof createPublicApiRouter>[0]['deckStatistics'];
  arenaStatistics?: Parameters<typeof createPublicApiRouter>[0]['arenaStatistics'];
  battlegroundStatistics?: Parameters<typeof createPublicApiRouter>[0]['battlegroundStatistics'];
};

/**
 * Keeps the composition root independent from the public serializers while
 * delaying service resolution until after the constructed-card service boots.
 */
export function createPublicApiCardSources(
  getService: () => ConstructedCardDataService,
): Pick<RegisterPublicApiDependencies<unknown>, 'cardCatalog' | 'cardStatistics'> {
  return {
    cardCatalog: {
      loadCards: format => getService().loadCards(format),
      loadCardDetail: (format, cardId) => getService().loadCardDetail(format, cardId),
    },
    cardStatistics: {
      loadCards: (format, period, rank) => getService().loadCards(format, period, rank),
      loadCardHistory: (format, cardId, period, rank, days) => (
        getService().loadCardHistory(format, cardId, period, rank, days)
      ),
    },
  };
}

/** Registers the public API and its administrator credential lifecycle. */
export function registerPublicApi<TAdmin>(dependencies: RegisterPublicApiDependencies<TAdmin>): void {
  initializePublicApiKeyRepository(dependencies.getDatabase);
  const apiKeys = createApiKeyManager({
    repository: createSqliteApiKeyRepository(dependencies.getDatabase),
  });
  dependencies.app.use('/api/v1', createPublicApiRouter({
    apiKeys,
    accessTokens: dependencies.accessTokens,
    cardCatalog: dependencies.cardCatalog,
    cardStatistics: dependencies.cardStatistics,
    metaStatistics: dependencies.metaStatistics,
    deckStatistics: dependencies.deckStatistics,
    arenaStatistics: dependencies.arenaStatistics,
    battlegroundStatistics: dependencies.battlegroundStatistics
      ?? createLocalBattlegroundStatisticsSource(),
    cardImages: dependencies.cardImageDependencies
      ? { respond: createCardImageResponder(dependencies.cardImageDependencies) }
      : undefined,
  }));
  dependencies.app.use('/api', createAdminApiKeyRouter({
    apiKeys,
    adminAuth: dependencies.adminAuth,
    adminId: admin => dependencies.adminId(admin as TAdmin),
    setPrivateNoStore: dependencies.setPrivateNoStore,
    recordAudit: (admin, action, entityType, entityId, details) => {
      dependencies.recordAudit(admin as TAdmin, action, entityType, entityId, details);
    },
  }));
}
