import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const routeManifestSource = readFileSync(new URL('../src/app/routing/routeManifest.tsx', import.meta.url), 'utf8');
const routeModulesSource = readFileSync(new URL('../src/app/routing/routeModules.tsx', import.meta.url), 'utf8');
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
  /slug:\s*'\/gallery'[\s\S]*?loadGalleryModule\)/,
  'navigation intent must preload the dedicated gallery chunk',
);
assert.doesNotMatch(
  appSource,
  /const load[A-Z][A-Za-z]+Module|ROUTE_PRELOADERS/,
  'App must delegate lazy module ownership and preload policy to application routing',
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
