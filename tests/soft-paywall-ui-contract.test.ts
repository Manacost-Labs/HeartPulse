import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const paywallSource = readFileSync(new URL('../src/components/PaywallGate.tsx', import.meta.url), 'utf8');
const metaSource = readFileSync(new URL('../src/features/StandardMeta.tsx', import.meta.url), 'utf8');
const archetypesSource = readFileSync(new URL('../src/features/ConstructedArchetypes.tsx', import.meta.url), 'utf8');

assert.match(metaSource, /hasFullAccess\s*\?\s*'\/api\/standard-meta'/);
assert.match(metaSource, /'\/api\/standard-meta\/teaser'/);
assert.match(metaSource, /surface="meta"/);
assert.match(metaSource, /filteredItems\.slice\(0,\s*3\)/);

assert.match(archetypesSource, /hasFullAccess\s*\?\s*'\/api\/constructed-archetypes'/);
assert.match(archetypesSource, /'\/api\/constructed-archetypes\/teaser'/);
assert.match(archetypesSource, /surface="archetype"/);
assert.match(archetypesSource, /featuredBuild/);

assert.match(paywallSource, /presentation === 'inline'/);
assert.match(paywallSource, /Открыть всю мету/);
assert.match(paywallSource, /Открыть статистику архетипа/);

assert.match(appSource, /hasFullAccess=\{standardAccessGranted\}/);
assert.match(appSource, /STANDARD_SOFT_PAYWALL_TABS\.has\(activeTab\)/);

console.log('soft paywall UI contract tests passed');
