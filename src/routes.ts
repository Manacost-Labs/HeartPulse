// Temporary import-compatible facade while remaining consumers move to the
// application routing contract. Route data must not be added here.
export {
  ADMIN_ONLY_TAB_IDS,
  ADMIN_TABS,
  applyPageMeta,
  ARENA_TABS,
  BG_BUILDER_TABS,
  BG_PRIMARY_TABS,
  BG_TAB_IDS,
  isKnownPath,
  isRemovedPagePath,
  MISC_TABS,
  PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS,
  STANDARD_TABS,
  tabFromPath,
  TABS,
  TOP_LEVEL_TABS,
} from './app/routing/routeManifest';

export type {
  RouteEntitlement,
  RouteGroup,
  TabId,
} from './app/routing/routeManifest';
