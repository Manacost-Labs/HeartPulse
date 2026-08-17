const NUMERIC_PUBLIC_PROFILE_ID = /^[1-9]\d{0,9}$/;
const LEGACY_PUBLIC_PROFILE_ID = /^p_[A-Za-z0-9_-]{22}$/;
const MAX_PUBLIC_PROFILE_ID = 2_147_483_647;
const PUBLIC_PROFILE_PATH = /^\/(?:id\/([^/]+)|profiles\/([^/]+))\/?$/;

function isNumericPublicProfileId(value: string): boolean {
  return NUMERIC_PUBLIC_PROFILE_ID.test(value) && Number(value) <= MAX_PUBLIC_PROFILE_ID;
}

/** Returns either a valid numeric public ID or a bounded legacy lookup ID. */
export function publicProfileIdFromPath(path: string): string | null {
  const match = PUBLIC_PROFILE_PATH.exec(path);
  if (!match) return null;
  const numericId = match[1];
  if (numericId) return isNumericPublicProfileId(numericId) ? numericId : null;
  const legacyId = match[2];
  return legacyId && LEGACY_PUBLIC_PROFILE_ID.test(legacyId) ? legacyId : null;
}

/** Builds canonical links only for server-issued numeric public IDs. */
export function publicProfilePath(publicProfileId: string): string {
  return isNumericPublicProfileId(publicProfileId) ? `/id/${publicProfileId}` : '/';
}
