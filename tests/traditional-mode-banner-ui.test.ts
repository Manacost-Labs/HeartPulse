import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Vicious Gold renders its banner through one component shared by its access, loading and statistics states.
const featureFiles: Array<[page: string, banner?: { file: string; component: string }]> = [
  ['StandardMatchups.tsx'],
  ['StandardMeta.tsx'],
  ['FunDecksPage.tsx'],
  ['ConstructedArchetypes.tsx'],
  ['ViciousSyndicateGold.tsx', { file: 'viciousGold/ViciousGoldBanner.tsx', component: 'ViciousGoldBanner' }],
];

for (const [file, banner] of featureFiles) {
  const source = readFileSync(new URL(`../src/features/${file}`, import.meta.url), 'utf8');
  if (banner) assert.match(source, new RegExp(`<${banner.component}[\\s>]`), `${file} must render ${banner.component}`);
  assert.match(
    banner ? readFileSync(new URL(`../src/features/${banner.file}`, import.meta.url), 'utf8') : source,
    /className="traditional-mode-banner"/,
    `${file} must use the shared traditional-mode banner contract`,
  );
  assert.match(
    source,
    /className="traditional-mode-banner__summary"/,
    `${file} must expose a compact two-metric summary`,
  );
}

const stylesheet = readFileSync(
  new URL('../src/features/TraditionalModeBanner.css', import.meta.url),
  'utf8',
);
assert.match(stylesheet, /profile-hero-hth\.webp/);
assert.match(stylesheet, /main-page-rail-border\.png/);
assert.match(stylesheet, /var\(--site-page-hero-min-height\)/);
assert.doesNotMatch(stylesheet, /animation[^;{}]*\binfinite\b/, 'page banners must not run endless animations on idle pages');
assert.doesNotMatch(stylesheet, /will-change/, 'page banners keep no permanently promoted layer');
assert.match(stylesheet, /@media \(max-width: 720px\)/);
assert.match(stylesheet, /prefers-reduced-motion/);

const tokenStylesheet = readFileSync(
  new URL('../src/styles/tokens.css', import.meta.url),
  'utf8',
);
assert.match(
  tokenStylesheet,
  /:root\s*\{[\s\S]*--site-page-hero-min-height:/,
  'the shared page-hero dimensions must load globally for editorial routes too',
);

for (const protectedFile of ['app/shell/PublicPageShell.tsx', 'app/routing/navigationDefinitions.ts', 'parchment-theme.css']) {
  const source = readFileSync(new URL(`../src/${protectedFile}`, import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /traditional-mode-banner/,
    `${protectedFile} is protected navigation/theme scope and must stay outside the banner change`,
  );
}

console.log('Traditional mode banner UI contract passed');
