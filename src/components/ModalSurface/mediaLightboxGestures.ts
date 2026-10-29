/**
 * The arithmetic of MediaLightbox's gestures, free of the DOM so that it can be
 * tested on its own (tests/media-lightbox-gestures.test.ts): how far a picture
 * may be zoomed and moved, where a pinch or a double tap lands it, and whether a
 * finger's movement pages, closes or pans.
 *
 * Coordinates are in CSS pixels relative to the centre of the stage (the box
 * the picture is shown in). A picture at rest is `fit`, its `object-fit:
 * contain` size inside the stage; a view scales it about its own centre and
 * moves that centre by (x, y).
 */

export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
/** The picture's zoom (1 = fitted) and where its centre sits relative to the stage's. */
export type View = { scale: number; x: number; y: number };
export type Touches = readonly [Point, Point];

export const REST_VIEW: View = { scale: 1, x: 0, y: 0 };

/** A pinch may always reach this far, however small the picture's file is. */
const MIN_MAX_SCALE = 2;
/** The ceiling for very large files, so that a pan stays controllable. */
const MAX_SCALE_CEILING = 8;
/** What a double tap zooms to; the picture's own limit applies when it is lower. */
const DOUBLE_TAP_SCALE = 3;
/** Under this a picture counts as not zoomed: its swipes page and close. */
const ZOOMED = 1.02;

/** Finger travel before a gesture's direction is read. */
const SLOP = 8;
/** A swipe pages when it covers this share of the stage's width... */
const PAGE_SHARE = 0.2;
/** ...or is a flick: at least this far and faster than FLICK_SPEED (px/ms). */
const FLICK_DISTANCE = 24;
const FLICK_SPEED = 0.4;
/** A swipe down closes after this distance or as a flick. */
const DISMISS_DISTANCE = 96;
/** A tap pair within this time and distance is a double tap. */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DISTANCE = 32;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
/** `|| 0` also turns -0 into 0, which strict equality would tell apart. */
const clean = (value: number) => (Number.isFinite(value) ? value : 0) || 0;

/** The largest zoom: the picture's natural size on the screen, but at least 2×. */
export function maxScale(fit: Size, natural: Size | null): number {
  if (!natural || !(fit.width > 0) || !(natural.width > 0)) return MIN_MAX_SCALE;
  return clamp(natural.width / fit.width, MIN_MAX_SCALE, MAX_SCALE_CEILING);
}

/** How far the picture's centre may sit from the stage's centre at `scale`: none while it still fits. */
export function panLimits(scale: number, fit: Size, stage: Size): Point {
  const reach = (picture: number, box: number) => Math.max(0, clean((picture * scale - box) / 2));
  return { x: reach(fit.width, stage.width), y: reach(fit.height, stage.height) };
}

/**
 * The nearest view the stage can show: scale within [1, max], and a picture
 * that never leaves a gap at an edge it overflows or leaves the stage while it
 * fits.
 */
export function clampView(view: View, fit: Size, stage: Size, max: number): View {
  const scale = clamp(clean(view.scale) || 1, 1, Math.max(1, max));
  const limit = panLimits(scale, fit, stage);
  return { scale, x: clamp(clean(view.x), -limit.x, limit.x) || 0, y: clamp(clean(view.y), -limit.y, limit.y) || 0 };
}

/** Zooms to `scale` keeping the picture point under `focal` where it is, as far as the edges allow. */
export function zoomAt(view: View, focal: Point, scale: number, fit: Size, stage: Size, max: number): View {
  const from = clampView(view, fit, stage, max);
  const next = clamp(clean(scale) || 1, 1, Math.max(1, max));
  const ratio = next / from.scale;
  return clampView({ scale: next, x: focal.x - (focal.x - from.x) * ratio, y: focal.y - (focal.y - from.y) * ratio }, fit, stage, max);
}

const midpoint = ([a, b]: Touches): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const spread = ([a, b]: Touches) => Math.hypot(a.x - b.x, a.y - b.y);

/** The view of a pinch that began at `start` with fingers `from` and now has them at `to`. */
export function pinchView(start: View, from: Touches, to: Touches, fit: Size, stage: Size, max: number): View {
  const origin = clampView(start, fit, stage, max);
  const before = spread(from);
  const scale = clamp(origin.scale * (before > 0 ? spread(to) / before : 1), 1, Math.max(1, max));
  const ratio = scale / origin.scale;
  const [was, now] = [midpoint(from), midpoint(to)];
  return clampView({ scale, x: now.x - (was.x - origin.x) * ratio, y: now.y - (was.y - origin.y) * ratio }, fit, stage, max);
}

