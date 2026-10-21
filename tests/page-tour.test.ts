import assert from 'node:assert/strict';
import {
  filterAvailableTourSteps,
  nextTourStepIndex,
  normalizeTourPath,
  pageTourStorageKey,
  previousTourStepIndex,
  resolvePageTour,
} from '../src/features/pageTour/pageTourModel.js';

const profileTour = {
  id: 'profile',
  version: 2,
  paths: ['/profile'],
  steps: [],
};
const cardsTour = {
  id: 'standard-cards',
  version: 4,
  paths: ['/standard/cards'],
  steps: [],
};
const cardDetailTour = {
  id: 'standard-card-detail',
  version: 3,
  paths: ['/standard/cards/:format/:cardId'],
  steps: [],
};

assert.equal(normalizeTourPath('/standard/cards/?sort=latest#filters'), '/standard/cards');
assert.equal(
  normalizeTourPath('https://arena.hs-manacost.ru/standard/cards/standard/TIME_704/?variant=golden'),
  '/standard/cards/standard/TIME_704',
  'absolute URLs and trailing slashes must normalize to a stable pathname',
);
assert.equal(normalizeTourPath('profile/'), '/profile');
assert.equal(normalizeTourPath('/'), '/');

const tourRegistry = [profileTour, cardsTour, cardDetailTour];
assert.equal(resolvePageTour('/profile?tab=subscription', tourRegistry)?.id, 'profile');
assert.equal(
  resolvePageTour('/standard/cards/standard/TIME_704', tourRegistry)?.id,
  'standard-card-detail',
  'a dynamic detail route must resolve when no exact pathname is registered',
);
assert.equal(
  resolvePageTour('/standard/cards/wild/EX1_001/', tourRegistry)?.id,
  'standard-card-detail',
  'the same detail tour must support every format and card id',
);
assert.equal(resolvePageTour('/unknown', tourRegistry), null);

const candidateSteps = [
  { id: 'search', target: 'cards-search', audience: 'all' },
  { id: 'statistics', target: 'cards-statistics', audience: 'diamond' },
  { id: 'missing-filter', target: 'cards-filter-removed', audience: 'all' },
  { id: 'view-switcher', target: 'cards-view-switcher', audience: 'all' },
];
const visibleSteps = filterAvailableTourSteps(candidateSteps, {
  isEligible: step => step.audience === 'all',
  hasTarget: target => target !== 'cards-filter-removed',
});
assert.deepEqual(
  visibleSteps.map(step => step.id),
  ['search', 'view-switcher'],
  'ineligible and missing-target steps must be removed without reordering the remaining tour',
);
assert.deepEqual(
  candidateSteps.map(step => step.id),
  ['search', 'statistics', 'missing-filter', 'view-switcher'],
  'filtering must not mutate the registered tour definition',
);

assert.equal(
  pageTourStorageKey(cardsTour),
  'manacost:page-tour:standard-cards:v4',
  'the persistence key must change whenever the tour version changes',
);
assert.notEqual(pageTourStorageKey({ ...cardsTour, version: 5 }), pageTourStorageKey(cardsTour));

assert.equal(nextTourStepIndex(1, 5), 2);
assert.equal(nextTourStepIndex(4, 5), 4, 'next must clamp at the final step');
assert.equal(nextTourStepIndex(99, 5), 4, 'invalid high indexes must clamp to the final step');
assert.equal(nextTourStepIndex(-3, 5), 1, 'next must advance from the clamped first step');
assert.equal(nextTourStepIndex(0, 0), 0, 'an empty tour must keep a safe zero index');
assert.equal(previousTourStepIndex(3, 5), 2);
assert.equal(previousTourStepIndex(0, 5), 0, 'previous must clamp at the first step');
assert.equal(previousTourStepIndex(-3, 5), 0, 'invalid low indexes must clamp to the first step');
assert.equal(previousTourStepIndex(99, 5), 3, 'previous must move from the clamped final step');
assert.equal(previousTourStepIndex(0, 0), 0, 'an empty tour must keep a safe zero index');

console.log('page tour model contracts passed');
