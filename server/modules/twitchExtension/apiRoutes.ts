import { Router, type NextFunction, type Request, type Response } from 'express';
import type { ApplicationAuthManager } from '../applicationAuth/public.js';
import { twitchExtensionOrigin, type TwitchExtensionConfig } from './config.js';
import { verifyTwitchJwt } from './jwt.js';
import type { TwitchLiveState } from './liveState.js';
import {
  TWITCH_PUBSUB_MAX_MESSAGE_BYTES,
  TWITCH_STATE_MAX_BODY_BYTES,
  buildTwitchEnvelope,
  validateTwitchState,
} from './model.js';
import type { TwitchLinkRepository } from './repository.js';
import type { TwitchApi } from './twitchApi.js';

export type TwitchApiRouterDependencies = {
  config: TwitchExtensionConfig | null;
  twitch: TwitchApi | null;
  accessTokens: Pick<ApplicationAuthManager, 'authenticate'>;
  links: TwitchLinkRepository;
  live: TwitchLiveState;
  /** Absolute address of the page that links Twitch, handed to the app. */
  linkUrl: string;
  setPrivateNoStore: (response: Response) => void;
  onError?: (scope: string, error: unknown) => void;
  now?: () => number;
};

const apiError = (code: string, message: string) => ({ error: { code, message } });

function bearerToken(request: Request): string {
  const value = String(request.headers.authorization ?? '').trim();
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

/**
 * Preflight and CORS for the extension iframe. It is registered before the
 * site-wide CORS middleware, which knows only the site's own origins.
 */
export function createTwitchExtensionCors(config: TwitchExtensionConfig | null) {
  return (request: Request, response: Response, next: NextFunction) => {
    if (config && request.headers.origin === twitchExtensionOrigin(config.clientId)) {
      response.set('Access-Control-Allow-Origin', twitchExtensionOrigin(config.clientId));
      response.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      response.set('Access-Control-Allow-Headers', 'Authorization');
      response.set('Access-Control-Max-Age', '600');
    }
    response.vary('Origin');
    if (request.method === 'OPTIONS') return response.sendStatus(204);
    return next();
  };
}

/** `twitch/state` and `twitch/status` for the desktop app, `twitch/ext/snapshot` for viewers. */
export function createTwitchApiRouter(dependencies: TwitchApiRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const privateResponse = (response: Response) => {
    dependencies.setPrivateNoStore(response);
    response.set('Pragma', 'no-cache');
  };
  const authenticate = (request: Request, response: Response, scope: 'tracker.write' | 'profile.read') => {
    const token = dependencies.accessTokens.authenticate(bearerToken(request), [scope]);
    if (!token) {
      response.set('WWW-Authenticate', 'Bearer realm="HearthPulse Tracker"');
      response.status(401).json(apiError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired'));
      return null;
    }
    if (token === 'FORBIDDEN') {
      response.status(403).json(apiError('INSUFFICIENT_SCOPE', `Access token does not grant ${scope}`));
      return null;
    }
    return token;
  };

  router.post('/twitch/state', async (request, response) => {
    privateResponse(response);
    const token = authenticate(request, response, 'tracker.write');
    if (!token) return;
    const { config, twitch } = dependencies;
    if (!config || !twitch) {
      return response.status(503).json(apiError('twitch_not_configured', 'Twitch extension is not configured on the site'));
    }
    if (Number(request.headers['content-length'] ?? 0) > TWITCH_STATE_MAX_BODY_BYTES
      || Buffer.byteLength(JSON.stringify(request.body ?? null)) > TWITCH_STATE_MAX_BODY_BYTES) {
      return response.status(413).json(apiError('payload_too_large', 'State body exceeds 16 KB'));
    }
    const validation = validateTwitchState(request.body);
    if (validation.ok === false) {
      return response.status(400).json(apiError('invalid_state', `Invalid field: ${validation.field}`));
    }
    const link = dependencies.links.find(token.userId);
    if (!link) return response.status(404).json(apiError('twitch_not_linked', 'Link Twitch on the site first'));

    const envelope = buildTwitchEnvelope(validation.value, now());
    if (Buffer.byteLength(envelope) > TWITCH_PUBSUB_MAX_MESSAGE_BYTES) {
      return response.status(413).json(apiError('payload_too_large', 'Compressed state exceeds 5 KB'));
    }
    const slot = dependencies.live.acquire(link.twitchUserId);
    if (slot.ok === false) {
      response.set('Retry-After', String(slot.retryAfterSeconds));
      return response.status(429).json(apiError('rate_limited', 'One state per second per channel'));
    }
    // Stored before the broadcast: a viewer who opens the stream gets it even when one PubSub send failed.
    dependencies.live.store(link.twitchUserId, envelope);
    try {
      await twitch.broadcast(link.twitchUserId, envelope);
    } catch (error) {
      dependencies.onError?.('pubsub', error);
      return response.status(503).json(apiError('twitch_unavailable', 'Twitch did not accept the message'));
    }
    return response.status(204).end();
  });

  router.get('/twitch/status', (request, response) => {
    privateResponse(response);
    const token = authenticate(request, response, 'profile.read');
    if (!token) return;
    const link = dependencies.links.find(token.userId);
    return response.json({
      configured: Boolean(dependencies.config),
      linked: Boolean(link),
      login: link?.login ?? null,
      displayName: link?.displayName ?? null,
      linkUrl: dependencies.linkUrl,
    });
  });

  router.get('/twitch/ext/snapshot', (request, response) => {
    response.set('Cache-Control', 'no-store');
    const { config } = dependencies;
    if (!config) {
      return response.status(503).json(apiError('twitch_not_configured', 'Twitch extension is not configured on the site'));
    }
    const claims = verifyTwitchJwt(bearerToken(request), config.extensionSecret, now());
    if (!claims) return response.status(401).json(apiError('invalid_extension_token', 'Extension token is invalid or expired'));
    const envelope = dependencies.live.snapshot(claims.channelId);
    if (!envelope) return response.status(204).end();
    return response.type('application/json').send(envelope);
  });

  return router;
}
