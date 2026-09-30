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

console.log('soft paywall UI contract tests passed');
