import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGE_TOURS } from '../src/features/pageTour/pageTourDefinitions.js';

const requiredTours = [
  'profile',
  'standard-matchups',
  'standard-meta',
  'standard-vicious-gold',
  'standard-cards',
  'standard-card-detail',
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

for (const tour of PAGE_TOURS) {
  assert.ok(tour.version >= 1, `${tour.id}: version must be positive`);
  assert.ok(tour.paths.length >= 1, `${tour.id}: at least one path is required`);
  assert.ok(tour.steps.length >= 3 && tour.steps.length <= 7, `${tour.id}: tours must stay useful and concise`);
  assert.equal(new Set(tour.steps.map(step => step.id)).size, tour.steps.length, `${tour.id}: step ids must be unique`);
  assert.equal(new Set(tour.steps.map(step => step.target)).size, tour.steps.length, `${tour.id}: target anchors must be unique`);
  for (const step of tour.steps) {
    assert.match(step.target, /^[a-z][a-z0-9-]+$/, `${tour.id}/${step.id}: target must be a stable data-tour-id`);
    assert.ok(step.title.trim().length >= 4, `${tour.id}/${step.id}: title is too short`);
    assert.ok(step.description.trim().length >= 24, `${tour.id}/${step.id}: description must explain how the feature helps`);
  }
}

const battlegroundsSource = readFileSync(new URL('../src/features/Battlegrounds.tsx', import.meta.url), 'utf8');
for (const tourId of ['battlegrounds-strategy-builder', 'battlegrounds-tier-builder']) {
  const tour = PAGE_TOURS.find(item => item.id === tourId);
  assert.ok(tour, `${tourId}: builder tour must exist`);
  for (const step of tour.steps) {
    assert.ok(
      battlegroundsSource.includes(`data-tour-id="${step.target}"`),
      `${tourId}/${step.id}: Battlegrounds.tsx must render the stable ${step.target} anchor`,
    );
  }
}

console.log(`page tour registry contracts passed (${PAGE_TOURS.length} tours)`);
