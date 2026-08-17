import assert from 'node:assert/strict';
import {
  PRELOADABLE_ROUTE_IDS,
  ROUTE_MANIFEST,
  routeModuleLoaderForPreload,
  routePath,
  TABS,
  type TabId,
} from '../src/app/routing/public';

assert.equal(new Set(ROUTE_MANIFEST.map(route => route.id)).size, ROUTE_MANIFEST.length,
  'application route surface ids must be unique');
assert.equal(new Set(ROUTE_MANIFEST.map(route => route.path)).size, ROUTE_MANIFEST.length,
  'canonical application route surface paths must be unique');
assert.deepEqual(
  TABS.map(route => ({ id: route.id, slug: route.slug })),
  ROUTE_MANIFEST.map(route => ({ id: route.id, slug: route.path })),
  'the compatibility tab view must be derived from the application route manifest',
);

for (const route of ROUTE_MANIFEST) {
  assert.equal(routePath(route.id), route.path, `${route.id} must resolve to its canonical path`);
}
assert.throws(
  () => routePath('missing-surface' as TabId),
  /Unknown application route: missing-surface/,
  'a stale string-to-TabId cast must fail before browser history is changed',
);

assert.deepEqual(
  [...PRELOADABLE_ROUTE_IDS].sort(),
  [...ROUTE_MANIFEST.map(route => route.id).filter(id => id !== 'home'), 'login'].sort(),
  'every non-home route surface and the login overlay must keep intent preloading',
);
assert.equal(routeModuleLoaderForPreload('home'), null, 'home must not preload on navigation intent');
assert.equal(
  routeModuleLoaderForPreload('articles'),
  routeModuleLoaderForPreload('winrates'),
  'surfaces in the legacy deferred bundle must share one loader identity',
);
assert.equal(routeModuleLoaderForPreload('articles'), routeModuleLoaderForPreload('login'));
assert.equal(routeModuleLoaderForPreload('contests'), routeModuleLoaderForPreload('admin-panel'));
assert.equal(routeModuleLoaderForPreload('bg-heroes'), routeModuleLoaderForPreload('bg-strategies'));
assert.notEqual(
  routeModuleLoaderForPreload('bg-library'),
  routeModuleLoaderForPreload('bg-heroes'),
  'the Battlegrounds library must keep its dedicated lazy chunk',
);

console.log(`application route manifest assertions passed (${ROUTE_MANIFEST.length} surfaces)`);
