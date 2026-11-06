import type { TwitchExtensionConfig } from './config.js';
import { externalPubsubJwt } from './jwt.js';

export const TWITCH_AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const REVOKE_URL = 'https://id.twitch.tv/oauth2/revoke';
const USERS_URL = 'https://api.twitch.tv/helix/users';
const PUBSUB_URL = 'https://api.twitch.tv/helix/extensions/pubsub';
const DEADLINE_MS = 8_000;

export type TwitchFetch = (url: string, init: RequestInit) => Promise<Response>;
export type TwitchUser = { id: string; login: string; displayName: string };

/** A Twitch call that did not succeed; `status` is Twitch's HTTP status or 0 for a network failure. */
export class TwitchApiError extends Error {
  constructor(readonly operation: string, readonly status: number) {
    super(`Twitch ${operation} failed with ${status || 'network error'}`);
  }
}

/**
 * Twitch OAuth and Helix behind one injectable `fetch`. Secrets go only into
 * request bodies and headers; errors carry the operation and status, never a
 * token or response body.
 */
export function createTwitchApi(config: TwitchExtensionConfig, request: TwitchFetch, now: () => number = Date.now) {
  const call = async (operation: string, url: string, init: RequestInit) => {
    let response: Response;
    try {
      response = await request(url, { ...init, signal: AbortSignal.timeout(DEADLINE_MS) });
    } catch {
      throw new TwitchApiError(operation, 0);
    }
    if (!response.ok) throw new TwitchApiError(operation, response.status);
    return response;
  };

  return {
    authorizeUrl(state: string): string {
      const url = new URL(TWITCH_AUTHORIZE_URL);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', config.oauthRedirectUri);
      // No scope: the site needs only who the streamer is, proven by the login.
      url.searchParams.set('scope', '');
      url.searchParams.set('state', state);
      return url.toString();
    },

    /** Exchanges the code, reads the Twitch user and revokes the token: the site keeps no Twitch token. */
    async identify(code: string): Promise<TwitchUser> {
      const token = await call('token', TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.oauthClientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: config.oauthRedirectUri,
        }).toString(),
      }).then(response => response.json() as Promise<Record<string, unknown>>).catch(error => {
        throw error instanceof TwitchApiError ? error : new TwitchApiError('token', 502);
      });
      const accessToken = typeof token.access_token === 'string' ? token.access_token : '';
      if (!accessToken) throw new TwitchApiError('token', 502);
      try {
        const users = await call('users', USERS_URL, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': config.clientId },
        }).then(response => response.json() as Promise<{ data?: Array<Record<string, unknown>> }>)
          .catch(error => { throw error instanceof TwitchApiError ? error : new TwitchApiError('users', 502); });
        const user = users.data?.[0];
        const id = typeof user?.id === 'string' && /^[0-9]{1,32}$/.test(user.id) ? user.id : '';
        const login = typeof user?.login === 'string' ? user.login.slice(0, 64) : '';
        if (!id || !login) throw new TwitchApiError('users', 502);
        const displayName = typeof user?.display_name === 'string' && user.display_name ? user.display_name.slice(0, 64) : login;
        return { id, login, displayName };
      } finally {
        void call('revoke', REVOKE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: config.clientId, token: accessToken }).toString(),
        }).catch(() => undefined);
      }
    },

    /** Broadcasts one message to every viewer of the channel's extension. */
    async broadcast(channelId: string, message: string): Promise<void> {
      const jwt = externalPubsubJwt({ channelId, ownerId: config.ownerId, secret: config.extensionSecret, now: now() });
      await call('pubsub', PUBSUB_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'Client-Id': config.clientId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: ['broadcast'], broadcaster_id: channelId, is_global_broadcast: false, message }),
      });
    },
  };
}

export type TwitchApi = ReturnType<typeof createTwitchApi>;
