/** Sign-in providers the account page names; storage spellings map onto them. */
export type LinkedSignInProvider = 'email' | 'telegram' | 'google' | 'discord' | 'yandex' | 'patreon';

const STORED_PROVIDERS: Record<string, LinkedSignInProvider> = {
  email: 'email',
  telegram: 'telegram',
  telegram_oidc: 'telegram',
  google_oauth: 'google',
  discord_oauth: 'discord',
  yandex_oauth: 'yandex',
  patreon_oauth: 'patreon',
};

/**
 * Collapses stored identity providers into the public names, once each and in
 * a stable order. Unknown spellings are dropped rather than passed through, so
 * a new storage provider never leaks to the browser before it has a name.
 */
export function linkedSignInProviders(stored: Iterable<string>): LinkedSignInProvider[] {
  const linked = new Set<LinkedSignInProvider>();
  for (const value of stored) {
    const provider = STORED_PROVIDERS[value];
    if (provider) linked.add(provider);
  }
  return [...linked].sort();
}
