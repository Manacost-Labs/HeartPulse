const PUBLIC_PROFILE_ID_PATTERN = /^[1-9][0-9]{0,9}$/;
export const MAX_PUBLIC_PROFILE_ID = 2_147_483_647;

export function isPublicProfileId(value: unknown): value is string {
  if (typeof value !== 'string' || !PUBLIC_PROFILE_ID_PATTERN.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_PUBLIC_PROFILE_ID;
}

/** A stored `public_numeric_id` as a number, or null when it is missing or invalid. */
export function normalizeStoredPublicId(value: unknown): number | null {
  const normalized = String(value ?? '');
  return isPublicProfileId(normalized) ? Number(normalized) : null;
}
