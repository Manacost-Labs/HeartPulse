import assert from 'node:assert/strict';
import {
  parsePageTourStepProgress,
  isTourTargetVisible,
  parsePageTourProgress,
  placeTourPopover,
  restorePageTourStepIndex,
  resolvePageTour,
  scheduleTourScrollCorrection,
  shouldWaitForRestoredTourStep,
} from '../src/features/pageTour/pageTourModel.js';
import {
  isTourStepEligible,
  type PageTourAccess,
  type PageTourStep,
} from '../src/features/pageTour/pageTourDefinitions.js';

const genericStandardTour = {
  id: 'generic-standard-detail',
  version: 1,
  paths: ['/standard/:section/:item'],
};
const cardsListTour = {
  id: 'standard-cards',
  version: 1,
  paths: ['/standard/cards', '/standard/cards/:format'],
};
const cardsDetailTour = {
  id: 'standard-card-detail',
  version: 1,
  paths: ['/standard/cards/:format/:cardId'],
};
const specificCardTour = {
  id: 'specific-card-detail',
  version: 1,
  paths: ['/standard/cards/:cardId'],
};

assert.equal(
  resolvePageTour('/standard/cards', [genericStandardTour, cardsDetailTour, cardsListTour])?.id,
  'standard-cards',
  'an exact route must win even when it is registered after dynamic routes',
);
assert.equal(
  resolvePageTour('/standard/cards/wild', [genericStandardTour, specificCardTour])?.id,
  'specific-card-detail',
  'among matching dynamic routes, the pattern with more static segments must win regardless of registry order',
);
assert.equal(
  resolvePageTour('/standard/cards/wild/EX1_001', [cardsListTour, cardsDetailTour])?.id,
  'standard-card-detail',
  'a card detail URL must not be captured by the format-level list tour',
);
assert.equal(
  resolvePageTour('/standard/cards/wild/EX1_001/extra', [cardsListTour, cardsDetailTour]),
  null,
  'dynamic patterns must match the whole pathname, not only a prefix',
);

assert.deepEqual(
  parsePageTourProgress('{"status":"in-progress","stepIndex":2}', 5),
  { status: 'in-progress', stepIndex: 2 },
  'valid in-progress state should resume at the stored step',
);
assert.deepEqual(
  parsePageTourProgress('{"status":"dismissed","stepIndex":99,"ignored":"value"}', 4),
  { status: 'dismissed', stepIndex: 3 },
  'persisted indexes must clamp and unknown fields must not leak into runtime state',
);
assert.deepEqual(
  parsePageTourProgress('{"status":"completed","stepIndex":-8}', 6),
  { status: 'completed', stepIndex: 0 },
  'negative indexes must sanitize to the first step',
);
assert.deepEqual(
  parsePageTourProgress('{"status":"in-progress","stepIndex":2.9}', 6),
  { status: 'in-progress', stepIndex: 2 },
  'fractional indexes must be truncated before restoring progress',
);
assert.deepEqual(
  parsePageTourProgress('{"status":"in-progress","stepIndex":12}', 0),
  { status: 'in-progress', stepIndex: 0 },
  'an empty tour must keep a safe zero index',
);
for (const unsafeProgress of [
  null,
  '',
  'not-json',
  'null',
  '[]',
  '{"status":"unknown","stepIndex":1}',
  '{"status":"in-progress","stepIndex":"2"}',
  '{"status":"in-progress"}',
]) {
  assert.equal(
    parsePageTourProgress(unsafeProgress, 5),
    null,
    `malformed progress must be ignored: ${String(unsafeProgress)}`,
  );
}

assert.deepEqual(
  parsePageTourStepProgress('{"status":"dismissed","stepId":"filters"}'),
  { status: 'dismissed', stepId: 'filters' },
  'runtime progress must preserve the stable step id used by conditional tours',
);
assert.equal(
  restorePageTourStepIndex(
    parsePageTourStepProgress('{"status":"in-progress","stepId":"filters"}'),
    ['format', 'search', 'filters', 'view'],
  ),
  2,
  'an interrupted tour must resume from its saved step instead of being overwritten by step zero',
);
assert.equal(
  restorePageTourStepIndex(
    parsePageTourStepProgress('{"status":"completed","stepId":"filters"}'),
    ['format', 'search', 'filters', 'view'],
  ),
  0,
  'a completed tour must start from the beginning when explicitly opened again',
);
assert.equal(
  restorePageTourStepIndex(
    parsePageTourStepProgress('{"status":"dismissed","stepId":"removed-step"}'),
    ['format', 'search', 'filters', 'view'],
  ),
  0,
  'a removed conditional step must safely fall back to the first available step',
);
assert.equal(
  shouldWaitForRestoredTourStep(
    { status: 'dismissed', stepId: 'statistics' },
    ['summary', 'statistics', 'details'],
    ['summary'],
  ),
  true,
  'a saved eligible step must remain pending while its asynchronous target is still loading',
);
assert.equal(
  shouldWaitForRestoredTourStep(
    { status: 'dismissed', stepId: 'statistics' },
    ['summary', 'statistics', 'details'],
    ['summary', 'statistics'],
  ),
  false,
  'restoration may continue as soon as the saved target appears',
);
assert.equal(
  shouldWaitForRestoredTourStep(
    { status: 'dismissed', stepId: 'admin-only' },
    ['summary', 'details'],
    ['summary'],
  ),
  false,
  'a step that is no longer eligible for this user must not delay the tour',
);
assert.equal(
  shouldWaitForRestoredTourStep(
    { status: 'completed', stepId: 'statistics' },
    ['summary', 'statistics'],
    ['summary'],
  ),
  false,
  'an explicitly restarted completed tour must begin immediately',
);

