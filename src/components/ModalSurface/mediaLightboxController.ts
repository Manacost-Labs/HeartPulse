import { prefersReducedMotion } from '../../shared/ui/motionTokens';
import { MediaLightboxStage, centreOf } from './mediaLightboxStage';
import {
  REST_VIEW,
  dragView,
  gestureIntent,
  insidePicture,
  isDoubleTap,
  isZoomed,
  pageStep,
  pinchView,
  recentVelocity,
  shouldDismiss,
  stepZoom,
  toggleZoom,
  type Intent,
  type Point,
  type Sample,
  type Size,
  type Tap,
  type Touches,
  type View,
} from './mediaLightboxGestures';

/**
 * MediaLightbox's pointer, wheel and zoom handling on its stage (the DOM half
 * of mediaLightboxGestures.ts). One finger or the mouse pages (sideways),
 * closes (down) or, on a zoomed picture, pans; two fingers pinch; two quick
 * taps zoom in at the point and back. The picture on show is the
 * `[data-slot="current"]` slide's `.media-lightbox__pan`; a drag writes its
 * transform straight to the element (no React render per frame), and every
 * settle is a Web Animation on `transform` or `opacity`.
 */

export type ControllerOptions = {
  /** The picture on show is an image: a video keeps its own pointer controls. */
  isImage: () => boolean;
  canPage: () => boolean;
  /** A page is turning: a new gesture waits for it. */
  busy: () => boolean;
  /** Page by `step` after `travelled` px of sideways drag (0 when it did not follow the finger). */
  page: (step: -1 | 1, travelled: number) => void;
  /** Close like Esc and the backdrop do. */
  close: () => void;
};

type Gesture = {
  pointers: Map<number, Point>;
  primary: number;
  mode: Intent | 'pinch';
  start: Point;
  startView: View;
  samples: Sample[];
  rect: DOMRect;
  size: Size;
  fit: Size;
  max: number;
  reduced: boolean;
  pinchFrom: Touches | null;
};

export class MediaLightboxController {
  private gesture: Gesture | null = null;
  private lastTap: Tap | null = null;
  private readonly stage: MediaLightboxStage;
  private readonly element: HTMLElement;
  private readonly options: ControllerOptions;

  constructor(element: HTMLElement, options: ControllerOptions) {
    this.element = element;
    this.stage = new MediaLightboxStage(element);
    this.options = options;
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('dragstart', this.onDragStart);
  }

  /** Zoom about the stage's centre by `factor` (a key); a step out of the last zoom shows the picture fitted. */
  zoomBy(factor: number): void {
    if (!this.options.isImage()) return;
    const { size, fit, max } = this.stage.measure();
    this.stage.show(stepZoom(this.stage.view, factor, { x: 0, y: 0 }, fit, size, max), false);
  }

  resetZoom(): void {
    this.stage.show(REST_VIEW, false);
  }

  /** Another picture is on show: forget the previous one's zoom, drag and taps. */
  reset(): void {
    this.gesture = null;
    this.lastTap = null;
    this.stage.reset();
  }

  destroy(): void {
    const { element } = this;
    element.removeEventListener('pointerdown', this.onPointerDown);
    element.removeEventListener('pointermove', this.onPointerMove);
    element.removeEventListener('pointerup', this.onPointerUp);
    element.removeEventListener('pointercancel', this.onPointerUp);
    element.removeEventListener('wheel', this.onWheel);
    element.removeEventListener('dragstart', this.onDragStart);
    this.reset();
  }

  private begin(event: PointerEvent): Gesture {
    const { size, fit, max } = this.stage.measure();
    const point = { x: event.clientX, y: event.clientY };
    return {
      pointers: new Map([[event.pointerId, point]]), primary: event.pointerId, mode: 'pending', start: point, startView: this.stage.view,
      samples: [{ ...point, at: performance.now() }], rect: this.element.getBoundingClientRect(), size, fit, max,
      reduced: prefersReducedMotion(), pinchFrom: null,
    };
  }

