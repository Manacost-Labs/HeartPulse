import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

/**
 * Readable companion of the HttpOnly session cookie. It names the session
 * without granting anything: a one-way digest of the token, so the browser can
 * tell whether the viewer it remembers (apps/public-web/ui/viewerHint.ts)
 * still belongs to the session it holds. It expires with the server session
 * and disappears on sign-out, so a shared device never shows the previous
 * viewer from that memory.
 */
export const VIEWER_SESSION_COOKIE = 'hp_viewer';

const VIEWER_TAG_VALUE = /(?:^|;\s*)hp_viewer=([A-Za-z0-9_-]{22})(?:;|$)/;
// Session cookies are written only by sign-in and cleared by sign-out, never
// renewed by a session check: an answer that reaches the browser after
// another tab signed out or in would otherwise put the previous session back.
// So they live as long as a browser keeps a cookie (400 days in Chromium);
// the server's session expiry (with its sliding extension) decides validity.
const PERSISTENT_COOKIE_SECONDS = 400 * 24 * 60 * 60;

/** The viewer tag the request carried, if well-formed. */
export function requestViewerTag(request: Request): string | null {
  return VIEWER_TAG_VALUE.exec(String(request.headers.cookie ?? ''))?.[1] ?? null;
}

/** The session's tag when the request carries it, so an answer names the session the browser holds. */
export function requestViewerSession(request: Request, token: string): string | null {
  const tag = viewerSessionTag(token);
  return requestViewerTag(request) === tag ? tag : null;
}

export function viewerSessionTag(token: string): string {
  return createHash('sha256').update(`hearthpulse-viewer-session:${token}`).digest('base64url').slice(0, 22);
}

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
  const secure = (request: Request) => dependencies.appUrl.startsWith('https://') || isSecureRequest(request);
  const cookieAttributes = (request: Request, maxAge: string) => [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure(request) ? 'Secure' : '',
    maxAge,
  ].filter(Boolean);
  const viewerCookie = (request: Request, value: string, maxAgeSeconds: number) => [
    `${VIEWER_SESSION_COOKIE}=${value}`, 'Path=/', 'SameSite=Lax', secure(request) ? 'Secure' : '', `Max-Age=${maxAgeSeconds}`,
  ].filter(Boolean).join('; ');

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

  const maxAge = Math.max(Math.floor(dependencies.sessionTtlMs / 1000), PERSISTENT_COOKIE_SECONDS);
  const handlers = {
    /** Sign-in: the session cookie and its readable viewer tag, together in one response. */
    setAuthCookie(request: Request, response: Response, token: string) {
      const attributes = cookieAttributes(request, `Max-Age=${maxAge}`);
      if (dependencies.cookieName.startsWith('__Host-') && !attributes.includes('Secure')) {
        throw new Error('__Host- auth cookie requires HTTPS');
      }
      expireLegacyName(request, response);
      const legacyDomain = legacyArenaCookieDomain(request, dependencies.appUrl);
      if (legacyDomain && !dependencies.cookieName.startsWith('__Host-')) response.append('Set-Cookie', [`${dependencies.cookieName}=`, ...cookieAttributes(request, 'Max-Age=0'), legacyDomain].join('; '));
      response.append('Set-Cookie', [`${dependencies.cookieName}=${encodeURIComponent(token)}`, ...attributes].join('; '));
      response.append('Set-Cookie', viewerCookie(request, viewerSessionTag(token), maxAge));
    },
    clearAuthCookie(request: Request, response: Response) {
      expire(request, response, dependencies.cookieName);
      expireLegacyName(request, response);
      response.append('Set-Cookie', viewerCookie(request, '', 0));
    },
  };
  return handlers;
}
