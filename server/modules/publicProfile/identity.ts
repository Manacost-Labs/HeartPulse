const PUBLIC_PROFILE_ID_PATTERN = /^[1-9][0-9]{0,9}$/;
const LEGACY_PUBLIC_PROFILE_ID_PATTERN = /^p_[A-Za-z0-9_-]{22}$/;
export const MAX_PUBLIC_PROFILE_ID = 2_147_483_647;

export function isPublicProfileId(value: unknown): value is string {
  if (typeof value !== 'string' || !PUBLIC_PROFILE_ID_PATTERN.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_PUBLIC_PROFILE_ID;
}

export function isLegacyPublicProfileId(value: unknown): value is string {
  return typeof value === 'string' && LEGACY_PUBLIC_PROFILE_ID_PATTERN.test(value);
}

export function isPublicProfileLookupId(value: unknown): value is string {
  return isPublicProfileId(value) || isLegacyPublicProfileId(value);
}
