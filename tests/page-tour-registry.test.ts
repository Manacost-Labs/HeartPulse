import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { PAGE_TOURS } from '../src/features/pageTour/pageTourDefinitions.js';
import { PAGE_TOUR_ROUTES } from '../src/features/pageTour/pageTourRoutes.js';

const requiredTours = [
  'profile',
  'standard-matchups',
  'standard-meta',
  'constructed-archetypes',
  'constructed-archetype-detail',
  'standard-fun-decks',
  'standard-vicious-gold',
  'standard-cards',
  'standard-card-detail',
  'standard-patches',
  'arena-classes',
  'arena-tier-list',
  'arena-legendaries',
  'battlegrounds-heroes',
  'battlegrounds-hero-detail',
  'battlegrounds-library',
  'battlegrounds-library-detail',
  'battlegrounds-strategy-builder',
  'battlegrounds-tier-builder',
  'battlegrounds-tier-list',
];

assert.deepEqual(
  requiredTours.filter(id => !PAGE_TOURS.some(tour => tour.id === id)),
  [],
  'every key profile, statistics and filter surface must have a tour',
);
assert.equal(PAGE_TOURS.length, requiredTours.length, 'requiredTours must enumerate the complete page-tour registry');
assert.deepEqual(
  PAGE_TOUR_ROUTES.map(route => ({ id: route.id, paths: [...route.paths] })),
  PAGE_TOURS.map(tour => ({ id: tour.id, paths: [...tour.paths] })),
  'the header route list must name exactly the tours and paths of the registry',
);

const matchupTour = PAGE_TOURS.find(tour => tour.id === 'standard-matchups');
assert.ok(matchupTour && matchupTour.version >= 5, 'the VaryloUI matrix guidance must invalidate the older saved tour');
assert.match(
  matchupTour.steps.find(step => step.id === 'matrix')?.description ?? '',
  /Наведите на клетку/,
  'the matchup tour must explain that hovering a cell reads the matchup',
);

const archetypeCatalogTour = PAGE_TOURS.find(tour => tour.id === 'constructed-archetypes');
assert.ok(
  archetypeCatalogTour && archetypeCatalogTour.version >= 3,
  'the archetype catalog tour must invalidate the version without class filtering guidance',
);
assert.ok(
  archetypeCatalogTour.steps.some(step => step.target === 'archetypes-sort'),
  'the archetype catalog tour must explain its dedicated sorting control',
);
assert.ok(
  archetypeCatalogTour.steps.some(step => step.target === 'archetypes-class-filter'),
  'the archetype catalog tour must explain its class icon filter',
);

const archetypeDetailTour = PAGE_TOURS.find(tour => tour.id === 'constructed-archetype-detail');
assert.ok(archetypeDetailTour, 'the archetype detail page must have its own contextual tour');
assert.deepEqual(
  archetypeDetailTour.paths,
  ['/standard/archetypes/:format/:slug', '/standard/meta/:format/:slug'],
  'both supported archetype detail URLs must resolve to the detail tour',
);

const archetypeSource = [
  readFileSync(new URL('../src/features/ConstructedArchetypes.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/features/ConstructedArchetypeAnalysis.tsx', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/features/ArchetypeInsightSlots.tsx', import.meta.url), 'utf8'),
].join('\n');
for (const tourId of ['constructed-archetypes', 'constructed-archetype-detail']) {
  const tour = PAGE_TOURS.find(item => item.id === tourId);
  assert.ok(tour, `${tourId}: tour must exist`);
  for (const step of tour.steps) {
    assert.ok(
      archetypeSource.includes(`data-tour-id="${step.target}"`),
      `${tourId}/${step.id}: ConstructedArchetypes.tsx must render the stable ${step.target} anchor`,
    );
  }
}

const funDecksSource = readFileSync(new URL('../src/features/FunDecksPage.tsx', import.meta.url), 'utf8');
const funDecksTour = PAGE_TOURS.find(tour => tour.id === 'standard-fun-decks');
assert.ok(funDecksTour, 'the fun decks page must have its own contextual tour');
for (const step of funDecksTour.steps.filter(step => step.target !== 'subscription-paywall')) {
  assert.ok(
    funDecksSource.includes(`'${step.target}'`) || funDecksSource.includes(`"${step.target}"`),
    `standard-fun-decks/${step.id}: FunDecksPage.tsx must render the stable ${step.target} anchor`,
  );
}
assert.ok(
  funDecksTour.steps.some(step => step.target === 'subscription-paywall'),
  'the free fun decks tour must explain how to unlock the complete gallery',
);
assert.doesNotMatch(
  matchupTour.steps.find(step => step.id === 'matrix')?.description ?? '',
  /прокрутка продублирована снизу|полосы сверху и снизу/i,
  'the matchup tour must not advertise the removed lower scrollbar',
);

for (const tour of PAGE_TOURS) {
  assert.ok(tour.version >= 1, `${tour.id}: version must be positive`);
  assert.ok(tour.paths.length >= 1, `${tour.id}: at least one path is required`);
  const minimumSteps = tour.id === 'arena-classes' ? 2 : 3;
  assert.ok(tour.steps.length >= minimumSteps && tour.steps.length <= 7, `${tour.id}: tours must stay useful and concise`);
  assert.equal(new Set(tour.steps.map(step => step.id)).size, tour.steps.length, `${tour.id}: step ids must be unique`);
  assert.equal(new Set(tour.steps.map(step => step.target)).size, tour.steps.length, `${tour.id}: target anchors must be unique`);
  for (const step of tour.steps) {
    assert.match(step.target, /^[a-z][a-z0-9-]+$/, `${tour.id}/${step.id}: target must be a stable data-tour-id`);
    assert.ok(step.title.trim().length >= 4, `${tour.id}/${step.id}: title is too short`);
    assert.ok(step.description.trim().length >= 24, `${tour.id}/${step.id}: description must explain how the feature helps`);
  }
}

const builderSources = {
  'battlegrounds-strategy-builder': ['Battlegrounds.tsx'],
  // The VaryloUI tier builder renders its anchors from the builder and its controls.
  'battlegrounds-tier-builder': ['BattlegroundTierBuilder.tsx', 'BattlegroundTierBuilderControls.tsx'],
};
for (const [tourId, files] of Object.entries(builderSources)) {
  const tour = PAGE_TOURS.find(item => item.id === tourId);
  assert.ok(tour, `${tourId}: builder tour must exist`);
  const source = files.map(file => readFileSync(new URL(`../src/features/${file}`, import.meta.url), 'utf8')).join('\n');
  for (const step of tour.steps) {
    assert.ok(
      source.includes(`data-tour-id="${step.target}"`),
      `${tourId}/${step.id}: ${files.join(' or ')} must render the stable ${step.target} anchor`,
    );
  }
}

// Every step target must be rendered somewhere in the application source.
function sourceFiles(directory: URL): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'vendor' || entry.name === 'pageTour') return [];
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.(tsx|ts)$/.test(entry.name) ? [readFileSync(child, 'utf8')] : [];
  });
}
const applicationSource = sourceFiles(new URL('../src/', import.meta.url)).join('\n');
for (const tour of PAGE_TOURS) {
  for (const step of tour.steps) {
    if (step.target === 'subscription-paywall') continue;
    assert.ok(
      new RegExp(`["'\`]${step.target}["'\`]`).test(applicationSource),
      `${tour.id}/${step.id}: no source file renders the ${step.target} anchor`,
    );
  }
}

console.log(`page tour registry contracts passed (${PAGE_TOURS.length} tours)`);
