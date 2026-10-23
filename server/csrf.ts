const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const PROTECTED_MUTATION_PATHS = [
  /^\/api\/admin(?:\/|$)/,
  /^\/api\/admin-/,
  /^\/api\/auth\/(?:profile|logout|telegram\/(?:link-code|link-start))\/?$/,
  /^\/api\/v1\/oauth\/device\/approve\/?$/,
  /^\/api\/subscription\/refresh\/?$/,
  /^\/api\/account\/sessions\/(?:revoke-others|[^/]+\/revoke)\/?$/,
  /^\/api\/account\/public-profile\/nickname\/?$/,
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

/**
 * Cookie-free machine endpoints that are legitimately called from other sites
 * or servers. Each authenticates on its own (bot secret, signed link, client
 * credentials, bearer or internal key), never with the browser session, so a
 * cross-site request cannot borrow the visitor's cookie through them.
 *
 * An exemption is granted only to the raw path spelled exactly like this
 * (Express ignores case and one trailing slash). Nothing is decoded or
 * collapsed first: `/api/account/sessions/..%2F..%2Fv1%2Foauth/revoke` routes
 * to a session route, so any encoded, dotted or doubled spelling stays
 * subject to the same-origin rule.
 */
const CROSS_SITE_ENDPOINTS = new Set([
  '/api/auth/telegram/bot/webhook',
  '/api/newsletter/unsubscribe',
  '/api/v1/oauth/token',
  '/api/v1/oauth/device/code',
  '/api/v1/oauth/revoke',
  '/api/v1/tracker/events/batch',
  '/api/ecosystem/internal/subscription',
]);

/**
 * The raw path of a request target as Express routes it. An absolute-form
 * target (`POST https://hearthpulse.net/api/…`, as a proxy would send it)
 * routes by its path, so scheme and host are dropped; nothing else is
 * decoded or resolved, so exemptions still need the exact spelling.
 */
export function requestTargetPath(originalUrl: string): string {
  const target = originalUrl.split(/[?#]/, 1)[0];
  return target.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '') || '/';
}

function crossSiteEndpoint(rawPath: string): boolean {
  const lower = rawPath.toLowerCase();
  return CROSS_SITE_ENDPOINTS.has(lower.endsWith('/') ? lower.slice(0, -1) : lower);
}

/**
 * The path as routing may see it: percent-decoded, lower case (Express routes
 * ignore case), repeated slashes collapsed (a mount swallows them), dot
 * segments resolved and no trailing slash. It may only add a requirement (the
 * `X-CSRF-Request` list), never remove one.
 */
export function normalizedRequestPath(path: string): string {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // A malformed escape cannot match a route segment by segment; compare it as written.
  }
  const segments: string[] = [];
  for (const segment of decoded.toLowerCase().split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join('/')}`;
}

/** Whether a cookie mutation on this path also needs `X-CSRF-Request: 1`. */
export function mutationNeedsCsrfProtection(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return false;
  const normalized = normalizedRequestPath(path);
  return PROTECTED_MUTATION_PATHS.some(pattern => pattern.test(normalized));
}

// A browser always sends Sec-Fetch-Site (a header pages cannot set); without
// it, Origin or Referer must name this site. When either is sent it must match.
function sameOriginRequest(context: CsrfRequestContext): boolean {
  const fetchSite = String(context.secFetchSite || '').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin') return false;
  const rawSource = String(context.origin || context.referer || '').trim();
  if (!rawSource) return fetchSite === 'same-origin';
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

/**
 * Deny by default: any state-changing request that carries the session cookie
 * must come from this site (Sec-Fetch-Site, then Origin or Referer), on every
 * path but the cookie-free machine endpoints above (raw path, exact match). Paths in
 * PROTECTED_MUTATION_PATHS additionally need `X-CSRF-Request: 1` unless the
 * request authenticates with a bearer token. A request without the cookie
 * cannot act as the visitor and passes to its route's own authentication.
 */
export function csrfRequestAllowed(context: CsrfRequestContext): boolean {
  if (SAFE_METHODS.has(context.method.toUpperCase())) return true;
  if (!context.authCookiePresent) return true;
  if (crossSiteEndpoint(context.path)) return true;
  if (!sameOriginRequest(context)) return false;
  const path = normalizedRequestPath(context.path);
  if (!PROTECTED_MUTATION_PATHS.some(pattern => pattern.test(path))) return true;
  return String(context.authorization || '').toLowerCase().startsWith('bearer ')
    || String(context.csrfHeader || '') === '1';
}
