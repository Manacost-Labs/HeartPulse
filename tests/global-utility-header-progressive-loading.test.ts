import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headerSource = readFileSync(new URL('../src/components/GlobalUtilityHeader.tsx', import.meta.url), 'utf8');
const launcherSource = readFileSync(new URL('../src/features/pageTour/usePageTourLauncher.tsx', import.meta.url), 'utf8');
const autoStartSource = readFileSync(new URL('../src/features/pageTour/pageTourAutoStart.ts', import.meta.url), 'utf8');

for (const [name, source] of [['header', headerSource], ['tour launcher', launcherSource], ['first-visit rules', autoStartSource]]) {
  assert.doesNotMatch(
    source,
    /^import (?!type )[^;]*\/(pageTourDefinitions|PageTour|PageTourMedia|pageTourAutoStart)['"];/m,
    `the ${name} must not bundle the tour copy or the tour UI; it knows only the route list`,
  );
}
assert.match(
  launcherSource,
  /void import\('\.\/pageTourAutoStart'\)/,
  'the first-visit rules are a lazy chunk, not part of every page',
);
assert.match(
  autoStartSource,
  /whenPageIdle\(\(\) => \{\s*void import\('\.\/pageTourDefinitions'\)/,
  'the first-visit tour loads its definitions only after the page is loaded and idle',
);
assert.match(
  autoStartSource,
  /if \(!shouldAutoStartPageTour\(visitor\)\) return \(\) => undefined;[\s\S]*whenPageIdle/,
  'crawlers, automated browsers and opted-out visitors are rejected before any tour chunk loads',
);
assert.match(
  launcherSource,
  /lazy\(\(\) => import\('\.\/PageTour'\)\)/,
  'the tour UI stays a lazy chunk',
);
assert.match(
  launcherSource,
  /lazy\(\(\) => import\('\.\/PageTourInvite'\)\)/,
  'the first-visit offer is a lazy chunk too',
);
assert.match(
  launcherSource,
  /invite: storageKey => setInvite/,
  'a first visit only offers the tour; the tour itself opens from the offer or the header button',
);

console.log('global utility-header progressive-loading contracts passed');
