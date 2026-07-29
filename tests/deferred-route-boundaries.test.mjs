import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(
  appSource,
  /const loadGalleryModule = \(\) => import\('\.\/features\/GalleryTab'\)/,
  'the public gallery must own a dedicated lazy route chunk',
);
assert.doesNotMatch(
  appSource,
  /module\.GalleryTab/,
  'the gallery must not download the unrelated DeferredRoutes module',
);
assert.match(
  appSource,
  /gallery:\s*loadGalleryModule/,
  'navigation intent must preload the dedicated gallery chunk',
);

console.log('deferred route module-boundary contracts passed');
