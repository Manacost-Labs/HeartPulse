import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const gallerySource = readFileSync(new URL('../src/features/GalleryTab.tsx', import.meta.url), 'utf8');
const contestsSource = readFileSync(new URL('../src/features/Contests.tsx', import.meta.url), 'utf8');

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
assert.doesNotMatch(
  contestsSource,
  /import \{ ContestAdminAnalytics \} from '\.\/ContestAdminAnalytics';/,
  'analytics must not increase the initial admin bundle for every section',
);
assert.match(
  contestsSource,
  /React\.lazy\([\s\S]*?import\('\.\/ContestAdminAnalytics'\)/,
  'analytics must load only when its admin section is opened',
);

console.log('deferred route module-boundary contracts passed');
