/** Typed application-surface ownership, loading and navigation metadata. */
import { NAVIGATION_ROUTES, navigationDefinition } from './navigationDefinitions';
import {
  loadLoginPanel,
  publicProfileIdFromPath,
} from '../../modules/identity/public';
import type { ResolvedPublicUrlPolicy } from '../../shared/seo/publicUrlPolicy';

export const loadDeferredRoutesModule = () => import('../../features/DeferredRoutes');
export const loadHomeModule = () => import('../../features/Home');
export const loadLegalPageModule = () => import('./legalPageRoute');
export const loadFAQPageModule = () => import('../../features/FAQPage');
export const loadDeveloperApiModule = () => import('../../modules/developerApi/public');
export const loadBgLibraryModule = () => import('../../features/BgLibrary');
export const loadGuidesArchiveModule = () => import('../../features/GuidesArchive');
export const loadCosmeticsModule = () => import('../../features/Cosmetics');
export const loadGalleryModule = () => import('../../features/GalleryTab');
export const loadStandardMatchupsModule = () => import('../../features/StandardMatchups');
export const loadStandardMetaModule = () => import('../../features/StandardMeta');
export const loadConstructedArchetypesModule = () => import('../../features/ConstructedArchetypes');
export const loadViciousSyndicateGoldModule = () => import('../../features/ViciousSyndicateGold');
export const loadStandardCardsModule = () => import('../../features/StandardCards');
export const loadFunDecksModule = () => import('../../features/FunDecksPage');
export const loadContestsModule = () => import('../../features/Contests');
export const loadBattlegroundsModule = () => import('../../features/Battlegrounds');

import { defineRouteSurface, type RouteModuleLoader, type RouteGroup, type RouteEntitlement, type ApplicationRouteSurfaceDefinition } from './routeSurface';
export type { RouteGroup, RouteEntitlement } from './routeSurface';

export const ROUTE_MANIFEST = [
  defineRouteSurface(
    navigationDefinition('home'),
    loadHomeModule,
    'none',
  ),
  defineRouteSurface(
    navigationDefinition('articles'),
    loadDeferredRoutesModule,
  ),
  defineRouteSurface(navigationDefinition('faq'), loadFAQPageModule),
  defineRouteSurface(navigationDefinition('developer-api'), loadDeveloperApiModule),
  defineRouteSurface(navigationDefinition('privacy'), loadLegalPageModule),
  defineRouteSurface(navigationDefinition('terms'), loadLegalPageModule),
  defineRouteSurface(navigationDefinition('gallery'), loadGalleryModule),
  defineRouteSurface(navigationDefinition('cosmetics'), loadCosmeticsModule),
  defineRouteSurface(navigationDefinition('guides-archive'), loadGuidesArchiveModule),
  defineRouteSurface(navigationDefinition('contests'), loadContestsModule),
  defineRouteSurface(navigationDefinition('standard-matchups'), loadStandardMatchupsModule),
  defineRouteSurface(navigationDefinition('standard-meta'), loadStandardMetaModule),
  defineRouteSurface(navigationDefinition('fun-decks'), loadFunDecksModule),
  defineRouteSurface(navigationDefinition('constructed-archetypes'), loadConstructedArchetypesModule),
  defineRouteSurface(navigationDefinition('standard-vicious-gold'), loadViciousSyndicateGoldModule),
  defineRouteSurface(navigationDefinition('standard-cards'), loadStandardCardsModule),
  defineRouteSurface(
    navigationDefinition('winrates'),
    loadDeferredRoutesModule,
  ),
  defineRouteSurface(
    navigationDefinition('tierlist'),
    loadDeferredRoutesModule,
  ),
  defineRouteSurface(
    navigationDefinition('legendaries'),
    loadDeferredRoutesModule,
  ),
  defineRouteSurface(
    navigationDefinition('bg-heroes'),
    loadBattlegroundsModule,
  ),
  defineRouteSurface(navigationDefinition('bg-library'), loadBgLibraryModule),
  defineRouteSurface(
    navigationDefinition('bg-tier-list'),
    loadBattlegroundsModule,
  ),
  defineRouteSurface(
    navigationDefinition('bg-strategies'),
    loadBattlegroundsModule,
  ),
  defineRouteSurface(
    navigationDefinition('bg-tier-builder'),
    loadBattlegroundsModule,
  ),
  defineRouteSurface(
    navigationDefinition('admin-panel'),
    loadContestsModule,
  ),
] as const satisfies readonly ApplicationRouteSurfaceDefinition[];

