/** Everything the site needs from the Twitch developer console; see docs/runbooks/twitch-extension.md. */
export type TwitchExtensionConfig = {
  clientId: string;
  /** Decoded from `TWITCH_EXTENSION_SECRET` (base64 in the console). */
  extensionSecret: Buffer;
  ownerId: string;
  oauthClientSecret: string;
  oauthRedirectUri: string;
};

/**
 * Null unless every variable is present and well formed: a half-configured
 * extension answers `twitch_not_configured` instead of failing at runtime.
 */
export function readTwitchExtensionConfig(env: Record<string, string | undefined>): TwitchExtensionConfig | null {
  const clientId = String(env.TWITCH_EXTENSION_CLIENT_ID ?? '').trim();
  const secret = String(env.TWITCH_EXTENSION_SECRET ?? '').trim();
  const ownerId = String(env.TWITCH_EXTENSION_OWNER_ID ?? '').trim();
  const oauthClientSecret = String(env.TWITCH_OAUTH_CLIENT_SECRET ?? '').trim();
  const oauthRedirectUri = String(env.TWITCH_OAUTH_REDIRECT_URI ?? '').trim();
  if (!/^[a-z0-9]{1,64}$/.test(clientId) || !/^[0-9]{1,32}$/.test(ownerId) || !oauthClientSecret) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(secret)) return null;
  const extensionSecret = Buffer.from(secret, 'base64');
  if (extensionSecret.length < 16) return null;
  try {
    const redirect = new URL(oauthRedirectUri);
    if (redirect.protocol !== 'https:' && redirect.hostname !== 'localhost' && redirect.hostname !== '127.0.0.1') return null;
  } catch {
    return null;
  }
  return { clientId, extensionSecret, ownerId, oauthClientSecret, oauthRedirectUri };
}

/** The only origin a hosted extension iframe runs on. */
export const twitchExtensionOrigin = (clientId: string) => `https://${clientId}.ext-twitch.tv`;
