/**
 * Navigation surfaces of the page shell, grouped the way the menus show them,
 * and the surface that owns a path. Next.js App Router resolves URLs; this
 * module only decides which navigation entry is highlighted.
 */
import { NAVIGATION_ROUTES } from './navigationDefinitions';

export const TABS = NAVIGATION_ROUTES;
export type TabId = (typeof TABS)[number]['id'];
const group = (name: (typeof TABS)[number]['group']) => TABS.filter(route => route.group === name);
// FAQ lives in the header's Help menu, so it belongs to the footer group, not to a menu group.
export const HOME_TABS = group('home');
export const STANDARD_TABS = group('standard');
export const ARENA_TABS = group('arena');
export const BATTLEGROUNDS_TABS = group('battlegrounds');
export const COMMUNITY_TABS = group('community');
export const ADMIN_TABS = group('admin');
export const ADMIN_ONLY_TAB_IDS = new Set<TabId>(TABS.filter(route => 'adminOnly' in route && route.adminOnly).map(route => route.id));
export const BG_TAB_IDS = new Set<TabId>(BATTLEGROUNDS_TABS.map(route => route.id));

/** The navigation surface for a path; a path outside every section belongs to the home surface. */
export function tabFromPath(path: string): TabId {
  const clean = path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  // An archetype page lives below the meta path but belongs to the archetype catalog.
  if (/^\/standard\/meta\/(?:standard|wild)\/[a-z0-9][a-z0-9-]{0,119}$/.test(clean)) {
    return 'constructed-archetypes';
  }
  const found = TABS.find(route => route.path !== '/'
    && (clean === route.path || clean.startsWith(`${route.path}/`)));
  return found?.id ?? 'home';
}
