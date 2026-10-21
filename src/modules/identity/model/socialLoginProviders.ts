type Provider = 'discord' | 'google' | 'yandex' | 'patreon';
export type SocialLoginProvider = { provider: Provider; authUrl: string };

export function parseSocialLoginProviders(value: unknown): SocialLoginProvider[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): SocialLoginProvider[] => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { provider?: unknown; authUrl?: unknown };
    if ((candidate.provider !== 'discord' && candidate.provider !== 'google' && candidate.provider !== 'yandex' && candidate.provider !== 'patreon') || typeof candidate.authUrl !== 'string') return [];
    return [{ provider: candidate.provider, authUrl: candidate.authUrl }];
  });
}
