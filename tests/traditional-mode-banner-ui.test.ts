import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const featureFiles = [
  'StandardMatchups.tsx',
  'StandardMeta.tsx',
  'FunDecksPage.tsx',
  'ConstructedArchetypes.tsx',
  'ViciousSyndicateGold.tsx',
];

for (const file of featureFiles) {
  const source = readFileSync(new URL(`../src/features/${file}`, import.meta.url), 'utf8');
  assert.match(
    source,
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
assert.match(stylesheet, /hero-sheen/);
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

for (const protectedFile of ['App.tsx', 'routes.ts', 'parchment-theme.css']) {
  const source = readFileSync(new URL(`../src/${protectedFile}`, import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /traditional-mode-banner/,
    `${protectedFile} is protected navigation/theme scope and must stay outside the banner change`,
  );
}

console.log('Traditional mode banner UI contract passed');
