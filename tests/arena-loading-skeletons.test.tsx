import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';

// Node checks markup and copy; CSS geometry is verified by the paired browser
// stories (Tier list / Legendaries measured loading geometry, Arena classes).
const styles = registerHooks({ resolve(specifier, context, nextResolve) {
  return specifier.endsWith('.css')
    ? { url: 'data:text/javascript,export{}', shortCircuit: true }
    : nextResolve(specifier, context);
} });
const { TierListSkeleton } = await import('../src/features/TierListSkeleton');
const { LegendariesSkeleton } = await import('../src/features/LegendariesSkeleton');
const { ArenaClassesSkeleton } = await import('../src/modules/arenaClasses/public');
styles.deregister();

function assertPlaceholder(markup: string, label: string) {
  assert.equal(markup.match(/role="status"/g)?.length, 1, `${label}: one status per loading region`);
  assert.match(markup, new RegExp(`<strong>${label}</strong>`), `${label}: visitor status label`);
  assert.doesNotMatch(markup, /aria-busy/, `${label}: the status is never inside a busy region`);
  assert.doesNotMatch(markup, /<(?:a|button|input|select|h[1-6])\b/, `${label}: no links, controls or headings`);
  assert.equal(markup.replace(/<[^>]*>/g, '').trim(), label, `${label}: no visible text, names or numbers besides the status`);
  assert.doesNotMatch(markup, /class="(?:[^"]* )?skeleton[ "]/, `${label}: no legacy skeleton blocks`);
}

const tierList = renderToStaticMarkup(<TierListSkeleton />);
assertPlaceholder(tierList, 'Загружаем тир-лист');
for (const real of ['arena-tier-controls', 'arena-tier-classes', 'arena-tier-search', 'tierlist-groups', 'tierlist-group-heading', 'tierlist-card-grid']) {
  assert.match(tierList, new RegExp(`class="[^"]*\\b${real}\\b`), `tier list skeleton reuses .${real}`);
}
assert.equal(tierList.match(/tierlist-skeleton-class"/g)?.length, 13, 'all cards, eleven classes and neutral cards');
assert.equal(tierList.match(/tierlist-skeleton-card"/g)?.length, 24);
assert.match(tierList, /tierlist-skeleton-view/);
assert.doesNotMatch(renderToStaticMarkup(<TierListSkeleton canUseTable={false} />), /tierlist-skeleton-view/,
  'sources without the HSReplay table have no view toggle');

const legendaries = renderToStaticMarkup(<LegendariesSkeleton />);
assertPlaceholder(legendaries, 'Загружаем легендарные группы');
assert.match(legendaries, /class="loading-surface__blocks legendary-groups-grid /);
assert.equal(legendaries.match(/class="legendary-group-card /g)?.length, 6);
assert.equal(legendaries.match(/legendary-skeleton-metric /g)?.length, 24, 'four metrics per group');

const classes = renderToStaticMarkup(<ArenaClassesSkeleton />);
assertPlaceholder(classes, 'Загружаем статистику классов');
assert.equal(classes.match(/class="arena-class-row /g)?.length, 11);
assert.match(classes, /<div class="arena-classes-board arena-classes-loading [^"]*">/);
assert.match(classes, /class="arena-classes-chart arena-classes-chart--loading"/, 'the closed chart disclosure keeps its place');

// Visitors never see build instructions or internal tooling names.
const routes = readFileSync(new URL('../src/features/DeferredRoutes.tsx', import.meta.url), 'utf8');
assert.doesNotMatch(routes, /npm run scrape|scraper ещё|Загрузка тир-листа|animate-spin/);
assert.doesNotMatch(routes, /const Skeleton\b|className="skeleton[ "]/, 'the legacy skeleton block is gone');

console.log('arena loading skeleton markup contracts passed');
