const PUBLIC_PROFILE_PATH_PATTERN = /^\/id\/([1-9][0-9]{0,9})\/?$/;
const LEGACY_PUBLIC_PROFILE_PATH_PATTERN = /^\/profiles\/(p_[A-Za-z0-9_-]{22})\/?$/;
const PUBLIC_PROFILE_ID_PATTERN = /^[1-9][0-9]{0,9}$/;
const MAX_PUBLIC_PROFILE_ID = 2_147_483_647;

function isPublicProfileId(value: string): boolean {
  if (!PUBLIC_PROFILE_ID_PATTERN.test(value)) return false;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_PUBLIC_PROFILE_ID;
}

/** Returns either a numeric public ID or a legacy opaque lookup ID. */
export function publicProfileIdFromPath(path: string): string | null {
  const normalized = String(path || '/').replace(/[?#].*$/, '');
  const numericId = normalized.match(PUBLIC_PROFILE_PATH_PATTERN)?.[1];
  if (numericId) return isPublicProfileId(numericId) ? numericId : null;
  return normalized.match(LEGACY_PUBLIC_PROFILE_PATH_PATTERN)?.[1] ?? null;
}

export function publicProfilePath(publicProfileId: string): string {
  if (!isPublicProfileId(publicProfileId)) return '/';
  return `/id/${publicProfileId}`;
}
