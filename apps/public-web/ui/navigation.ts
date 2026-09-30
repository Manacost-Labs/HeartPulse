import { canonicalPagePath } from '@/src/app/routing/canonicalPagePath';
import { NAVIGATION_ROUTES } from '@/src/app/routing/navigationDefinitions';

/**
 * Loads another page as a full document, at its canonical URL. Every Next.js
 * page mounts its own legacy page shell and data hooks, so in-app transitions
 * between pages are not wired yet.
 */
export function navigate(path: string): void {
  window.location.assign(canonicalPagePath(path));
}

/** Opens a primary navigation destination by its `NAVIGATION_ROUTES` id. */
export function navigateTab(tab: string): void {
  const route = NAVIGATION_ROUTES.find(item => item.id === tab);
  if (!route) throw new Error(`Unknown navigation destination: ${tab}`);
  navigate(route.path);
}
