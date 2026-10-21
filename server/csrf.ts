const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const PROTECTED_MUTATION_PATHS = [
  /^\/api\/admin(?:\/|$)/,
  /^\/api\/admin-/,
  /^\/api\/auth\/(?:profile|logout|telegram\/(?:link-code|link-start))\/?$/,
  /^\/api\/v1\/oauth\/device\/approve\/?$/,
  /^\/api\/subscription\/refresh\/?$/,
  /^\/api\/account\/sessions\/(?:revoke-others|[^/]+\/revoke)\/?$/,
  /^\/api\/contests\/[^/]+\/join\/?$/,
];

export type CsrfRequestContext = {
  method: string;
  path: string;
  authorization?: unknown;
  authCookiePresent: boolean;
  csrfHeader?: unknown;
  origin?: unknown;
  referer?: unknown;
  secFetchSite?: unknown;
  appUrl: string;
  allowLocalDevelopmentOrigins?: boolean;
};

// Express matches routes case-insensitively (`case sensitive routing` is off),
// so `/API/Account/SESSIONS/revoke-others` reaches the same handler: the path
// is compared in lower case, and also percent-decoded, so no spelling of a
// protected route skips the check.
function comparablePaths(path: string): string[] {
  const lower = path.toLowerCase();
  try {
    const decoded = decodeURIComponent(path).toLowerCase();
    return decoded === lower ? [lower] : [lower, decoded];
  } catch {
    return [lower];
  }
}

export function mutationNeedsCsrfProtection(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  const paths = comparablePaths(path);
  return PROTECTED_MUTATION_PATHS.some(pattern => paths.some(candidate => pattern.test(candidate)));
}

export function csrfRequestAllowed(context: CsrfRequestContext): boolean {
  if (!mutationNeedsCsrfProtection(context.method, context.path)) return true;
  if (String(context.authorization || '').toLowerCase().startsWith('bearer ')) return true;
  if (!context.authCookiePresent) return true;
  if (String(context.csrfHeader || '') !== '1') return false;

  const fetchSite = String(context.secFetchSite || '').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin') return false;

  const rawSource = String(context.origin || context.referer || '').trim();
  if (!rawSource) return false;
  try {
    const source = new URL(rawSource);
    const app = new URL(context.appUrl);
    if (source.origin === app.origin) return true;
    return Boolean(context.allowLocalDevelopmentOrigins)
      && (source.hostname === 'localhost' || source.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}
