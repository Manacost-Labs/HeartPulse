import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const paywallSource = readFileSync(new URL('../src/components/PaywallGate.tsx', import.meta.url), 'utf8');
const metaSource = readFileSync(new URL('../src/features/StandardMeta.tsx', import.meta.url), 'utf8');
const archetypesSource = readFileSync(new URL('../src/features/ConstructedArchetypes.tsx', import.meta.url), 'utf8');
const funDecksSource = readFileSync(new URL('../src/features/FunDecksPage.tsx', import.meta.url), 'utf8');

assert.match(metaSource, /hasFullAccess\s*\?\s*'\/api\/standard-meta'/);
assert.match(metaSource, /'\/api\/standard-meta\/teaser'/);
assert.match(metaSource, /surface="meta"/);
assert.match(metaSource, /filteredItems\.slice\(0,\s*3\)/);

assert.match(archetypesSource, /hasFullAccess\s*\?\s*'\/api\/constructed-archetypes'/);
assert.match(archetypesSource, /'\/api\/constructed-archetypes\/teaser'/);
assert.match(archetypesSource, /surface="archetype"/);
assert.match(archetypesSource, /featuredBuild/);

assert.match(funDecksSource, /FREE_PREVIEW_COUNT\s*=\s*3/);
assert.match(funDecksSource, /hasFullAccess/);
assert.match(funDecksSource, /providerButtons/);
assert.match(funDecksSource, /data-tour-id=\{tourAnchor \? 'fun-decks-deck-list'/);

assert.match(paywallSource, /presentation === 'inline'/);
assert.match(paywallSource, /Открыть всю мету/);
assert.match(paywallSource, /Открыть статистику архетипа/);
assert.match(paywallSource, /Открыть через Boosty/);
assert.match(paywallSource, /Открыть через Telegram/);

// Guests keep the page with a teaser: each page client passes the access decision down.
for (const pageClient of ['StandardMetaPageClient', 'ConstructedArchetypesPageClient', 'FunDecksPageClient']) {
  const source = readFileSync(new URL(`../apps/public-web/ui/${pageClient}.tsx`, import.meta.url), 'utf8');
  assert.match(source, /hasFullAccess=\{allowed\}/, `${pageClient} must pass the access decision to its page`);
  assert.doesNotMatch(source, /PaywallGate/, `${pageClient} must not replace the page with a full paywall`);
}

// A guest's locked preview keeps its loaders still. The rule must stay
// unlayered and outside media queries: inside `@layer` it would lose to the
// `@layer utilities` shimmer, and inline animation styles would escape it.
const paywallCss = readFileSync(new URL('../src/components/PaywallGate.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const freezeRule = /\.arena-paywall__preview :is\(\.skeleton, \[class\*='animate-'\]\) \{\s*animation: none;\s*\}/;
assert.ok(freezeRule.test(paywallCss), 'PaywallGate.css must stop the loaders of a locked preview');
const beforeFreeze = paywallCss.slice(0, paywallCss.search(freezeRule));
assert.equal((beforeFreeze.match(/\{/g) ?? []).length, (beforeFreeze.match(/\}/g) ?? []).length,
  'the locked-preview rule must be a top-level rule');
assert.ok(!paywallCss.includes('@layer'), 'PaywallGate.css must stay unlayered');
const deferredRoutesSource = readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8');
assert.ok(!/animation: 'spin (?:1s|0\.7s) linear infinite/.test(deferredRoutesSource),
  'the tier-list loader inside a locked preview must use classes, not inline animation styles');

console.log('soft paywall UI contract tests passed');
