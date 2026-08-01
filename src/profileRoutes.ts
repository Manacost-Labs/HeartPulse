const PROFILE_PATH = /^\/(id\/(\d+)|profiles\/(p_[^/]+))\/?$/;

/** Returns either a numeric public ID or a legacy opaque lookup ID. */
export function publicProfileIdFromPath(path: string): string | null {
  const match = PROFILE_PATH.exec(path);
  return match && (match[2] || match[3]);
}
