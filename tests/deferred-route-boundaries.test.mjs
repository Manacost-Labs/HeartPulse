import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const profileButtonSource = readFileSync(new URL('../src/app/shell/HeaderProfileButton.tsx', import.meta.url), 'utf8');
const routeManifestSource = readFileSync(new URL('../src/app/routing/routeManifest.ts', import.meta.url), 'utf8');
const routeModulesSource = readFileSync(new URL('../src/app/routing/routeModules.tsx', import.meta.url), 'utf8');
const applicationNavigationSource = readFileSync(
  new URL('../src/app/routing/useApplicationNavigation.ts', import.meta.url),
  'utf8',
);
const authAvatarSource = readFileSync(new URL('../src/modules/identity/ui/AuthAvatar.tsx', import.meta.url), 'utf8');
const authAvatarStyles = readFileSync(new URL('../src/modules/identity/ui/AuthAvatar.css', import.meta.url), 'utf8');
const initialStyles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const identityPublicStyles = readFileSync(new URL('../src/modules/identity/public.css', import.meta.url), 'utf8');
const profileIdentityStyles = readFileSync(new URL('../src/modules/identity/ui/ProfileIdentityHero.css', import.meta.url), 'utf8');
const identityProfileStyles = readFileSync(new URL('../src/modules/identity/ui/IdentityProfile.css', import.meta.url), 'utf8');
const deferredStyles = readFileSync(new URL('../src/features/DeferredRoutes.css', import.meta.url), 'utf8');
const gallerySource = readFileSync(new URL('../src/features/GalleryTab.tsx', import.meta.url), 'utf8');
const contestsSource = readFileSync(new URL('../src/features/Contests.tsx', import.meta.url), 'utf8');

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
  /routeId === 'login'\) return loadLoginPanel/,
  'login intent must preload the identity-owned form instead of DeferredRoutes',
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
assert.match(
  appSource,
  /import\s*\{[^}]*\bHeaderProfileButton\b[^}]*\}\s*from '\.\/app\/shell\/HeaderProfileButton'/,
  'the primary authenticated navigation must render its small avatar without an extra request or fallback flash',
);
assert.doesNotMatch(
  `${appSource}\n${profileButtonSource}`,
  /LazyAuthAvatar|import\(['"][^'"]*AuthAvatar['"]\)/,
  'the primary authenticated navigation must not introduce a granular avatar chunk',
);
assert.match(profileButtonSource, /import\s*\{[^}]*\bAuthAvatar\b[^}]*\}\s*from '\.\.\/\.\.\/modules\/identity\/public'/,
  'the shared profile presentation keeps its eager avatar in both application shells');
assert.doesNotMatch(authAvatarSource, /import ['"].*\.css['"]/,
  'the browser-independent application shell import must not execute a CSS loader in Node');
assert.match(initialStyles, /@import "\.\/modules\/identity\/public\.css"/,
  'the initial stylesheet must consume the identity public style contract');
assert.match(identityPublicStyles, /@import "\.\/ui\/AuthAvatar\.css"/,
  'the identity public style contract must own the eager avatar presentation');
assert.match(authAvatarStyles, /--auth-avatar-size/,
  'avatar CSS must retain its size-driven presentation contract');
assert.doesNotMatch(
  `${profileIdentityStyles}\n${deferredStyles}`,
  /profile-hero__body\s*>\s*(?:span|\.auth-avatar):first-child/,
  'legacy profile selectors must not override the eager avatar baseline',
);
assert.match(identityProfileStyles, /\.profile-workspace[\s\S]*\.profile-subscription-panel/,
  'identity must own the authenticated profile layout and subscription presentation');
assert.doesNotMatch(deferredStyles, /\.profile-workspace|\.login-page/,
  'DeferredRoutes CSS must not regain identity-owned profile or login selectors');
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
assert.doesNotMatch(contestsSource, /ContestAdminAnalytics/, 'removed analytics must not remain connected to the admin workspace');
assert.doesNotMatch(contestsSource, /ContestAdminArenaSynergies/, 'removed Arena synergies must not remain connected to the admin workspace');
assert.doesNotMatch(contestsSource, /id: 'analytics'/, 'removed analytics must not remain in admin navigation');
assert.doesNotMatch(contestsSource, /id: 'arena-synergies'/, 'removed Arena synergies must not remain in admin navigation');

console.log('deferred route module-boundary contracts passed');
