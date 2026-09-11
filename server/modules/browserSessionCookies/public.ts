import type { Request, Response } from 'express';

type BrowserSessionCookieDependencies = {
  cookieName: string;
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
    isSecureRequest(request) ? 'Secure' : '',
    maxAge,
  ].filter(Boolean);

  const clear = (request: Request, response: Response) => {
    const attributes = cookieAttributes(request, 'Max-Age=0');
    response.append('Set-Cookie', [`${dependencies.cookieName}=`, ...attributes].join('; '));
    const legacyDomain = legacyArenaCookieDomain(request, dependencies.appUrl);
    if (legacyDomain) response.append('Set-Cookie', [`${dependencies.cookieName}=`, ...attributes, legacyDomain].join('; '));
  };

  return {
    setAuthCookie(request: Request, response: Response, token: string) {
      const attributes = cookieAttributes(request, `Max-Age=${Math.floor(dependencies.sessionTtlMs / 1000)}`);
      const legacyDomain = legacyArenaCookieDomain(request, dependencies.appUrl);
      if (legacyDomain) response.append('Set-Cookie', [`${dependencies.cookieName}=`, ...cookieAttributes(request, 'Max-Age=0'), legacyDomain].join('; '));
      response.append('Set-Cookie', [`${dependencies.cookieName}=${encodeURIComponent(token)}`, ...attributes].join('; '));
    },
    clearAuthCookie: clear,
  };
}
