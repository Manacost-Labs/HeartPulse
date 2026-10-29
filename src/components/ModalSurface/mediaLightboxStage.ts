import { motionEasing, motionMs, prefersReducedMotion } from '../../shared/ui/motionTokens';
import { containedBox } from './lightboxMotion';
import { REST_VIEW, dismissProgress, isZoomed, maxScale, type Point, type View } from './mediaLightboxGestures';

const isRest = (view: View) => view.scale === 1 && view.x === 0 && view.y === 0;

function transformOf(view: View): string {
  return isRest(view) ? 'none' : `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
}

/** A point of the pointer event on the stage, relative to the stage's centre (the coordinates of mediaLightboxGestures.ts). */
export function centreOf(rect: DOMRect, event: { clientX: number; clientY: number }): Point {
  return { x: event.clientX - (rect.left + rect.width / 2), y: event.clientY - (rect.top + rect.height / 2) };
}

/**
 * The stage of a MediaLightbox as the gestures see it: where the picture on
 * show, the picture track, the panel and the backdrop are, the zoom the
 * picture is at, and the few animations that settle a gesture (a double tap's
 * zoom, a swipe's spring back).
 */
export class MediaLightboxStage {
  readonly element: HTMLElement;
  /** The picture on show's zoom and place. */
  view: View = REST_VIEW;
  /** Spring backs under way: a new gesture waits for them. */
  readonly settling = new Set<Animation>();
  private viewAnimation: Animation | null = null;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  currentPan(): HTMLElement | null {
    return this.element.querySelector<HTMLElement>('[data-slot="current"] > .media-lightbox__pan');
  }

  panel(): HTMLElement | null {
    return this.element.closest<HTMLElement>('[data-modal-surface-panel]');
  }

  backdrop(): HTMLElement | null {
    return this.panel()?.parentElement?.querySelector<HTMLElement>('[data-modal-surface-backdrop]') ?? null;
  }

  track(): HTMLElement | null {
    return this.element.querySelector<HTMLElement>('.media-lightbox__track');
  }

  /** The stage's size, the picture's fitted size inside it and how far it may zoom, as the picture on show has them now. */
  measure() {
    const size = { width: this.element.clientWidth, height: this.element.clientHeight };
    const image = this.currentPan()?.querySelector<HTMLImageElement>('img.media-lightbox__image');
    const natural = image && image.naturalWidth > 0 && image.naturalHeight > 0
      ? { width: image.naturalWidth, height: image.naturalHeight } : null;
    const ratio = natural ? natural.width / natural.height : size.width / Math.max(1, size.height);
    const box = containedBox({ left: 0, top: 0, width: size.width, height: size.height }, ratio);
    const fit = { width: box.width, height: box.height };
    return { size, fit, max: maxScale(fit, natural) };
  }

  /** Puts the picture on show into `next`: at once while a finger drives it, over `--motion-base` after a double tap. */
  show(next: View, animate: boolean) {
    const pan = this.currentPan();
    if (!pan) return;
    const from = transformOf(this.view);
    this.view = next;
    this.viewAnimation?.cancel();
    this.viewAnimation = null;
    pan.style.transform = isRest(next) ? '' : transformOf(next);
    if (isZoomed(next) !== this.element.hasAttribute('data-zoomed')) this.element.toggleAttribute('data-zoomed', isZoomed(next));
    if (isZoomed(next) && pan.dataset.active === undefined) pan.dataset.active = '';
    const duration = animate && !prefersReducedMotion() && pan.animate ? motionMs('--motion-base') : 0;
    if (duration) this.viewAnimation = pan.animate([{ transform: from }, { transform: transformOf(next) }], { duration, easing: motionEasing('--motion-ease') });
  }

  /** Stops a double tap's zoom where it is (a second finger took the picture). */
  freeze() {
    this.viewAnimation?.cancel();
  }

  /** Brings an element a drag moved back to rest over the time its distance asks for. */
  springBack(element: HTMLElement | null, property: 'transform' | 'opacity', from: string, to: string, share: number) {
    if (!element?.animate) return;
    const duration = Math.max(motionMs('--motion-instant'), motionMs('--motion-fast') * share);
    const animation = element.animate([{ [property]: from }, { [property]: to }], { duration, easing: motionEasing('--motion-ease') });
    const done = () => { this.settling.delete(animation); };
    this.settling.add(animation);
    animation.finished.then(done, done);
  }

  /** A swipe moves the lightbox with the finger: the picture track sideways, the whole panel down with the backdrop dimming. */
  follow(mode: 'page' | 'dismiss', dx: number, dy: number, height: number) {
    if (mode === 'page') {
      const pageTrack = this.track();
      if (pageTrack) pageTrack.style.transform = `translate3d(${dx}px, 0, 0)`;
      return;
    }
    const drop = Math.max(0, dy);
    const sheet = this.panel();
    if (sheet) sheet.style.transform = `translate3d(0, ${drop}px, 0)`;
    const scrim = this.backdrop();
    if (scrim) scrim.style.opacity = String(1 - 0.8 * dismissProgress(drop, height));
  }

  /** The inline styles a swipe left on the track, the panel and the backdrop. */
  clearDrag() {
    const pageTrack = this.track();
    if (pageTrack) pageTrack.style.transform = '';
    const sheet = this.panel();
    if (sheet) sheet.style.transform = '';
    const scrim = this.backdrop();
    if (scrim) scrim.style.opacity = '';
  }

  /** Another picture is on show: every picture at rest, nothing under way. */
  reset() {
    this.viewAnimation?.cancel();
    this.viewAnimation = null;
    for (const animation of this.settling) animation.cancel();
    this.settling.clear();
    this.view = REST_VIEW;
    for (const pan of this.element.querySelectorAll<HTMLElement>('.media-lightbox__pan')) {
      pan.style.transform = '';
      delete pan.dataset.active;
    }
    this.element.removeAttribute('data-zoomed');
    this.clearDrag();
  }
}
