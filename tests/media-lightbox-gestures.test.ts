import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import {
  REST_VIEW,
  dismissProgress,
  dragView,
  gestureIntent,
  insidePicture,
  isDoubleTap,
  maxScale,
  pageStep,
  pinchView,
  recentVelocity,
  shouldDismiss,
  stepZoom,
  toggleZoom,
  zoomAt,
  type Point,
  type Size,
  type Touches,
  type View,
} from '../src/components/ModalSurface/mediaLightboxGestures';
import { assertProperty } from './helpers/propertyRuns';

const STAGE: Size = { width: 400, height: 300 };
// A picture that fills the stage's width: 400 x 300 fitted, 1600 px wide as a file.
const FIT: Size = { width: 400, height: 300 };
const MAX = 4;

test('a picture zooms up to its natural size but at least twofold, and never past 8x', () => {
  assert.equal(maxScale(FIT, { width: 1600, height: 1200 }), 4);
  assert.equal(maxScale(FIT, { width: 500, height: 375 }), 2);
  assert.equal(maxScale(FIT, null), 2);
  assert.equal(maxScale(FIT, { width: 40_000, height: 30_000 }), 8);
  assert.equal(maxScale({ width: 0, height: 0 }, { width: 800, height: 600 }), 2);
});

test('a double tap zooms in at the point, a second one returns the fitted picture', () => {
  const zoomed = toggleZoom(REST_VIEW, { x: 100, y: 50 }, FIT, STAGE, MAX);
  assert.deepEqual(zoomed, { scale: 3, x: -200, y: -100 });
  assert.deepEqual(toggleZoom(zoomed, { x: 0, y: 0 }, FIT, STAGE, MAX), REST_VIEW);
});

test('a double tap zooms to no more than the natural size', () => {
  assert.equal(toggleZoom(REST_VIEW, { x: 0, y: 0 }, FIT, STAGE, 2).scale, 2);
});

test('zooming at a point keeps it under the finger, and near the edge pins the picture to that edge instead of showing a gap', () => {
  // Twofold, the picture overflows the stage by 200 px each side.
  assert.deepEqual(zoomAt(REST_VIEW, { x: 190, y: 0 }, 2, FIT, STAGE, MAX), { scale: 2, x: -190, y: 0 });
  assert.deepEqual(zoomAt(REST_VIEW, { x: 400, y: 0 }, 2, FIT, STAGE, MAX), { scale: 2, x: -200, y: 0 });
});

test('a pinch spreading the fingers about the centre zooms in place; moving them pans', () => {
  const from: Touches = [{ x: -50, y: 0 }, { x: 50, y: 0 }];
  assert.deepEqual(pinchView(REST_VIEW, from, [{ x: -100, y: 0 }, { x: 100, y: 0 }], FIT, STAGE, MAX), { scale: 2, x: 0, y: 0 });
  assert.deepEqual(pinchView(REST_VIEW, from, [{ x: -50, y: 20 }, { x: 50, y: 20 }], FIT, STAGE, MAX), { scale: 1, x: 0, y: 0 },
    'a fitted picture does not move when only the fingers do');
  assert.deepEqual(pinchView({ scale: 2, x: 0, y: 0 }, from, [{ x: -150, y: 0 }, { x: 50, y: 0 }], FIT, STAGE, MAX),
    { scale: 4, x: -50, y: 0 }, 'doubling the spread doubles the zoom and the moved centre drags the picture along');
});

test('a pinch closing the fingers never shrinks the picture below fitted and one past the file size stops at it', () => {
  const from: Touches = [{ x: -100, y: 0 }, { x: 100, y: 0 }];
  assert.equal(pinchView(REST_VIEW, from, [{ x: -5, y: 0 }, { x: 5, y: 0 }], FIT, STAGE, MAX).scale, 1);
  assert.equal(pinchView(REST_VIEW, [{ x: -5, y: 0 }, { x: 5, y: 0 }], [{ x: -300, y: 0 }, { x: 300, y: 0 }], FIT, STAGE, MAX).scale, 4);
});

test('dragging a zoomed picture stops at its edges', () => {
  const zoomed: View = { scale: 2, x: 0, y: 0 };
  assert.deepEqual(dragView(zoomed, -120, 40, FIT, STAGE, MAX), { scale: 2, x: -120, y: 40 });
  assert.deepEqual(dragView(zoomed, -900, 900, FIT, STAGE, MAX), { scale: 2, x: -200, y: 150 });
  assert.deepEqual(dragView(REST_VIEW, 50, 50, FIT, STAGE, MAX), REST_VIEW, 'a fitted picture is not moved by a drag');
});

