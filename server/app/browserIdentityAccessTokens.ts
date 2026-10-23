import type Provider from 'oidc-provider';
import type { GameUploadToken } from '../modules/playerGames/public.js';

type IdentityBindings = { resolve: (subject: string, grantId?: string) => { subject: string } | undefined };

/**
 * Verifies a bearer access token issued by the site's OIDC provider for API
 * calls outside `/identity`. It reads the provider's own token store and the
 * same grant-to-session binding the provider uses in `findAccount`, so logout,
 * password reset and blocking revoke the token here exactly as they do there.
 */
export function createBrowserIdentityAccessTokens(runtime: { provider: Provider; bindings: IdentityBindings }) {
  return {
    async verify(value: string): Promise<GameUploadToken | null> {
      try {
        const token = await runtime.provider.AccessToken.find(value);
        if (!token || token.isExpired || !token.accountId || !token.grantId || !token.clientId) return null;
        const account = runtime.bindings.resolve(token.accountId, token.grantId);
        if (!account || account.subject !== token.accountId) return null;
        return {
          userId: account.subject,
          clientId: token.clientId,
          scopes: String(token.scope ?? '').split(/\s+/).filter(Boolean),
        };
      } catch {
        return null;
      }
    },
  };
}

export type BrowserIdentityAccessTokens = ReturnType<typeof createBrowserIdentityAccessTokens>;
