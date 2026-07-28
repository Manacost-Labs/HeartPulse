const PUBLIC_PROFILE_PATH_PATTERN = /^\/profiles\/(p_[A-Za-z0-9_-]{22})\/?$/;

export function publicProfileIdFromPath(path: string): string | null {
  const normalized = String(path || '/').replace(/[?#].*$/, '');
  return normalized.match(PUBLIC_PROFILE_PATH_PATTERN)?.[1] ?? null;
}

export function publicProfilePath(publicProfileId: string): string {
  if (!/^p_[A-Za-z0-9_-]{22}$/.test(publicProfileId)) return '/';
  return `/profiles/${publicProfileId}`;
}