test('a view beyond the limits (a resized stage, a smaller file) is brought back inside them', () => {
  assert.deepEqual(dragView({ scale: 9, x: 5000, y: -5000 }, 0, 0, FIT, STAGE, MAX), { scale: 4, x: 600, y: -450 });
  assert.deepEqual(dragView({ scale: 0.4, x: 30, y: 30 }, 0, 0, FIT, STAGE, MAX), REST_VIEW);
});

test('a picture smaller than a wide stage stays centred while it fits, then fills the width', () => {
  const wide: Size = { width: 1000, height: 300 };
  assert.deepEqual(dragView({ scale: 2, x: 0, y: 0 }, 300, 0, FIT, wide, MAX), { scale: 2, x: 0, y: 0 });
  assert.deepEqual(dragView({ scale: 3, x: 0, y: 0 }, 300, 0, FIT, wide, MAX), { scale: 3, x: 100, y: 0 });
});

test('the keys step the zoom about the centre and the last step out returns the fitted picture', () => {
  const centre: Point = { x: 0, y: 0 };
  const stepped = stepZoom(REST_VIEW, 1.5, centre, FIT, STAGE, MAX);
  assert.deepEqual(stepped, { scale: 1.5, x: 0, y: 0 });
  assert.deepEqual(stepZoom(stepped, 1 / 1.5, centre, FIT, STAGE, MAX), REST_VIEW);
  assert.deepEqual(stepZoom(REST_VIEW, 1 / 1.5, centre, FIT, STAGE, MAX), REST_VIEW);
});

test('a finger decides between paging, closing and panning by its first move', () => {
  assert.equal(gestureIntent(3, 4, false, true), 'pending');
  assert.equal(gestureIntent(-30, 6, false, true), 'page');
  assert.equal(gestureIntent(-30, 6, false, false), 'ignore', 'a single picture has nothing to page to');
  assert.equal(gestureIntent(4, 30, false, true), 'dismiss');
  assert.equal(gestureIntent(4, -30, false, true), 'ignore', 'only a swipe down closes');
  assert.equal(gestureIntent(-30, 6, true, true), 'pan', 'a zoomed picture pans and does not page');
  assert.equal(gestureIntent(4, 30, true, true), 'pan');
});

test('a swipe pages when it is far or a flick in its own direction', () => {
  assert.equal(pageStep(-100, 0, 400), 1, 'a quarter of the width to the left shows the next picture');
  assert.equal(pageStep(100, 0, 400), -1);
  assert.equal(pageStep(-60, 0, 400), 0, 'a short, slow drag settles back');
  assert.equal(pageStep(-30, -0.5, 400), 1, 'a short flick pages');
  assert.equal(pageStep(-30, 0.5, 400), 0, 'a flick back the other way cancels');
  assert.equal(pageStep(-10, -2, 400), 0, 'a twitch is not a swipe');
});

test('a swipe down closes when long or a flick, and dims the backdrop in proportion', () => {
  assert.equal(shouldDismiss(100, 0), true);
  assert.equal(shouldDismiss(40, 0.6), true);
  assert.equal(shouldDismiss(40, 0.1), false);
  assert.equal(shouldDismiss(10, 3), false);
  assert.equal(dismissProgress(0, 800), 0);
  assert.equal(dismissProgress(200, 800), 0.5);
  assert.equal(dismissProgress(5000, 800), 1);
  assert.equal(dismissProgress(-30, 800), 0);
});

test('two taps close in time and place make a double tap', () => {
  const first = { x: 10, y: 10, at: 1000 };
  assert.equal(isDoubleTap(first, { x: 20, y: 14, at: 1250 }), true);
  assert.equal(isDoubleTap(first, { x: 20, y: 14, at: 1400 }), false);
  assert.equal(isDoubleTap(first, { x: 200, y: 14, at: 1100 }), false);
  assert.equal(isDoubleTap(null, { x: 0, y: 0, at: 0 }), false);
});