{
  let nextTimerId = 0;
  const pendingTimers = new Map<number, () => void>();
  let correctionRuns = 0;
  const cancelCorrection = scheduleTourScrollCorrection(
    () => { correctionRuns += 1; },
    260,
    {
      setTimeout(callback) {
        nextTimerId += 1;
        pendingTimers.set(nextTimerId, callback);
        return nextTimerId;
      },
      clearTimeout(timerId) {
        pendingTimers.delete(timerId);
      },
    },
  );
  cancelCorrection();
  for (const callback of pendingTimers.values()) callback();
  assert.equal(correctionRuns, 0, 'leaving a step must cancel its delayed mobile scroll correction');
}

const mobileViewport = { width: 390, height: 844 };
const mobileInsets = { top: 68, right: 0, bottom: 286, left: 0 };
assert.equal(
  isTourTargetVisible({
    targetRect: { left: 24, top: 112, right: 360, bottom: 216, width: 336, height: 104 },
    viewport: mobileViewport,
    insets: mobileInsets,
    minimumVisibleRatio: 0.6,
  }),
  true,
  'a target inside the usable corridor above the mobile sheet is visible',
);
assert.equal(
  isTourTargetVisible({
    targetRect: { left: 24, top: 610, right: 360, bottom: 720, width: 336, height: 110 },
    viewport: mobileViewport,
    insets: mobileInsets,
    minimumVisibleRatio: 0.6,
  }),
  false,
  'a target covered by the mobile sheet is not visible',
);
assert.equal(
  isTourTargetVisible({
    targetRect: { left: -240, top: 110, right: 80, bottom: 210, width: 320, height: 100 },
    viewport: mobileViewport,
    insets: mobileInsets,
    minimumVisibleRatio: 0.6,
  }),
  false,
  'a mostly horizontal off-screen target must be scrolled into view',
);
assert.equal(
  isTourTargetVisible({
    targetRect: { left: 80, top: 140, right: 80, bottom: 200, width: 0, height: 60 },
    viewport: mobileViewport,
    insets: mobileInsets,
    minimumVisibleRatio: 0.6,
  }),
  false,
  'collapsed or detached targets must not be treated as visible',
);

const smallMobilePopover = placeTourPopover({
  targetRect: { left: 250, top: 18, right: 306, bottom: 58, width: 56, height: 40 },
  popoverSize: { width: 284, height: 330 },
  viewport: { width: 320, height: 480 },
  preferredPlacement: 'right',
  padding: 12,
  mobile: true,
});
assert.deepEqual(
  smallMobilePopover,
  { left: 18, top: 138, placement: 'bottom-sheet' },
  'a 320px mobile viewport should use a centered, bottom-safe sheet',
);

const zoomedLandscapePopover = placeTourPopover({
  targetRect: { left: 500, top: 250, right: 570, bottom: 300, width: 70, height: 50 },
  popoverSize: { width: 270, height: 190 },
  viewport: { width: 568, height: 320 },
  preferredPlacement: 'bottom',
  gap: 10,
  padding: 10,
  mobile: false,
});
assert.ok(zoomedLandscapePopover.left >= 10);
assert.ok(zoomedLandscapePopover.top >= 10);
assert.ok(zoomedLandscapePopover.left + 270 <= 558, 'zoomed desktop placement must stay within the visual viewport width');
assert.ok(zoomedLandscapePopover.top + 190 <= 310, 'zoomed desktop placement must stay within the visual viewport height');
assert.notEqual(zoomedLandscapePopover.placement, 'bottom', 'placement must flip when a short viewport has no room below');

const baseAccess: PageTourAccess = {
  authenticated: false,
  admin: false,
  standard: false,
  arena: false,
  battlegrounds: false,
};
const step = (audience: PageTourStep['audience']): PageTourStep => ({
  id: audience ?? 'all',
  target: `target-${audience ?? 'all'}`,
  title: 'Тестовый шаг',
  description: 'Достаточно подробное описание тестового шага для проверки доступа.',
  audience,
});

assert.equal(isTourStepEligible(step('all'), baseAccess), true);
assert.equal(isTourStepEligible(step('authenticated'), baseAccess), false);
assert.equal(isTourStepEligible(step('non-admin'), baseAccess), false);
assert.equal(isTourStepEligible(step('non-admin'), { ...baseAccess, authenticated: true }), true);
assert.equal(isTourStepEligible(step('admin'), baseAccess), false);
assert.equal(isTourStepEligible(step('standard'), { ...baseAccess, standard: true }), true);
assert.equal(isTourStepEligible(step('arena'), { ...baseAccess, arena: true }), true);
assert.equal(isTourStepEligible(step('battlegrounds'), { ...baseAccess, battlegrounds: true }), true);
for (const audience of ['standard', 'arena', 'battlegrounds', 'admin'] as const) {
  assert.equal(
    isTourStepEligible(step(audience), { ...baseAccess, authenticated: true, admin: true }),
    true,
    `administrators must pass ${audience} tour eligibility`,
  );
}
assert.equal(
  isTourStepEligible(step('non-admin'), { ...baseAccess, authenticated: true, admin: true }),
  false,
  'admin users must not see subscriber-only setup instructions',
);

console.log('page tour engine contracts passed');
