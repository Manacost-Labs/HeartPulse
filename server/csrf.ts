const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const PROTECTED_MUTATION_PATHS = [
  /^\/api\/admin(?:\/|$)/,
  /^\/api\/admin-/,
  /^\/api\/auth\/(?:profile|logout|telegram\/link-code)\/?$/,
  /^\/api\/v1\/oauth\/device\/approve\/?$/,
  /^\/api\/subscription\/refresh\/?$/,
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

export function mutationNeedsCsrfProtection(method: string, path: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase())
    && PROTECTED_MUTATION_PATHS.some(pattern => pattern.test(path));
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