test('a tap on the empty stage is told from one on the picture', () => {
  const fit: Size = { width: 200, height: 300 };
  assert.equal(insidePicture({ x: 50, y: -100 }, REST_VIEW, fit), true);
  assert.equal(insidePicture({ x: 250, y: 0 }, REST_VIEW, fit), false);
  assert.equal(insidePicture({ x: 250, y: 0 }, { scale: 3, x: 0, y: 0 }, fit), true, 'zoomed, the picture reaches that far');
});

test('the release speed is read from the last 100 ms of the finger only', () => {
  const samples = [{ x: 0, y: 0, at: 0 }, { x: 300, y: 0, at: 400 }, { x: 310, y: 0, at: 450 }, { x: 330, y: 0, at: 500 }];
  assert.deepEqual(recentVelocity(samples), { x: 0.3, y: 0 });
  assert.deepEqual(recentVelocity([]), { x: 0, y: 0 });
  assert.deepEqual(recentVelocity([{ x: 5, y: 5, at: 10 }]), { x: 0, y: 0 });
});

// ---- Properties: whatever the fingers do, the picture stays on the stage. ----

const stageArb = fc.record({ width: fc.integer({ min: 120, max: 2400 }), height: fc.integer({ min: 120, max: 1600 }) });
const picture = fc.record({
  stage: stageArb,
  ratio: fc.double({ min: 0.2, max: 5, noNaN: true }),
  fileScale: fc.double({ min: 0.3, max: 30, noNaN: true }),
});
const coordinate = (limit: number) => fc.double({ min: -limit, max: limit, noNaN: true });
const point = (size: Size): fc.Arbitrary<Point> => fc.record({ x: coordinate(size.width), y: coordinate(size.height) });

type Operation =
  | { kind: 'zoom'; focal: Point; scale: number }
  | { kind: 'pinch'; from: Touches; to: Touches }
  | { kind: 'drag'; dx: number; dy: number }
  | { kind: 'toggle'; focal: Point }
  | { kind: 'step'; focal: Point; factor: number };

function operations(stage: Size): fc.Arbitrary<Operation[]> {
  const spot = point({ width: stage.width * 0.75, height: stage.height * 0.75 });
  return fc.array(fc.oneof(
    fc.record({ kind: fc.constant('zoom' as const), focal: spot, scale: fc.double({ min: 0, max: 20, noNaN: true }) }),
    fc.record({ kind: fc.constant('pinch' as const), from: fc.tuple(spot, spot), to: fc.tuple(spot, spot) }),
    fc.record({ kind: fc.constant('drag' as const), dx: coordinate(3000), dy: coordinate(3000) }),
    fc.record({ kind: fc.constant('toggle' as const), focal: spot }),
    fc.record({ kind: fc.constant('step' as const), focal: spot, factor: fc.double({ min: 0.1, max: 6, noNaN: true }) }),
  ) as fc.Arbitrary<Operation>, { maxLength: 30 });
}

function apply(view: View, operation: Operation, fit: Size, stage: Size, max: number): View {
  switch (operation.kind) {
    case 'zoom': return zoomAt(view, operation.focal, operation.scale, fit, stage, max);
    case 'pinch': return pinchView(view, operation.from, operation.to, fit, stage, max);
    case 'drag': return dragView(view, operation.dx, operation.dy, fit, stage, max);
    case 'toggle': return toggleZoom(view, operation.focal, fit, stage, max);
    case 'step': return stepZoom(view, operation.factor, operation.focal, fit, stage, max);
  }
}

function setup({ stage, ratio, fileScale }: { stage: Size; ratio: number; fileScale: number }) {
  const width = Math.min(stage.width, stage.height * ratio);
  const fit: Size = { width, height: width / ratio };
  const natural: Size = { width: fit.width * fileScale, height: fit.height * fileScale };
  return { stage, fit, max: maxScale(fit, natural) };
}

