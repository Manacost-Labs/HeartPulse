import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import {
  normalizeCardImageId,
  type CardImageResponder,
  type CardImageVariant,
} from '../../cardImageRoutes.js';
import {
  createPublicCardCatalog,
  PublicCardQueryError,
  type PublicCardCatalogSource,
} from './cards.js';
import {
  createPublicCardStatistics,
  PublicCardStatisticsQueryError,
  type PublicCardStatisticsSource,
} from './statistics.js';
import {
  createPublicMetaStatistics,
  PublicMetaStatisticsQueryError,
  type PublicMetaStatisticsSource,
} from './metaStatistics.js';
import {
  createPublicDeckStatistics,
  PublicDeckStatisticsQueryError,
  type PublicDeckStatisticsSource,
} from './deckStatistics.js';
import {
  createPublicArenaStatistics,
  PublicArenaStatisticsQueryError,
  type PublicArenaStatisticsSource,
} from './arenaStatistics.js';
import {
  createPublicBattlegroundStatistics,
  PublicBattlegroundStatisticsQueryError,
  type PublicBattlegroundStatisticsSource,
} from './battlegroundStatistics.js';
import { ApiKeyValidationError, type ApiKeyManager, type PublicApiScope } from './model.js';
import { PUBLIC_API_OPENAPI } from './openapi.js';

type AdminRouterDependencies = {
  apiKeys: ApiKeyManager;
  adminAuth: (request: Request) => unknown | null;
  adminId: (admin: unknown) => string;
  setPrivateNoStore: (response: Response) => void;
  recordAudit: (
    admin: unknown,
    action: string,
    entityType: string,
    entityId: string,
    details?: Record<string, unknown>,
  ) => void;
};

type PublicRouterDependencies = {
  apiKeys: ApiKeyManager;
  now?: () => string;
  accessTokens?: {
    authenticate: (
      accessToken: unknown,
      requiredScopes: readonly PublicApiScope[],
    ) => unknown | null | 'FORBIDDEN';
  };
  cardImages?: {
    respond: CardImageResponder;
  };
  cardCatalog?: PublicCardCatalogSource;
  cardStatistics?: PublicCardStatisticsSource;
  metaStatistics?: PublicMetaStatisticsSource;
  deckStatistics?: PublicDeckStatisticsSource;
  arenaStatistics?: PublicArenaStatisticsSource;
  battlegroundStatistics?: PublicBattlegroundStatisticsSource;
};

const apiError = (code: string, message: string) => ({ error: { code, message } });

function requestApiKey(request: Request): string {
  const value = request.headers['x-api-key'];
  return Array.isArray(value) ? value[0] ?? '' : String(value ?? '');
}

