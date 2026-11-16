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
import { createTwitchChannelRevoker, type TwitchSendWait } from './revocation.js';
import { relayTwitchState } from './stateRelay.js';
import type { TwitchApi } from './twitchApi.js';

export type TwitchApiRouterDependencies = {
  config: TwitchExtensionConfig | null;
  twitch: TwitchApi | null;
  accessTokens: Pick<ApplicationAuthManager, 'authenticate'>;
  links: TwitchLinkRepository;
  live: TwitchLiveState;
  /**
   * False for a blocked or missing site account. Its token is answered like an
   * invalid one (the application API's rule) and its deck leaves the channel.
   */
  accountActive: (userId: string) => boolean;
  /** Absolute address of the page that links Twitch, handed to the app. */
  linkUrl: string;
  setPrivateNoStore: (response: Response) => void;
  onError?: (scope: string, error: unknown) => void;
  now?: () => number;
  /** Waits out the channel's one-a-second budget before a send; a test supplies its own. */
  wait?: TwitchSendWait;
};

const apiError = (code: string, message: string) => ({ error: { code, message } });

function bearerToken(request: Request): string {
  const value = String(request.headers.authorization ?? '').trim();
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

/**
 * Preflight and CORS for the extension iframe. The site-wide CORS middleware
 * runs first and knows only the site's own origins: it answers every other
 * preflight itself and passes this one on (`twitchExtensionPreflight` in
 * `server/app/registerTwitchExtension.ts`), and the headers set here replace
 * the methods and headers it has already written.
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
  const revoke = createTwitchChannelRevoker(dependencies);
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
    if (!dependencies.accountActive(token.userId)) {
      // A second line of defence. The site's own `authenticate` already refuses a blocked or deleted
      // account (and revokes its tokens), and the place that blocks or deletes it revokes the channel.
      const link = dependencies.links.find(token.userId);
      if (link) revoke(link.twitchUserId, 'detected');
      response.set('WWW-Authenticate', 'Bearer realm="HearthPulse Tracker"');
      response.status(401).json(apiError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired'));
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

    // Sized with the time of arrival; the message itself is built in the queue with the time it is sent.
    if (Buffer.byteLength(buildTwitchEnvelope(validation.value, now())) > TWITCH_PUBSUB_MAX_MESSAGE_BYTES) {
      return response.status(413).json(apiError('payload_too_large', 'Compressed state exceeds 5 KB'));
    }
    const channelId = link.twitchUserId;
    const slot = dependencies.live.acquire(channelId);
    if (slot.ok === false) {
      response.set('Retry-After', String(slot.retryAfterSeconds));
      return response.status(429).json(apiError('rate_limited', 'One state per second per channel'));
    }
    const outcome = await relayTwitchState({ ...dependencies, twitch, revoke }, token.userId, channelId, validation.value);
    if (outcome === 'full') {
      response.set('Retry-After', '1');
      return response.status(429).json(apiError('rate_limited', 'The channel is still sending its previous states'));
    }
    if (outcome === 'revoked') return response.status(404).json(apiError('twitch_not_linked', 'Link Twitch on the site first'));
    if (outcome === 'inactive') {
      response.set('WWW-Authenticate', 'Bearer realm="HearthPulse Tracker"');
      return response.status(401).json(apiError('INVALID_ACCESS_TOKEN', 'Access token is invalid or expired'));
    }
    if (outcome === 'unavailable') {
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
    // A deleted site account drops its link by cascade and a blocked one keeps it, both without an unlink
    // call: the snapshot is served only while an active account owns the channel.
    const owner = dependencies.links.findByChannel(claims.channelId);
    if (!owner || !dependencies.accountActive(owner.userId)) {
      // A channel nobody ever linked has nothing to take away; any viewer of it lands here.
      if (owner || dependencies.live.tracks(claims.channelId)) revoke(claims.channelId, 'detected');
      return response.status(204).end();
    }
    const envelope = dependencies.live.snapshot(claims.channelId);
    if (!envelope) return response.status(204).end();
    return response.type('application/json').send(envelope);
  });

  return router;
}
