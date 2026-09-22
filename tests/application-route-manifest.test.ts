import assert from 'node:assert/strict';
import {
  PRELOADABLE_ROUTE_IDS,
  ROUTE_MANIFEST,
  routeModuleLoaderForPreload,
  routePath,
  TABS,
  type RoutePreloadId,
  type TabId,
} from '../src/app/routing/public';
import {
  ADMIN_TABS as LEGACY_ADMIN_TABS,
  ARENA_TABS as LEGACY_ARENA_TABS,
  BG_BUILDER_TABS as LEGACY_BG_BUILDER_TABS,
  BG_PRIMARY_TABS as LEGACY_BG_PRIMARY_TABS,
  MISC_TABS as LEGACY_MISC_TABS,
  STANDARD_TABS as LEGACY_STANDARD_TABS,
  TOP_LEVEL_TABS as LEGACY_TOP_LEVEL_TABS,
} from '../src/routes';

const EXPECTED_ROUTE_PATHS = [
  ['home', '/'],
  ['articles', '/articles'],
  ['faq', '/faq'],
  ['developer-api', '/developers/api'],
  ['gallery', '/gallery'],
  ['cosmetics', '/cosmetics'],
  ['guides-archive', '/guides-archive'],
  ['contests', '/contests'],
  ['standard-matchups', '/standard/matchups'],
  ['standard-meta', '/standard/meta'],
  ['fun-decks', '/standard/fun-decks'],
  ['constructed-archetypes', '/standard/archetypes'],
  ['standard-vicious-gold', '/standard/vicious-gold'],
  ['standard-cards', '/standard/cards'],
  ['winrates', '/classes'],
  ['tierlist', '/tierlist'],
  ['legendaries', '/legendaries'],
  ['bg-heroes', '/heroes'],
  ['bg-library', '/library'],
  ['bg-tier-list', '/battlegrounds/tier-list'],
  ['bg-strategies', '/battlegrounds/strategies'],
  ['bg-tier-builder', '/battlegrounds/tier-builder'],
  ['admin-panel', '/admin'],
] as const satisfies readonly (readonly [TabId, `/${string}`])[];

assert.deepEqual(
  ROUTE_MANIFEST.map(route => [route.id, route.path]),
  EXPECTED_ROUTE_PATHS,
  'the application contract must retain every route surface and canonical path',
);

assert.equal(new Set(ROUTE_MANIFEST.map(route => route.id)).size, ROUTE_MANIFEST.length,
  'application route surface ids must be unique');
assert.equal(new Set(ROUTE_MANIFEST.map(route => route.path)).size, ROUTE_MANIFEST.length,
  'canonical application route surface paths must be unique');
assert.deepEqual(
  TABS.map(route => ({ id: route.id, slug: route.slug })),
  ROUTE_MANIFEST.map(route => ({ id: route.id, slug: route.path })),
  'the compatibility tab view must be derived from the application route manifest',
);
for (const route of [
  ...LEGACY_TOP_LEVEL_TABS,
  ...LEGACY_STANDARD_TABS,
  ...LEGACY_ARENA_TABS,
  ...LEGACY_BG_PRIMARY_TABS,
  ...LEGACY_BG_BUILDER_TABS,
  ...LEGACY_MISC_TABS,
  ...LEGACY_ADMIN_TABS,
]) {
  assert.equal(route.slug, route.path, `${route.id} must preserve its compatibility slug alias`);
}

for (const route of ROUTE_MANIFEST) {
  assert.equal(routePath(route.id), route.path, `${route.id} must resolve to its canonical path`);
}
assert.throws(
  () => routePath('missing-surface' as TabId),
  /Unknown route surface: missing-surface/,
  'a stale string-to-TabId cast must fail before browser history is changed',
);

assert.deepEqual(
  [...PRELOADABLE_ROUTE_IDS].sort(),
  [...ROUTE_MANIFEST.map(route => route.id).filter(id => id !== 'home'), 'login'].sort(),
  'every non-home route surface and the login overlay must keep intent preloading',
);
assert.equal(routeModuleLoaderForPreload('home'), null, 'home must not preload on navigation intent');

const EXPECTED_PRELOAD_GROUPS = [
  ['articles', 'winrates', 'tierlist', 'legendaries'],
  ['login'],
  ['faq'],
  ['developer-api'],
  ['gallery'],
  ['cosmetics'],
  ['guides-archive'],
  ['contests', 'admin-panel'],
  ['standard-matchups'],
  ['standard-meta'],
  ['fun-decks'],
  ['constructed-archetypes'],
  ['standard-vicious-gold'],
  ['standard-cards'],
  ['bg-heroes', 'bg-tier-list', 'bg-strategies', 'bg-tier-builder'],
  ['bg-library'],
] as const satisfies readonly (readonly RoutePreloadId[])[];

const representativeLoaders = EXPECTED_PRELOAD_GROUPS.map(group => {
  const loader = routeModuleLoaderForPreload(group[0]);
  assert.ok(loader, `${group[0]} must own a preload loader`);
  for (const routeId of group.slice(1)) {
    assert.equal(
      routeModuleLoaderForPreload(routeId),
      loader,
      `${routeId} and ${group[0]} must retain the same lazy chunk owner`,
    );
  }
  return loader;
});

assert.equal(
  new Set(representativeLoaders).size,
  EXPECTED_PRELOAD_GROUPS.length,
  'unrelated route-module groups must retain distinct loader identities',
);
const homeLoader = ROUTE_MANIFEST.find(route => route.id === 'home')?.loader;
assert.ok(homeLoader, 'home must retain its route loader even though intent preloading is disabled');
assert.equal(
  new Set([homeLoader, ...representativeLoaders]).size,
  EXPECTED_PRELOAD_GROUPS.length + 1,
  'the manifest must retain all 19 route-module loader identities',
);

console.log(`application route manifest assertions passed (${ROUTE_MANIFEST.length} surfaces)`);
