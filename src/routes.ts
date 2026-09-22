// Temporary import-compatible facade while remaining consumers move to the
// application routing contract. Route data must not be added here.
import { TABS as APPLICATION_TABS } from './app/routing/routeManifest';

export {
  ADMIN_ONLY_TAB_IDS,
  applyPageMeta,
  BG_TAB_IDS,
  isKnownPath,
  isRemovedPagePath,
  PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS,
  tabFromPath,
} from './app/routing/routeManifest';

export const TABS = APPLICATION_TABS;
const routesInGroup = (group: (typeof TABS)[number]['group']) => TABS.filter(route => route.group === group);

// These views intentionally preserve the legacy `slug` field. New application
// code imports canonical `path` groups from app/routing/public.
export const TOP_LEVEL_TABS = routesInGroup('top').filter(route => route.id !== 'faq');
export const STANDARD_TABS = routesInGroup('standard');
export const ARENA_TABS = routesInGroup('arena');
export const BG_PRIMARY_TABS = routesInGroup('bg-primary');
export const BG_BUILDER_TABS = routesInGroup('bg-builder');
export const MISC_TABS = routesInGroup('misc');
export const ADMIN_TABS = routesInGroup('admin');

export type {
  RouteEntitlement,
  RouteGroup,
  TabId,
} from './app/routing/routeManifest';