test('after any run of zooms, pinches, drags and taps the zoom is within [1, max] and the picture never leaves a gap or the stage', () => {
  assertProperty(fc.property(picture.chain(shape => fc.tuple(fc.constant(shape), operations(shape.stage))), ([shape, steps]) => {
    const { stage, fit, max } = setup(shape);
    const edge = 1e-6;
    let view = REST_VIEW;
    for (const step of steps) {
      view = apply(view, step, fit, stage, max);
      assert.ok(Number.isFinite(view.scale) && Number.isFinite(view.x) && Number.isFinite(view.y), JSON.stringify(view));
      assert.ok(view.scale >= 1 && view.scale <= max + edge, `scale ${view.scale} outside [1, ${max}]`);
      for (const [offset, size, box] of [[view.x, fit.width * view.scale, stage.width], [view.y, fit.height * view.scale, stage.height]]) {
        if (size <= box) assert.equal(offset, 0, 'a picture that fits the stage stays centred');
        else {
          assert.ok(offset - size / 2 <= -box / 2 + edge, 'the picture leaves a gap at the near edge');
          assert.ok(offset + size / 2 >= box / 2 - edge, 'the picture leaves a gap at the far edge');
        }
      }
    }
  }));
});

test('zooming in at a point and out again at the same point returns the fitted picture', () => {
  assertProperty(fc.property(picture, fc.double({ min: 1, max: 20, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }), (shape, scale, unitX, unitY) => {
      const { stage, fit, max } = setup(shape);
      const focal = { x: (unitX * stage.width) / 2, y: (unitY * stage.height) / 2 };
      const zoomed = zoomAt(REST_VIEW, focal, scale, fit, stage, max);
      const back = zoomAt(zoomed, focal, 1, fit, stage, max);
      // Floating-point sizes can overflow the stage by a hair: an offset that small is the fitted picture.
      assert.equal(back.scale, 1);
      assert.ok(Math.abs(back.x) < 1e-6 && Math.abs(back.y) < 1e-6, JSON.stringify(back));
    }));
});

test('a zoom keeps the point under the finger in place on each axis unless the picture has reached an edge', () => {
  assertProperty(fc.property(picture, fc.double({ min: 1, max: 20, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true }),
    fc.double({ min: -1, max: 1, noNaN: true }), (shape, scale, unitX, unitY) => {
      const { stage, fit, max } = setup(shape);
      const focal = { x: (unitX * stage.width) / 2, y: (unitY * stage.height) / 2 };
      const view = zoomAt(REST_VIEW, focal, scale, fit, stage, max);
      for (const [pointOnStage, offset, picturePx, boxPx] of [[focal.x, view.x, fit.width, stage.width], [focal.y, view.y, fit.height, stage.height]]) {
        // The point of the picture under the finger, in picture units, before (fitted, centred) and after.
        const before = pointOnStage / picturePx;
        const after = (pointOnStage - offset) / (picturePx * view.scale);
        const limit = Math.max(0, (picturePx * view.scale - boxPx) / 2);
        const pinned = Math.abs(Math.abs(offset) - limit) < 1e-6;
        assert.ok(Math.abs(before - after) < 1e-6 || pinned, `the point moved: ${before} -> ${after}, offset ${offset}, limit ${limit}`);
      }
    }));
});

test('a stage with no size or fingers on one spot never produce a non-finite view', () => {
  assertProperty(fc.property(fc.double({ min: -50, max: 50, noNaN: true }), fc.double({ min: -50, max: 50, noNaN: true }), (x, y) => {
    const empty: Size = { width: 0, height: 0 };
    const together: Touches = [{ x, y }, { x, y }];
    for (const view of [
      pinchView(REST_VIEW, together, together, empty, empty, 2),
      zoomAt(REST_VIEW, { x, y }, 3, empty, empty, 2),
      dragView(REST_VIEW, x, y, empty, empty, 2),
      toggleZoom(REST_VIEW, { x, y }, empty, empty, 2),
    ]) {
      assert.ok(Number.isFinite(view.scale) && Number.isFinite(view.x) && Number.isFinite(view.y), JSON.stringify(view));
      assert.ok(view.scale >= 1 && view.scale <= 2);
    }
  }));
});

test('a zoomed picture is never paged or closed by a swipe, whichever way the finger goes', () => {
  assertProperty(fc.property(coordinate(2000), coordinate(2000), fc.boolean(), (dx, dy, canPage) => {
    const intent = gestureIntent(dx, dy, true, canPage);
    assert.ok(intent === 'pan' || intent === 'pending', intent);
  }));
});

test('a swipe never pages against its direction', () => {
  assertProperty(fc.property(coordinate(1000), coordinate(5), fc.integer({ min: 100, max: 2000 }), (dx, vx, width) => {
    const step = pageStep(dx, vx, width);
    assert.ok(dx < 0 ? step >= 0 : step <= 0, `dx ${dx} paged ${step}`);
  }));
});
