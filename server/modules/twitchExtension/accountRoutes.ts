import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { TwitchExtensionConfig } from './config.js';
import type { TwitchLiveState } from './liveState.js';
import type { TwitchLinkRepository } from './repository.js';
import type { TwitchApi } from './twitchApi.js';

export type TwitchAccountRouterDependencies = {
  config: TwitchExtensionConfig | null;
  twitch: TwitchApi | null;
  links: TwitchLinkRepository;
  live: TwitchLiveState;
  userAuth: (request: Request) => { id: string } | null;
  setPrivateNoStore: (response: Response) => void;
  /** Whether cookies get `Secure`: true whenever the site runs on https. */
  secureCookies: boolean;
  onError?: (scope: string, error: unknown) => void;
  now?: () => number;
};

const STATE_COOKIE = 'hp_twitch_oauth';
const STATE_TTL_MS = 10 * 60_000;
/** The Twitch block in the account; `/account/twitch` (the app's `linkUrl`) redirects here. */
export const TWITCH_ACCOUNT_PAGE = '/profile/#account-twitch';
const page = (result: string) => `/profile/?twitch=${result}#account-twitch`;

const apiError = (code: string, message: string) => ({ error: { code, message } });

function readCookie(request: Request, name: string): string {
  for (const part of String(request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return '';
}

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Linking Twitch to the signed-in account by the OAuth code flow without a
 * scope. The `state` lives in an HttpOnly cookie, signed together with the
 * account id and expiry, so a callback completes only in the browser and for
 * the account that started it (CSRF and login-CSRF of another account).
 */
export function createTwitchAccountRouter(dependencies: TwitchAccountRouterDependencies): Router {
  const router = Router();
  const now = dependencies.now ?? Date.now;
  const signState = (secret: string, state: string, expiresAt: number, userId: string) => (
    createHmac('sha256', secret).update(`${state}.${expiresAt}.${userId}`).digest('base64url')
  );
  const stateCookie = (value: string, maxAgeSeconds: number) => [
    `${STATE_COOKIE}=${value}`, 'Path=/api/account/twitch', `Max-Age=${maxAgeSeconds}`, 'HttpOnly', 'SameSite=Lax',
    ...(dependencies.secureCookies ? ['Secure'] : []),
  ].join('; ');

  router.get('/account/twitch', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json(apiError('LOGIN_REQUIRED', 'Sign in first'));
    const link = dependencies.links.find(user.id);
    return response.json({
      configured: Boolean(dependencies.config),
      linked: Boolean(link),
      login: link?.login ?? null,
      displayName: link?.displayName ?? null,
      linkedAt: link?.linkedAt ?? null,
    });
  });

  router.get('/account/twitch/connect', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.redirect(302, TWITCH_ACCOUNT_PAGE);
    const { config, twitch } = dependencies;
    if (!config || !twitch) return response.redirect(302, page('not_configured'));
    const state = randomBytes(24).toString('base64url');
    const expiresAt = now() + STATE_TTL_MS;
    response.append('Set-Cookie', stateCookie(
      `${state}.${expiresAt}.${signState(config.oauthClientSecret, state, expiresAt, user.id)}`,
      STATE_TTL_MS / 1000,
    ));
    return response.redirect(302, twitch.authorizeUrl(state));
  });

  router.get('/account/twitch/callback', async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const cookie = readCookie(request, STATE_COOKIE);
    response.append('Set-Cookie', stateCookie('', 0));
    const { config, twitch } = dependencies;
    if (!config || !twitch) return response.redirect(302, page('not_configured'));
    const user = dependencies.userAuth(request);
    if (!user) return response.redirect(302, page('error'));
    const [state = '', expiresAtText = '', signature = ''] = cookie.split('.');
    const expiresAt = Number(expiresAtText);
    const queryState = typeof request.query.state === 'string' ? request.query.state : '';
    if (!state || !queryState || !safeEqual(state, queryState) || !Number.isFinite(expiresAt) || expiresAt <= now()
      || !safeEqual(signature, signState(config.oauthClientSecret, state, expiresAt, user.id))) {
      return response.redirect(302, page('error'));
    }
    if (typeof request.query.error === 'string') return response.redirect(302, page('cancelled'));
    const code = typeof request.query.code === 'string' ? request.query.code : '';
    if (!code || code.length > 512) return response.redirect(302, page('error'));
    try {
      const twitchUser = await twitch.identify(code);
      const previous = dependencies.links.find(user.id);
      if (previous && previous.twitchUserId !== twitchUser.id) dependencies.live.forget(previous.twitchUserId);
      dependencies.links.link({
        userId: user.id,
        twitchUserId: twitchUser.id,
        login: twitchUser.login,
        displayName: twitchUser.displayName,
        linkedAt: new Date(now()).toISOString(),
      });
      return response.redirect(302, page('linked'));
    } catch (error) {
      dependencies.onError?.('oauth', error);
      return response.redirect(302, page('error'));
    }
  });

  router.delete('/account/twitch', (request, response) => {
    dependencies.setPrivateNoStore(response);
    const user = dependencies.userAuth(request);
    if (!user) return response.status(401).json(apiError('LOGIN_REQUIRED', 'Sign in first'));
    const removed = dependencies.links.unlink(user.id);
    if (removed) dependencies.live.forget(removed.twitchUserId);
    return response.json({ linked: false });
  });

  return router;
}

/** `linkUrl` of the app: a stable address that opens the account's Twitch block. */
export function createTwitchLinkPageRouter(): Router {
  const router = Router();
  router.get('/account/twitch', (_request, response) => response.redirect(302, TWITCH_ACCOUNT_PAGE));
  return router;
}
