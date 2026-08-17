import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const routeManifestSource = readFileSync(new URL('../src/app/routing/routeManifest.tsx', import.meta.url), 'utf8');
const routeModulesSource = readFileSync(new URL('../src/app/routing/routeModules.tsx', import.meta.url), 'utf8');
const applicationNavigationSource = readFileSync(
  new URL('../src/app/routing/useApplicationNavigation.ts', import.meta.url),
  'utf8',
);
const gallerySource = readFileSync(new URL('../src/features/GalleryTab.tsx', import.meta.url), 'utf8');

assert.match(
  routeManifestSource,
  /loadGalleryModule = \(\) => import\('\.\.\/\.\.\/features\/GalleryTab'\)/,
  'the public gallery must own a dedicated lazy route chunk',
);
assert.doesNotMatch(
  routeManifestSource,
  /module\.GalleryTab/,
  'the gallery must not download the unrelated DeferredRoutes module',
);
assert.match(
  routeManifestSource,
  /path:\s*'\/gallery'[\s\S]*?loadGalleryModule\)/,
  'navigation intent must preload the dedicated gallery chunk',
);
assert.match(
  routeModulesSource,
  /LazyGalleryTab = React\.lazy\(loadGalleryModule\)/,
  'the Gallery view must reuse the manifest loader at module scope',
);
assert.match(
  routeModulesSource,
  /LazyArticlesTab = React\.lazy\(\(\) => loadDeferredRoutesModule\(\)[\s\S]*?module\.ArticlesTab/,
  'the Articles named export must reuse the shared DeferredRoutes loader',
);
assert.match(
  routeModulesSource,
  /LazyContestAdminPanel = React\.lazy\(\(\) => loadContestsModule\(\)[\s\S]*?module\.ContestAdminPanel/,
  'the administrator contest view must reuse the shared Contests loader',
);
assert.match(
  routeModulesSource,
  /LazyBattlegroundStrategyBuilderEmbed = React\.lazy\(\(\) => loadBattlegroundsModule\(\)[\s\S]*?module\.BattlegroundStrategyBuilderEmbed/,
  'the strategy builder must reuse the shared Battlegrounds loader',
);
assert.doesNotMatch(
  appSource,
  /const load[A-Z][A-Za-z]+Module|ROUTE_PRELOADERS/,
  'App must delegate lazy module ownership and preload policy to application routing',
);
assert.doesNotMatch(
  appSource,
  /import AuthAvatar from/,
  'authenticated avatar rendering must stay out of the anonymous startup bundle',
);
assert.match(
  appSource,
  /const LazyAuthAvatar = React\.lazy\(\(\) => import\('\.\/components\/AuthAvatar'\)\)/,
  'the authenticated avatar must load only after identity data is available',
);
assert.match(
  applicationNavigationSource,
  /window\.addEventListener\('popstate'/,
  'application routing must own Back and Forward synchronization',
);
assert.doesNotMatch(
  appSource,
  /window\.history\.(?:pushState|replaceState)|window\.addEventListener\('popstate'/,
  'App must delegate browser-history orchestration to application routing',
);
assert.match(
  gallerySource,
  /<ModalSurface[\s\S]*className="gallery-lightbox"/,
  'gallery lightboxes must reuse the shared focus-trapped modal surface',
);
assert.doesNotMatch(
  gallerySource,
  /role="dialog"/,
  'the gallery route must not own a second custom modal implementation',
);

console.log('deferred route module-boundary contracts passed');
