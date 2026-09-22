import {
  publicProfileErrorFromPayload,
  publicProfileFromPayload,
  type PublicProfile,
} from '../model/publicProfile';

export async function fetchPublicProfile(
  publicProfileId: string,
  signal: AbortSignal,
): Promise<PublicProfile> {
  const response = await fetch(`/api/profiles/${encodeURIComponent(publicProfileId)}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  const profile = publicProfileFromPayload(payload);
  if (!response.ok || !profile) {
    throw new Error(publicProfileErrorFromPayload(payload) || 'Профиль не найден');
  }
  return profile;
}
