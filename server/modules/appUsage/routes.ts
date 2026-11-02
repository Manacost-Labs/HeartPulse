import { Router, type Response } from 'express';
import type { ApplicationAuthManager } from '../applicationAuth/public.js';
import { usageDay, type AppUsageConfig, type AppUsageFeature } from './config.js';
import type { AppUsageRepository } from './repository.js';

type AppUsageRouterDependencies = {
  accessTokens: Pick<ApplicationAuthManager, 'authenticate'>;
  repository: AppUsageRepository;
  config: AppUsageConfig;
  /** Whether the account's subscription opens the section (Boosty, Patreon, Telegram or a manual grant). */
  hasSection: (userId: string, section: AppUsageFeature['section']) => boolean;
  setPrivateNoStore: (response: Response) => void;
  now?: () => number;
};

const apiError = (code: string, message: string) => ({ error: { code, message } });
/** A random per-game id from the app (a UUID): never a time or a name. */
const GAME_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function bearerToken(authorization: unknown): string {
  const value = String(authorization ?? '').trim();
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

/**
 * Daily free use of the app's paid analytics (plan 3.1): the public limits, the account's use today and a claim per
 * game. The server decides: a subscriber of the feature's section is never limited, a free account is limited per UTC
 * day, a game counts once. While the limits are off every claim is allowed and nothing is stored.
 */
export function createAppUsageRouter(dependencies: AppUsageRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const { config } = dependencies;
  const features = new Map(config.features.map(feature => [feature.key, feature]));
  const limits = () => ({
    enabled: config.enabled,
    ...usageDay(now()),
    features: Object.fromEntries(config.features.map(feature => [feature.key, { section: feature.section, freePerDay: feature.freePerDay }])),
  });
  const signedIn = (authorization: unknown, response: Response) => {
    dependencies.setPrivateNoStore(response);
    const authenticated = dependencies.accessTokens.authenticate(bearerToken(authorization), ['subscription.read']);
    if (!authenticated) {
      response.set('WWW-Authenticate', 'Bearer realm="HearthPulse"');
      response.status(401).json(apiError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired'));
      return null;
    }
    if (authenticated === 'FORBIDDEN') {
      response.status(403).json(apiError('INSUFFICIENT_SCOPE', 'Access token does not grant subscription.read'));
      return null;
    }
    return authenticated.userId;
  };

  // Public: the app learns whether limits are on, and the numbers, before and without a sign-in.
  router.get('/v1/usage/limits', (_request, response) => {
    response.set('Cache-Control', 'public, max-age=300');
    response.json(limits());
  });

  router.get('/v1/usage', (request, response) => {
    const userId = signedIn(request.headers.authorization, response);
    if (!userId) return;
    const { day } = usageDay(now());
    response.json({
      ...limits(),
      usage: Object.fromEntries(config.features.map(feature => [feature.key, {
        unlimited: !config.enabled || dependencies.hasSection(userId, feature.section),
        used: config.enabled ? dependencies.repository.used(userId, day, feature.key) : 0,
        limit: feature.freePerDay,
      }])),
    });
  });

  router.post('/v1/usage/claim', (request, response) => {
    const userId = signedIn(request.headers.authorization, response);
    if (!userId) return;
    const feature = features.get(String(request.body?.feature ?? ''));
    const gameId = request.body?.gameId;
    if (!feature || typeof gameId !== 'string' || !GAME_ID.test(gameId)) {
      return response.status(400).json(apiError('INVALID_BODY', 'Send {"feature":"<known key>","gameId":"<uuid>"}'));
    }
    const { day, resetsAt } = usageDay(now());
    const base = { feature: feature.key, limit: feature.freePerDay, resetsAt };
    if (!config.enabled || dependencies.hasSection(userId, feature.section)) {
      return response.json({ ...base, allowed: true, unlimited: true, used: 0 });
    }
    const repository = dependencies.repository;
    // node:sqlite is synchronous: the count and the insert run without another request in between.
    if (repository.claimed(userId, day, feature.key, gameId)) {
      return response.json({ ...base, allowed: true, unlimited: false, used: repository.used(userId, day, feature.key) });
    }
    const used = repository.used(userId, day, feature.key);
    if (used >= feature.freePerDay) return response.json({ ...base, allowed: false, unlimited: false, used });
    repository.claim(userId, day, feature.key, gameId, now());
    return response.json({ ...base, allowed: true, unlimited: false, used: used + 1 });
  });

  return router;
}