  private touches(g: Gesture): Touches {
    const [a, b] = [...g.pointers.values()];
    const at = (p: Point) => ({ x: p.x - (g.rect.left + g.rect.width / 2), y: p.y - (g.rect.top + g.rect.height / 2) });
    return [at(a), at(b)];
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.options.isImage() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (this.stage.settling.size > 0 || this.options.busy()) return;
    let g = this.gesture;
    if (!g) {
      g = this.gesture = this.begin(event);
    } else {
      // A second finger joins a pinch, but never a swipe that has begun to move the lightbox.
      if (g.pointers.size >= 2 || g.mode === 'page' || g.mode === 'dismiss') return;
      g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      g.mode = 'pinch';
      g.pinchFrom = this.touches(g);
      g.startView = this.stage.view;
      this.stage.freeze();
    }
    try { this.element.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    const pan = this.stage.currentPan();
    if (pan) pan.dataset.active = '';
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const g = this.gesture;
    if (!g || !g.pointers.has(event.pointerId)) return;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (g.mode === 'pinch' && g.pinchFrom && g.pointers.size === 2) {
      this.stage.show(pinchView(g.startView, g.pinchFrom, this.touches(g), g.fit, g.size, g.max), false);
      return;
    }
    if (event.pointerId !== g.primary) return;
    const at = performance.now();
    g.samples.push({ x: event.clientX, y: event.clientY, at });
    while (g.samples.length > 2 && at - g.samples[0].at > 200) g.samples.shift();
    const dx = event.clientX - g.start.x;
    const dy = event.clientY - g.start.y;
    if (g.mode === 'pending') {
      g.mode = gestureIntent(dx, dy, isZoomed(g.startView), this.options.canPage());
      if (g.mode === 'pending') return;
    }
    if (g.mode === 'pan') this.stage.show(dragView(g.startView, dx, dy, g.fit, g.size, g.max), false);
    // Under reduced motion a swipe is read, but does not carry the lightbox along.
    else if ((g.mode === 'page' || g.mode === 'dismiss') && !g.reduced) this.stage.follow(g.mode, dx, dy, g.size.height);
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const g = this.gesture;
    if (!g?.pointers.delete(event.pointerId)) return;
    try { this.element.releasePointerCapture(event.pointerId); } catch { /* released with the pointer */ }
    if (g.mode === 'pinch' && g.pointers.size === 1) {
      // One finger left: it carries on as a pan from where it is.
      const [[id, point]] = [...g.pointers];
      g.primary = id;
      g.start = point;
      g.startView = this.stage.view;
      g.samples = [];
      g.mode = isZoomed(this.stage.view) ? 'pan' : 'ignore';
      return;
    }
    if (g.pointers.size > 0) return;
    this.gesture = null;
    this.release(g, event);
    const pan = this.stage.currentPan();
    if (pan && !isZoomed(this.stage.view)) delete pan.dataset.active;
  };

  /** The last finger is up: the gesture settles into a page turn, a close, a spring back or a tap. */
  private release(g: Gesture, event: PointerEvent) {
    const cancelled = event.type === 'pointercancel';
    const dx = event.clientX - g.start.x;
    const dy = event.clientY - g.start.y;
    const velocity = recentVelocity(g.samples);
    if (g.mode === 'pending') {
      if (!cancelled) this.tap(g, event);
    } else if (g.mode === 'pinch') {
      if (!isZoomed(this.stage.view)) this.stage.show(REST_VIEW, false);
    } else if (g.mode === 'page') {
      const step = cancelled ? 0 : pageStep(dx, velocity.x, g.size.width);
      if (step !== 0) { this.options.page(step, g.reduced ? 0 : dx); return; }
      if (!g.reduced) this.stage.springBack(this.stage.track(), 'transform', `translate3d(${dx}px, 0, 0)`, 'translate3d(0, 0, 0)', Math.min(1, (Math.abs(dx) / g.size.width) * 2));
      this.stage.clearDrag();
    } else if (g.mode === 'dismiss') {
      const drop = Math.max(0, dy);
      if (!cancelled && shouldDismiss(drop, velocity.y)) { this.options.close(); return; }
      if (!g.reduced) {
        const share = Math.min(1, drop / 200);
        const scrim = this.stage.backdrop();
        this.stage.springBack(this.stage.panel(), 'transform', `translate3d(0, ${drop}px, 0)`, 'translate3d(0, 0, 0)', share);
        this.stage.springBack(scrim, 'opacity', getComputedStyle(scrim ?? this.element).opacity, '1', share);
      }
      this.stage.clearDrag();
    }
  }

  private tap(g: Gesture, event: PointerEvent) {
    const point = centreOf(g.rect, event);
    const next: Tap = { x: point.x, y: point.y, at: performance.now() };
    if (isDoubleTap(this.lastTap, next)) {
      this.lastTap = null;
      this.stage.show(toggleZoom(this.stage.view, point, g.fit, g.size, g.max), true);
      return;
    }
    this.lastTap = next;
    // A tap beside the picture is a tap on the backdrop.
    if (!insidePicture(point, this.stage.view, g.fit)) this.options.close();
  }

  private readonly onWheel = (event: WheelEvent) => {
    const zoom = event.ctrlKey || event.metaKey;
    if (!this.options.isImage() || (!zoom && !isZoomed(this.stage.view))) return;
    event.preventDefault();
    const { size, fit, max } = this.stage.measure();
    if (zoom) {
      // A trackpad pinch arrives as many small ctrl+wheel steps, a mouse wheel as a few large ones.
      const factor = Math.min(2, Math.max(0.5, Math.exp(-event.deltaY * 0.005)));
      this.stage.show(stepZoom(this.stage.view, factor, centreOf(this.element.getBoundingClientRect(), event), fit, size, max), false);
    } else {
      this.stage.show(dragView(this.stage.view, -event.deltaX, -event.deltaY, fit, size, max), false);
    }
  };

  private readonly onDragStart = (event: Event) => event.preventDefault();
}
