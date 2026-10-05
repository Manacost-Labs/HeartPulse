import { canonicalPagePath } from '@/src/app/routing/canonicalPagePath';
import { NAVIGATION_ROUTES } from '@/src/app/routing/navigationDefinitions';
import { publicWebOwner } from '@/apps/public-web/routeOwnership.mjs';

type ClientNavigate = (path: string) => void;
let clientNavigate: ClientNavigate | null = null;

/** The root layout owns the router; a stale cleanup must not detach its replacement. */
export function installClientNavigation(handler: ClientNavigate): () => void {
  clientNavigate = handler;
  return () => { if (clientNavigate === handler) clientNavigate = null; };
}

/** Only public HTML owned by Next may bypass native document navigation. */
export function clientPagePath(href: string, baseUrl: string): string | null {
  if (href.startsWith('#')) return null;
  const base = new URL(baseUrl);
  let url: URL;
  try { url = new URL(href, base); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin
    || /^\/(?:admin|_next|health)(?:\/|$)/.test(url.pathname)
    || publicWebOwner(url.pathname, true, 'GET', true, true) !== 'next') return null;
  return canonicalPagePath(`${url.pathname}${url.search}${url.hash}`);
}

/**
 * Uses the mounted public App Router, or native navigation before hydration
 * and for destinations outside the public Next page families.
 */
export function navigate(path: string): void {
  const target = canonicalPagePath(path);
  if (clientNavigate && clientPagePath(target, window.location.href || 'https://hearthpulse.net/')) {
    clientNavigate(target);
  } else window.location.assign(target);
}

/** Opens a primary navigation destination by its `NAVIGATION_ROUTES` id. */
export function navigateTab(tab: string): void {
  const route = NAVIGATION_ROUTES.find(item => item.id === tab);
  if (!route) throw new Error(`Unknown navigation destination: ${tab}`);
  navigate(route.path);
}