function requestBearerToken(request: Request): string {
  const value = String(request.headers.authorization ?? '').trim();
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

function requireScope(
  dependencies: PublicRouterDependencies,
  scope: PublicApiScope,
  request: Request,
  response: Response,
): boolean {
  const bearer = requestBearerToken(request);
  const authenticated = bearer && dependencies.accessTokens
    ? dependencies.accessTokens.authenticate(bearer, [scope])
    : dependencies.apiKeys.authenticate(requestApiKey(request), scope);
  response.set('Cache-Control', 'private, max-age=60');
  response.set('Vary', 'X-API-Key');
  response.append('Vary', 'Authorization');
  if (!authenticated) {
    if (bearer) response.set('WWW-Authenticate', 'Bearer realm="Manacost API"');
    response.status(401).json(bearer
      ? apiError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired')
      : apiError('INVALID_API_KEY', 'API key is missing or invalid'));
    return false;
  }
  if (authenticated === 'FORBIDDEN') {
    response.status(403).json(apiError(
      'INSUFFICIENT_SCOPE',
      bearer ? 'Access token does not grant this scope' : 'API key does not grant this scope',
    ));
    return false;
  }
  return true;
}

export function createPublicApiRouter(dependencies: PublicRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? (() => new Date().toISOString());
  const manifestGeneratedAt = now();
  const cardCatalog = dependencies.cardCatalog
    ? createPublicCardCatalog(dependencies.cardCatalog)
    : null;
  const cardStatistics = dependencies.cardStatistics
    ? createPublicCardStatistics(dependencies.cardStatistics)
    : null;
  const metaStatistics = dependencies.metaStatistics
    ? createPublicMetaStatistics(dependencies.metaStatistics)
    : null;
  const deckStatistics = dependencies.deckStatistics
    ? createPublicDeckStatistics(dependencies.deckStatistics)
    : null;
  const arenaStatistics = dependencies.arenaStatistics
    ? createPublicArenaStatistics(dependencies.arenaStatistics)
    : null;
  const battlegroundStatistics = dependencies.battlegroundStatistics
    ? createPublicBattlegroundStatistics(dependencies.battlegroundStatistics)
    : null;

  const sendVersionedJson = (
    request: Request,
    response: Response,
    result: {
      cacheSource: 'fresh' | 'LKG';
      meta: { datasetVersion: string; dataStatus: 'fresh' | 'stale' };
    } & Record<string, unknown>,
  ) => {
    const { cacheSource, ...payload } = result;
    const body = JSON.stringify(payload);
    const etag = `"${createHash('sha256').update(body).digest('base64url')}"`;
    response.set('ETag', etag);
    response.set('X-Data-Cache', cacheSource);
    response.set('X-Dataset-Version', result.meta.datasetVersion);
    if (result.meta.dataStatus === 'stale') response.set('Warning', '110 - "Response is Stale"');
    if (request.headers['if-none-match'] === etag) return response.status(304).end();
    return response.type('application/json').send(body);
  };

  const cardCatalogError = (response: Response, error: unknown) => {
    response.set('Cache-Control', 'no-store');
    if (error instanceof PublicCardQueryError) {
      return response.status(400).json(apiError('INVALID_CARD_QUERY', error.message));
    }
    response.set('Retry-After', '60');
    return response.status(503).json(apiError(
      'CARD_CATALOG_UNAVAILABLE',
      'Card catalog is temporarily unavailable',
    ));
  };

  const cardStatisticsError = (response: Response, error: unknown) => {
    response.set('Cache-Control', 'no-store');
    if (error instanceof PublicCardStatisticsQueryError) {
      return response.status(400).json(apiError(
        'INVALID_CARD_STATISTICS_QUERY',
        error.message,
      ));
    }
    response.set('Retry-After', '60');
    return response.status(503).json(apiError(
      'CARD_STATISTICS_UNAVAILABLE',
      'Card statistics are temporarily unavailable',
    ));
  };

  const metaStatisticsError = (response: Response, error: unknown) => {
    response.set('Cache-Control', 'no-store');
    if (error instanceof PublicMetaStatisticsQueryError) {
      return response.status(400).json(apiError(
        'INVALID_META_STATISTICS_QUERY',
        error.message,
      ));
    }
    response.set('Retry-After', '60');
    return response.status(503).json(apiError(
      'META_STATISTICS_UNAVAILABLE',
      'Meta statistics are temporarily unavailable',
    ));
  };

  const deckStatisticsError = (response: Response, error: unknown) => {
    response.set('Cache-Control', 'no-store');
    if (error instanceof PublicDeckStatisticsQueryError) {
      return response.status(400).json(apiError(
        'INVALID_DECK_STATISTICS_QUERY',
        error.message,
      ));
    }
    response.set('Retry-After', '60');
    return response.status(503).json(apiError(
      'DECK_STATISTICS_UNAVAILABLE',
      'Deck statistics are temporarily unavailable',
    ));
  };

  const arenaStatisticsError = (response: Response, error: unknown) => {
    response.set('Cache-Control', 'no-store');
    if (error instanceof PublicArenaStatisticsQueryError) {
      return response.status(400).json(apiError(
        'INVALID_ARENA_STATISTICS_QUERY',
        error.message,
      ));
    }
    response.set('Retry-After', '60');
    return response.status(503).json(apiError(
      'ARENA_STATISTICS_UNAVAILABLE',
      'Arena statistics are temporarily unavailable',
    ));
  };

  const battlegroundStatisticsError = (response: Response, error: unknown) => {
    response.set('Cache-Control', 'no-store');
    if (error instanceof PublicBattlegroundStatisticsQueryError) {
      return response.status(400).json(apiError(
        'INVALID_BATTLEGROUNDS_STATISTICS_QUERY',
        error.message,
      ));
    }
    response.set('Retry-After', '60');
    return response.status(503).json(apiError(
      'BATTLEGROUNDS_STATISTICS_UNAVAILABLE',
      'Battlegrounds statistics are temporarily unavailable',
    ));
  };

  router.get('/openapi.json', (_request, response) => {
    response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=300');
    return response.json(PUBLIC_API_OPENAPI);
  });

  router.get('/catalog/manifest', (request, response) => {
    if (!requireScope(dependencies, 'catalog.read', request, response)) return;
    const payload = {
      apiVersion: 'v1',
      schemaVersion: '2026-07-30.6',
      generatedAt: manifestGeneratedAt,
      resources: [
        { id: 'openapi', href: '/api/v1/openapi.json', status: 'AVAILABLE' },
        { id: 'catalog-manifest', href: '/api/v1/catalog/manifest', status: 'AVAILABLE' },
        { id: 'cards', href: '/api/v1/cards', status: 'AVAILABLE' },
        { id: 'card-detail', href: '/api/v1/cards/{cardId}', status: 'AVAILABLE' },
        { id: 'card-statistics', href: '/api/v1/card-statistics', status: 'AVAILABLE' },
        {
          id: 'card-statistics-detail',
          href: '/api/v1/cards/{cardId}/statistics',
          status: 'AVAILABLE',
        },
        {
          id: 'card-statistics-history',
          href: '/api/v1/cards/{cardId}/statistics/history',
          status: 'AVAILABLE',
        },
        { id: 'meta-statistics', href: '/api/v1/meta-statistics', status: 'AVAILABLE' },
        {
          id: 'archetype-statistics',
          href: '/api/v1/archetypes/{slug}/statistics',
          status: 'AVAILABLE',
        },
        {
          id: 'archetype-statistics-history',
          href: '/api/v1/archetypes/{slug}/statistics/history',
          status: 'AVAILABLE',
        },
        {
          id: 'archetype-analysis',
          href: '/api/v1/archetypes/{slug}/analysis',
          status: 'AVAILABLE',
        },
        { id: 'deck-statistics', href: '/api/v1/deck-statistics', status: 'AVAILABLE' },
        {
          id: 'deck-statistics-detail',
          href: '/api/v1/decks/{deckId}/statistics',
          status: 'AVAILABLE',
        },
        {
          id: 'arena-class-statistics',
          href: '/api/v1/arena/statistics/classes',
          status: 'AVAILABLE',
        },
        {
          id: 'arena-card-statistics',
          href: '/api/v1/arena/statistics/cards',
          status: 'AVAILABLE',
        },
        {
          id: 'arena-legendary-statistics',
          href: '/api/v1/arena/statistics/legendaries',
          status: 'AVAILABLE',
        },
        {
          id: 'arena-matchup-statistics',
          href: '/api/v1/arena/statistics/matchups',
          status: 'AVAILABLE',
        },
        {
          id: 'battleground-hero-statistics',
          href: '/api/v1/battlegrounds/statistics/heroes',
          status: 'AVAILABLE',
        },
        {
          id: 'battleground-hero-statistics-detail',
          href: '/api/v1/battlegrounds/statistics/heroes/{heroId}',
          status: 'AVAILABLE',
        },
        {
          id: 'battleground-minion-statistics',
          href: '/api/v1/battlegrounds/statistics/minions',
          status: 'AVAILABLE',
        },
        {
          id: 'battleground-minion-statistics-history',
          href: '/api/v1/battlegrounds/statistics/minions/{dbfId}/history',
          status: 'AVAILABLE',
        },
        {
          id: 'battleground-spell-statistics',
          href: '/api/v1/battlegrounds/statistics/spells',
          status: 'AVAILABLE',
        },
        {
          id: 'battleground-tier-list-statistics',
          href: '/api/v1/battlegrounds/statistics/tier-lists/{kind}',
          status: 'AVAILABLE',
        },
        {
          id: 'card-images',
          href: '/api/v1/cards/{cardId}/images/{variant}.webp',
          status: 'AVAILABLE',
        },
        { id: 'application-profile', href: '/api/v1/me', status: 'AVAILABLE' },
        { id: 'device-authorization', href: '/api/v1/oauth/device/code', status: 'AVAILABLE' },
      ],
    };
    const body = JSON.stringify(payload);
    const etag = `"${createHash('sha256').update(body).digest('base64url')}"`;
    response.set('ETag', etag);
    if (request.headers['if-none-match'] === etag) return response.status(304).end();
    return response.type('application/json').send(body);
  });

  router.get('/cards', async (request, response) => {
    if (!requireScope(dependencies, 'catalog.read', request, response)) return;
    if (!cardCatalog) return cardCatalogError(response, new Error('Card catalog is not configured'));
    try {
      return sendVersionedJson(
        request,
        response,
        await cardCatalog.list(request.query as Record<string, unknown>),
      );
    } catch (error) {
      return cardCatalogError(response, error);
    }
  });

  router.get('/cards/:cardId', async (request, response) => {
    if (!requireScope(dependencies, 'catalog.read', request, response)) return;
    if (!cardCatalog) return cardCatalogError(response, new Error('Card catalog is not configured'));
    try {
      const result = await cardCatalog.detail(request.query.format, request.params.cardId);
      if (!result) {
        response.set('Cache-Control', 'no-store');
        return response.status(404).json(apiError('CARD_NOT_FOUND', 'Card was not found'));
      }
      return sendVersionedJson(request, response, result);
    } catch (error) {
      return cardCatalogError(response, error);
    }
  });

  router.get('/card-statistics', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!cardStatistics) {
      return cardStatisticsError(response, new Error('Card statistics are not configured'));
    }
    try {
      return sendVersionedJson(
        request,
        response,
        await cardStatistics.list(request.query as Record<string, unknown>),
      );
    } catch (error) {
      return cardStatisticsError(response, error);
    }
  });

  router.get('/cards/:cardId/statistics', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!cardStatistics) {
      return cardStatisticsError(response, new Error('Card statistics are not configured'));
    }
    try {
      const result = await cardStatistics.detail(
        request.query as Record<string, unknown>,
        request.params.cardId,
      );
      if (!result) {
        response.set('Cache-Control', 'no-store');
        return response.status(404).json(apiError(
          'CARD_STATISTICS_NOT_FOUND',
          'Card statistics were not found',
        ));
      }
      return sendVersionedJson(request, response, result);
    } catch (error) {
      return cardStatisticsError(response, error);
    }
  });

  router.get('/cards/:cardId/statistics/history', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!cardStatistics) {
      return cardStatisticsError(response, new Error('Card statistics are not configured'));
    }
    try {
      const result = await cardStatistics.history(
        request.query as Record<string, unknown>,
        request.params.cardId,
      );
      if (!result) {
        response.set('Cache-Control', 'no-store');
        return response.status(404).json(apiError(
          'CARD_STATISTICS_NOT_FOUND',
          'Card statistics were not found',
        ));
      }
      return sendVersionedJson(request, response, result);
    } catch (error) {
      return cardStatisticsError(response, error);
    }
  });

  router.get('/meta-statistics', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!metaStatistics) {
      return metaStatisticsError(response, new Error('Meta statistics are not configured'));
    }
    try {
      return sendVersionedJson(
        request,
        response,
        await metaStatistics.list(request.query as Record<string, unknown>),
      );
    } catch (error) {
      return metaStatisticsError(response, error);
    }
  });

  router.get('/archetypes/:slug/statistics', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!metaStatistics) {
      return metaStatisticsError(response, new Error('Meta statistics are not configured'));
    }
    try {
      const result = await metaStatistics.detail(
        request.query as Record<string, unknown>,
        request.params.slug,
      );
      if (!result) {
        response.set('Cache-Control', 'no-store');
        return response.status(404).json(apiError(
          'ARCHETYPE_STATISTICS_NOT_FOUND',
          'Archetype statistics were not found',
        ));
      }
      return sendVersionedJson(request, response, result);
    } catch (error) {
      return metaStatisticsError(response, error);
    }
  });

  router.get('/archetypes/:slug/statistics/history', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!metaStatistics) {
      return metaStatisticsError(response, new Error('Meta statistics are not configured'));
    }
    try {
      const result = await metaStatistics.history(
        request.query as Record<string, unknown>,
        request.params.slug,
      );
      if (!result) {
        response.set('Cache-Control', 'no-store');
        return response.status(404).json(apiError(
          'ARCHETYPE_STATISTICS_NOT_FOUND',
          'Archetype statistics were not found',
        ));
      }
      return sendVersionedJson(request, response, result);
    } catch (error) {
      return metaStatisticsError(response, error);
    }
  });

  router.get('/archetypes/:slug/analysis', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!metaStatistics) {
      return metaStatisticsError(response, new Error('Meta statistics are not configured'));
    }
    try {
      const result = await metaStatistics.analysis(
        request.query as Record<string, unknown>,
        request.params.slug,
      );
      if (!result) {
        response.set('Cache-Control', 'no-store');
        return response.status(404).json(apiError(
          'ARCHETYPE_ANALYSIS_NOT_FOUND',
          'Archetype analysis was not found',
        ));
      }
      return sendVersionedJson(request, response, result);
    } catch (error) {
      return metaStatisticsError(response, error);
    }
  });

  router.get('/deck-statistics', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!deckStatistics) {
      return deckStatisticsError(response, new Error('Deck statistics are not configured'));
    }
    try {
      return sendVersionedJson(
        request,
        response,
        await deckStatistics.list(request.query as Record<string, unknown>),
      );
    } catch (error) {
      return deckStatisticsError(response, error);
    }
  });

  router.get('/decks/:deckId/statistics', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!deckStatistics) {
      return deckStatisticsError(response, new Error('Deck statistics are not configured'));
    }
    try {
      const result = await deckStatistics.detail(
        request.query as Record<string, unknown>,
        request.params.deckId,
      );
      if (!result) {
        response.set('Cache-Control', 'no-store');
        return response.status(404).json(apiError(
          'DECK_STATISTICS_NOT_FOUND',
          'Deck statistics were not found',
        ));
      }
      return sendVersionedJson(request, response, result);
    } catch (error) {
      return deckStatisticsError(response, error);
    }
  });

  router.get('/arena/statistics/classes', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!arenaStatistics) {
      return arenaStatisticsError(response, new Error('Arena statistics are not configured'));
    }
    try {
      return sendVersionedJson(
        request,
        response,
        await arenaStatistics.classes(request.query as Record<string, unknown>),
      );
    } catch (error) {
      return arenaStatisticsError(response, error);
    }
  });

  router.get('/arena/statistics/cards', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!arenaStatistics) {
      return arenaStatisticsError(response, new Error('Arena statistics are not configured'));
    }
    try {
      return sendVersionedJson(
        request,
        response,
        await arenaStatistics.cards(request.query as Record<string, unknown>),
      );
    } catch (error) {
      return arenaStatisticsError(response, error);
    }
  });

  router.get('/arena/statistics/legendaries', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!arenaStatistics) {
      return arenaStatisticsError(response, new Error('Arena statistics are not configured'));
    }
    try {
      return sendVersionedJson(
        request,
        response,
        await arenaStatistics.legendaries(request.query as Record<string, unknown>),
      );
    } catch (error) {
      return arenaStatisticsError(response, error);
    }
  });

  router.get('/arena/statistics/matchups', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!arenaStatistics) {
      return arenaStatisticsError(response, new Error('Arena statistics are not configured'));
    }
    try {
      return sendVersionedJson(
        request,
        response,
        await arenaStatistics.matchups(request.query as Record<string, unknown>),
      );
    } catch (error) {
      return arenaStatisticsError(response, error);
    }
  });

  router.get('/battlegrounds/statistics/heroes', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!battlegroundStatistics) {
      return battlegroundStatisticsError(
        response,
        new Error('Battlegrounds statistics are not configured'),
      );
    }
    try {
      return sendVersionedJson(
        request,
        response,
        await battlegroundStatistics.heroes(request.query as Record<string, unknown>),
      );
    } catch (error) {
      return battlegroundStatisticsError(response, error);
    }
  });

  router.get('/battlegrounds/statistics/heroes/:heroId', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!battlegroundStatistics) {
      return battlegroundStatisticsError(
        response,
        new Error('Battlegrounds statistics are not configured'),
      );
    }
    try {
      const result = await battlegroundStatistics.heroDetail(
        request.params.heroId,
        request.query as Record<string, unknown>,
      );
      if (!result) {
        response.set('Cache-Control', 'no-store');
        return response.status(404).json(apiError(
          'BATTLEGROUNDS_HERO_STATISTICS_NOT_FOUND',
          'Battlegrounds hero statistics were not found',
        ));
      }
      return sendVersionedJson(request, response, result);
    } catch (error) {
      return battlegroundStatisticsError(response, error);
    }
  });

  router.get('/battlegrounds/statistics/minions', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!battlegroundStatistics) {
      return battlegroundStatisticsError(
        response,
        new Error('Battlegrounds statistics are not configured'),
      );
    }
    try {
      return sendVersionedJson(
        request,
        response,
        await battlegroundStatistics.minions(request.query as Record<string, unknown>),
      );
    } catch (error) {
      return battlegroundStatisticsError(response, error);
    }
  });

  router.get('/battlegrounds/statistics/minions/:dbfId/history', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!battlegroundStatistics) {
      return battlegroundStatisticsError(
        response,
        new Error('Battlegrounds statistics are not configured'),
      );
    }
    try {
      const result = await battlegroundStatistics.minionHistory(
        request.params.dbfId,
        request.query as Record<string, unknown>,
      );
      if (!result) {
        response.set('Cache-Control', 'no-store');
        return response.status(404).json(apiError(
          'BATTLEGROUNDS_MINION_HISTORY_NOT_FOUND',
          'Battlegrounds minion history was not found',
        ));
      }
      return sendVersionedJson(request, response, result);
    } catch (error) {
      return battlegroundStatisticsError(response, error);
    }
  });

  router.get('/battlegrounds/statistics/spells', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!battlegroundStatistics) {
      return battlegroundStatisticsError(
        response,
        new Error('Battlegrounds statistics are not configured'),
      );
    }
    try {
      const result = await battlegroundStatistics.spells(
        request.query as Record<string, unknown>,
      );
      if (!result) {
        return battlegroundStatisticsError(
          response,
          new Error('Battlegrounds spell statistics are not configured'),
        );
      }
      return sendVersionedJson(request, response, result);
    } catch (error) {
      return battlegroundStatisticsError(response, error);
    }
  });

  router.get('/battlegrounds/statistics/tier-lists/:kind', async (request, response) => {
    if (!requireScope(dependencies, 'statistics.read', request, response)) return;
    if (!battlegroundStatistics) {
      return battlegroundStatisticsError(
        response,
        new Error('Battlegrounds statistics are not configured'),
      );
    }
    try {
      return sendVersionedJson(
        request,
        response,
        await battlegroundStatistics.tierList(
          request.params.kind,
          request.query as Record<string, unknown>,
        ),
      );
    } catch (error) {
      return battlegroundStatisticsError(response, error);
    }
  });

  router.get('/cards/:cardId/images/:variant.webp', async (request, response) => {
    if (!requireScope(dependencies, 'images.read', request, response)) return;
    const cardId = normalizeCardImageId(request.params.cardId);
    const variant: CardImageVariant | null = request.params.variant === 'full'
      || request.params.variant === 'thumb'
      || request.params.variant === 'tile'
      ? request.params.variant
      : null;
    if (!cardId || !variant) {
      response.set('Cache-Control', 'no-store');
      return response.status(400).json(apiError(
        'INVALID_CARD_IMAGE_REQUEST',
        'Card id or image variant is invalid',
      ));
    }
    if (!dependencies.cardImages) {
      response.set('Cache-Control', 'no-store');
      return response.status(503).json(apiError(
        'CARD_IMAGE_UNAVAILABLE',
        'Card image service is unavailable',
      ));
    }
    await dependencies.cardImages.respond(request, response, cardId, variant, {
      immutableCacheHeader: 'private, max-age=2592000, immutable',
      fallbackCacheHeader: 'private, max-age=300, stale-while-revalidate=3600',
      unavailableBody: apiError('CARD_IMAGE_UNAVAILABLE', 'Card image is unavailable'),
    });
  });

  return router;
}
export function createAdminApiKeyRouter(dependencies: AdminRouterDependencies): Router {
  const router = Router();
  const authorize = (request: Request, response: Response) => {
    dependencies.setPrivateNoStore(response);
    const admin = dependencies.adminAuth(request);
    if (!admin) {
      response.status(403).json(apiError('ADMIN_REQUIRED', 'Administrator access required'));
      return null;
    }
    return admin;
  };

  router.get('/admin/api-keys', (request, response) => {
    if (!authorize(request, response)) return;
    return response.json({ keys: dependencies.apiKeys.list() });
  });

  router.post('/admin/api-keys', (request, response) => {
    const admin = authorize(request, response);
    if (!admin) return;
    try {
      const result = dependencies.apiKeys.create({
        name: request.body?.name,
        scopes: request.body?.scopes,
        createdBy: dependencies.adminId(admin),
      });
      dependencies.recordAudit(admin, 'api-key.created', 'api-key', result.key.id, {
        name: result.key.name,
        prefix: result.key.prefix,
        scopes: result.key.scopes,
      });
      return response.status(201).json(result);
    } catch (error) {
      if (error instanceof ApiKeyValidationError) {
        return response.status(400).json(apiError('VALIDATION_ERROR', error.message));
      }
      return response.status(500).json(apiError('API_KEY_CREATE_FAILED', 'Could not create API key'));
    }
  });

  router.delete('/admin/api-keys/:id', (request, response) => {
    const admin = authorize(request, response);
    if (!admin) return;
    try {
      const revoked = dependencies.apiKeys.revoke(request.params.id);
      if (revoked) {
        dependencies.recordAudit(admin, 'api-key.revoked', 'api-key', revoked.id, {
          name: revoked.name,
          prefix: revoked.prefix,
        });
      }
      return response.status(204).end();
    } catch {
      return response.status(500).json(apiError('API_KEY_REVOKE_FAILED', 'Could not revoke API key'));
    }
  });

  return router;
}