/** The view of a drag that began at `start` and has moved by (dx, dy). */
export function dragView(start: View, dx: number, dy: number, fit: Size, stage: Size, max: number): View {
  return clampView({ scale: start.scale, x: start.x + dx, y: start.y + dy }, fit, stage, max);
}

/** A double tap or click: back to fitted when zoomed, else zoomed in at the point. */
export function toggleZoom(view: View, focal: Point, fit: Size, stage: Size, max: number): View {
  if (view.scale > ZOOMED) return REST_VIEW;
  return zoomAt(view, focal, Math.min(max, DOUBLE_TAP_SCALE), fit, stage, max);
}

/** A key or wheel step: `factor` times the zoom at `focal`; back to fitted when it drops below. */
export function stepZoom(view: View, factor: number, focal: Point, fit: Size, stage: Size, max: number): View {
  const next = zoomAt(view, focal, view.scale * factor, fit, stage, max);
  return next.scale <= ZOOMED ? REST_VIEW : next;
}

export function isZoomed(view: View): boolean {
  return view.scale > ZOOMED;
}

/** Whether `point` is on the visible picture (rather than on the empty stage around it). */
export function insidePicture(point: Point, view: View, fit: Size): boolean {
  return Math.abs(point.x - view.x) <= (fit.width * view.scale) / 2 && Math.abs(point.y - view.y) <= (fit.height * view.scale) / 2;
}

export type Intent = 'pending' | 'page' | 'dismiss' | 'pan' | 'ignore';

/**
 * What a finger that moved by (dx, dy) since it went down is doing. A zoomed
 * picture is panned and never paged; a fitted one pages on a mostly sideways
 * move and closes on a downward one.
 */
export function gestureIntent(dx: number, dy: number, zoomed: boolean, canPage: boolean): Intent {
  if (Math.hypot(dx, dy) < SLOP) return 'pending';
  if (zoomed) return 'pan';
  if (Math.abs(dx) > Math.abs(dy)) return canPage ? 'page' : 'ignore';
  return dy > 0 ? 'dismiss' : 'ignore';
}

/** Where a sideways swipe of `dx` that ended moving at `vx` px/ms goes: +1 the next picture, -1 the previous, 0 stays. */
export function pageStep(dx: number, vx: number, width: number): -1 | 0 | 1 {
  const far = Math.abs(dx) > width * PAGE_SHARE;
  const flick = Math.abs(dx) > FLICK_DISTANCE && Math.abs(vx) > FLICK_SPEED && Math.sign(vx) === Math.sign(dx);
  if (!far && !flick) return 0;
  return dx < 0 ? 1 : -1;
}

/** Whether a downward swipe of `dy` that ended moving at `vy` px/ms closes the lightbox. */
export function shouldDismiss(dy: number, vy: number): boolean {
  return dy > DISMISS_DISTANCE || (dy > FLICK_DISTANCE && vy > FLICK_SPEED);
}

/** How far a downward drag of `dy` has taken the lightbox towards closing, 0..1 (the backdrop dims with it). */
export function dismissProgress(dy: number, height: number): number {
  return height > 0 ? clamp(dy / (height * 0.5), 0, 1) : 0;
}

export type Tap = { x: number; y: number; at: number };

/** Whether `next` completes a double tap that began with `previous`. */
export function isDoubleTap(previous: Tap | null, next: Tap): boolean {
  return previous !== null && next.at - previous.at <= DOUBLE_TAP_MS
    && Math.hypot(next.x - previous.x, next.y - previous.y) <= DOUBLE_TAP_DISTANCE;
}

export type Sample = { x: number; y: number; at: number };

/** The finger's speed in px/ms over the last `windowMs` of its samples: what a release flicks with. */
export function recentVelocity(samples: readonly Sample[], windowMs = 100): Point {
  const last = samples.at(-1);
  if (!last) return { x: 0, y: 0 };
  const first = samples.find(sample => last.at - sample.at <= windowMs) ?? last;
  const elapsed = last.at - first.at;
  return elapsed > 0 ? { x: (last.x - first.x) / elapsed, y: (last.y - first.y) / elapsed } : { x: 0, y: 0 };
}