export type ApplicationRouteSurface = (typeof ROUTE_MANIFEST)[number];
export type TabId = ApplicationRouteSurface['id'];
export type RoutePreloadId = TabId | 'login';
export type NavigationRoute = ApplicationRouteSurface & { slug: ApplicationRouteSurface['path'] };

const ROUTE_BY_ID = new Map<TabId, ApplicationRouteSurface>(
  ROUTE_MANIFEST.map(route => [route.id, route]),
);

export const TABS: readonly NavigationRoute[] = /* @__PURE__ */ (() => (
  ROUTE_MANIFEST.map(route => ({ ...route, slug: route.path }))
))();

const routesInGroup = (group: RouteGroup) => TABS.filter(route => route.group === group);

// FAQ remains in the global Help menu instead of the primary product navigation.
export const TOP_LEVEL_TABS = routesInGroup('top').filter(route => route.id !== 'faq');
export const STANDARD_TABS = routesInGroup('standard');
export const ARENA_TABS = routesInGroup('arena');
export const BG_PRIMARY_TABS = routesInGroup('bg-primary');
export const BG_BUILDER_TABS = routesInGroup('bg-builder');
export const MISC_TABS = routesInGroup('misc');
export const ADMIN_TABS = routesInGroup('admin');
export const ADMIN_ONLY_TAB_IDS = new Set<TabId>(
  ROUTE_MANIFEST.filter(route => 'adminOnly' in route && route.adminOnly).map(route => route.id),
);
export const BG_TAB_IDS = new Set<TabId>(
  ROUTE_MANIFEST.filter(route => route.group === 'bg-primary' || route.group === 'bg-builder')
    .map(route => route.id),
);
export const PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS = Object.fromEntries(
  ROUTE_MANIFEST.filter(route => route.entitlement).map(route => [route.id, route.entitlement]),
) as Partial<Record<TabId, RouteEntitlement>>;
export const PRELOADABLE_ROUTE_IDS = /* @__PURE__ */ (() => new Set<RoutePreloadId>([
  ...ROUTE_MANIFEST.filter(route => route.preload === 'intent').map(route => route.id),
  'login',
]))();

export function routeModuleLoaderForPreload(routeId: RoutePreloadId): RouteModuleLoader | null {
  if (routeId === 'login') return loadLoginPanel;
  const route = ROUTE_BY_ID.get(routeId);
  return route?.preload === 'intent' ? route.loader : null;
}

export function preloadRouteModule(routeId: RoutePreloadId): void {
  const loader = routeModuleLoaderForPreload(routeId);
  if (!loader) return;
  void loader().catch(() => {});
}

export function routePath(routeId: TabId): `/${string}` {
  const route = ROUTE_BY_ID.get(routeId);
  if (!route) throw new Error(`Unknown route surface: ${routeId}`);
  return route.path;
}

export function isRemovedPagePath(path: string): boolean {
  const clean = path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  return clean === '/decks' || clean.startsWith('/decks/') || clean === '/jobs' || clean.startsWith('/jobs/');
}

export function tabFromPath(path: string): TabId {
  const clean = path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  if (isRemovedPagePath(clean)) return 'home';
  if (publicProfileIdFromPath(clean)) return 'home';
  if (/^\/standard\/meta\/(?:standard|wild)\/[a-z0-9][a-z0-9-]{0,119}$/.test(clean)) {
    return 'constructed-archetypes';
  }
  const found = NAVIGATION_ROUTES.find(route => route.path !== '/'
    && (clean === route.path || clean.startsWith(`${route.path}/`)));
  return found?.id ?? 'home';
}

export function isKnownPath(path: string): boolean {
  const clean = path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '/connect' || isRemovedPagePath(clean) || publicProfileIdFromPath(clean)) return true;
  return NAVIGATION_ROUTES.some(route => route.path !== '/'
    && (clean === route.path || clean.startsWith(`${route.path}/`)));
}

export async function applyPageMeta(
  tabId: TabId,
  pathname = window.location.pathname,
  search = window.location.search,
): Promise<ResolvedPublicUrlPolicy> {
  const [{ seoPageForExactPath, seoPageForNavigationRoute }, { applyDocumentPageMeta }] = await Promise.all([
    import('../../seo/registry'),
    import('../../shared/seo/publicUrlPolicy'),
  ]);
  const route = ROUTE_BY_ID.get(tabId) ?? ROUTE_MANIFEST[0];
  const { title, description } = seoPageForExactPath(pathname)
    ?? seoPageForNavigationRoute(route.id);
  return applyDocumentPageMeta({ title, description, pathname, search });
}
