import type { Request, Response } from 'express';

type BrowserSessionCookieDependencies = {
  cookieName: string;
  legacyCookieName?: string;
  sessionTtlMs: number;
  appUrl: string;
};

function isSecureRequest(request: Request): boolean {
  return String(request.headers['x-forwarded-proto'] ?? request.protocol).includes('https')
    || String(request.headers.host ?? '').includes('arena.hs-manacost.ru')
    || String(request.headers.host ?? '').includes('hearthpulse.net');
}

export function legacyArenaCookieDomain(request: Request, appUrl: string): string {
  if (new URL(appUrl).hostname !== 'arena.hs-manacost.ru') return '';
  const host = String(request.headers.host ?? '').split(':')[0].toLowerCase();
  return host === 'arena.hs-manacost.ru' || host.endsWith('.arena.hs-manacost.ru')
    ? 'Domain=.arena.hs-manacost.ru'
    : '';
}

/** Browser-only session cookies, including cleanup for the retired Arena subdomain cookie. */
export function createBrowserSessionCookieHandlers(dependencies: BrowserSessionCookieDependencies) {
  const cookieAttributes = (request: Request, maxAge: string) => [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    dependencies.appUrl.startsWith('https://') || isSecureRequest(request) ? 'Secure' : '',
    maxAge,
  ].filter(Boolean);

  const expire = (request: Request, response: Response, name: string) => {
    const attributes = cookieAttributes(request, 'Max-Age=0');
    response.append('Set-Cookie', [`${name}=`, ...attributes].join('; '));
    const legacyDomain = legacyArenaCookieDomain(request, dependencies.appUrl);
    if (legacyDomain && !name.startsWith('__Host-')) response.append('Set-Cookie', [`${name}=`, ...attributes, legacyDomain].join('; '));
  };

  const expireLegacyName = (request: Request, response: Response) => {
    if (dependencies.legacyCookieName && dependencies.legacyCookieName !== dependencies.cookieName) {
      expire(request, response, dependencies.legacyCookieName);
    }
  };

  return {
    setAuthCookie(request: Request, response: Response, token: string) {
      const attributes = cookieAttributes(request, `Max-Age=${Math.floor(dependencies.sessionTtlMs / 1000)}`);
      if (dependencies.cookieName.startsWith('__Host-') && !attributes.includes('Secure')) {
        throw new Error('__Host- auth cookie requires HTTPS');
      }
      expireLegacyName(request, response);
      const legacyDomain = legacyArenaCookieDomain(request, dependencies.appUrl);
      if (legacyDomain && !dependencies.cookieName.startsWith('__Host-')) response.append('Set-Cookie', [`${dependencies.cookieName}=`, ...cookieAttributes(request, 'Max-Age=0'), legacyDomain].join('; '));
      response.append('Set-Cookie', [`${dependencies.cookieName}=${encodeURIComponent(token)}`, ...attributes].join('; '));
    },
    clearAuthCookie(request: Request, response: Response) {
      expire(request, response, dependencies.cookieName);
      expireLegacyName(request, response);
    },
  };
}
