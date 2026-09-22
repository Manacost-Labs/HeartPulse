export type PublicProfile = {
  publicProfileId: string;
  name: string;
  avatarInitials: string;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function publicProfileFromPayload(payload: unknown): PublicProfile | null {
  if (!isRecord(payload) || !isRecord(payload.profile)) return null;
  const profile = payload.profile;
  if (typeof profile.publicProfileId !== 'string'
    || typeof profile.name !== 'string'
    || typeof profile.avatarInitials !== 'string'
    || typeof profile.createdAt !== 'string') return null;
  return {
    publicProfileId: profile.publicProfileId,
    name: profile.name,
    avatarInitials: profile.avatarInitials,
    createdAt: profile.createdAt,
  };
}

export function publicProfileErrorFromPayload(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : null;
}
