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

// While access is checked, full-page gates reserve the gate's height through
// one shared placeholder, never a bare line that the gate then pushes down.
const pendingSource = readFileSync(new URL('../src/components/PaywallPending.tsx', import.meta.url), 'utf8');
assert.match(pendingSource, /export default function PaywallPending\b/);
assert.match(pendingSource, /className="arena-paywall-pending" role="status"/);
assert.match(pendingSource, /aria-busy="true"/);
assert.match(pendingSource, /import '\.\/PaywallGate\.css';/, 'the placeholder brings its own reserved height');
assert.ok(/\.arena-paywall-pending,\s*\.arena-paid-view \{\s*min-height: var\(--subscription-gate-min-height\);\s*\}/.test(paywallCss),
  'the placeholder and a mounting paid view must reserve the gate height token');
assert.match(readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8'),
  /--subscription-gate-min-height: 760px;/);
for (const pageClient of ['BattlegroundHeroesPageClient', 'BattlegroundHeroDetailPageClient', 'BattlegroundLibraryPageClient',
  'BattlegroundLibraryDetailPageClient', 'BattlegroundTierListPageClient', 'BattlegroundTierBuilderPageClient',
  'BattlegroundStrategiesPageClient', 'GuidesArchivePageClient', 'GuideArchiveDetailPageClient']) {
  const source = readFileSync(new URL(`../apps/public-web/ui/${pageClient}.tsx`, import.meta.url), 'utf8');
  assert.match(source, /access\.checking\s*\?\s*<PaywallPending\b/, `${pageClient} must reserve the gate while access is checked`);
  assert.ok(!/<p[^>]*aria-busy/.test(source), `${pageClient} must not render a bare pending line`);
}

console.log('soft paywall UI contract tests passed');
