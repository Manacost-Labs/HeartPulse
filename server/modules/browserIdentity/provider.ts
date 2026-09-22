import Provider, { type Configuration } from 'oidc-provider';
import { createIdentityAdapter } from './adapter.js';
import { type BrowserIdentityOptions, validateIdentityOptions } from './configuration.js';

function providerConfiguration(options: BrowserIdentityOptions): Configuration {
  return {
    adapter: createIdentityAdapter(options.database, options.encryptionKey),
    jwks: options.signingKeys,
    clients: options.clients.map((client) => ({ client_id: client.id, client_secret: client.secret,
      redirect_uris: [client.redirectUri], response_types: ['code'],
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'client_secret_basic', id_token_signed_response_alg: 'RS256' })),
    responseTypes: ['code'],
    scopes: ['openid', 'profile', 'offline_access'],
    claims: { openid: ['sub'], profile: ['name'] },
    pkce: { required: () => true },
    rotateRefreshToken: true,
    revokeGrantPolicy: () => true,
    clientBasedCORS: () => false,
    features: { devInteractions: { enabled: false }, registration: { enabled: false },
      revocation: { enabled: true, allowedPolicy: (_ctx, client, token) => client.clientId === token.clientId },
      introspection: { enabled: true, allowedPolicy: async (_ctx, client, token) => {
        if (client.clientId !== token.clientId || !('accountId' in token) || !('grantId' in token)
          || !token.accountId || !token.grantId) return false;
        const account = await options.resolveAccount(token.accountId, token.grantId);
        return account?.subject === token.accountId;
      } } },
    cookies: { keys: options.cookieKeys,
      names: { session: '__Host-hp_identity', interaction: '__Secure-hp_interaction', resume: '__Secure-hp_resume' },
      long: { secure: true, httpOnly: true, sameSite: 'lax', path: '/' },
      short: { secure: true, httpOnly: true, sameSite: 'lax' } },
    ttl: { AccessToken: 300, AuthorizationCode: 60, IdToken: 300,
      Interaction: 600, Session: 86_400, Grant: 604_800, RefreshToken: 604_800 },
    interactions: { url: (_ctx, interaction) => `/identity/interaction/${encodeURIComponent(interaction.uid)}` },
    findAccount: async (ctx, subject, token) => {
      const account = token?.grantId
        ? await options.resolveAccount(subject, token.grantId)
        : await options.resolveBrowserAccount?.(subject, ctx.req);
      if (!account || account.subject !== subject) return undefined;
      return { accountId: subject, claims: async () => ({ sub: subject, name: account.displayName }) };
    },
  };
}

/** Creates an isolated provider; the runtime owns browser consent and canonical session checks. */
export function createBrowserIdentityProvider(options: BrowserIdentityOptions): Provider {
  validateIdentityOptions(options);
  return new Provider(options.issuer, providerConfiguration(options));
}
