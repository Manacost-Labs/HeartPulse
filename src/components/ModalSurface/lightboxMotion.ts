import { recentPress } from '../../shared/ui/lightboxIntent';
import { motionEasing, motionMs, prefersReducedMotion } from '../../shared/ui/motionTokens';

/**
 * The shared-element zoom of a lightbox (ModalSurface `zoom`). The picture the
 * reader pressed is already loaded and decoded on the page, so the first frame
 * of the lightbox shows it: a fixed "flight" copy of that picture travels from
 * its place on the page to the lightbox's media box while the lightbox fades
 * in under it, and back on close. Transform and opacity only, measured once
 * before the first paint; nothing in the click handler waits for it.
 */

/** A press this recent still names the lightbox's trigger. */
const PRESS_WINDOW_MS = 1500;

/** The picture on the page that opened the lightbox: in the focused trigger, else in the element just pressed. */
export function lightboxOrigin(): HTMLImageElement | null {
  const candidates: Element[] = [];
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) candidates.push(document.activeElement);
  const press = recentPress(PRESS_WINDOW_MS);
  if (press) candidates.push(press);
  for (const candidate of candidates) {
    const trigger = candidate.closest('button, a, [role="button"], [data-lightbox-trigger]') ?? candidate;
    const image = trigger instanceof HTMLImageElement ? trigger : trigger.querySelector('img');
    if (image && image.complete && image.naturalWidth > 0 && visible(image.getBoundingClientRect())) return image;
  }
  return null;
}

function visible(rect: DOMRect): boolean {
  return rect.width > 4 && rect.height > 4 && rect.bottom > 0 && rect.right > 0
    && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

export type Box = { left: number; top: number; width: number; height: number };

/** The rectangle a picture of `ratio` (width / height) occupies inside `box` with `object-fit: contain`. */
export function containedBox(box: Box, ratio: number): Box {
  if (!(ratio > 0) || !(box.width > 0) || !(box.height > 0)) return box;
  const width = Math.min(box.width, box.height * ratio);
  const height = width / ratio;
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}

/** The transform that places a box drawn at `to` over `from` (transform-origin: top left). */
export function flightTransform(from: Box, to: Box): string {
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scaleX}, ${scaleY})`;
}

function pictureBox(image: HTMLImageElement): Box {
  const rect = image.getBoundingClientRect();
  const fit = getComputedStyle(image).objectFit;
  const ratio = image.naturalWidth / image.naturalHeight;
  return fit === 'contain' || fit === 'scale-down' ? containedBox(rect, ratio) : rect;
}

function flightCopy(source: HTMLImageElement, box: Box, layer: number): HTMLImageElement {
  const copy = document.createElement('img');
  copy.src = source.currentSrc || source.src;
  copy.alt = '';
  copy.setAttribute('aria-hidden', 'true');
  copy.className = 'lightbox-flight';
  Object.assign(copy.style, {
    position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    margin: '0', zIndex: String(layer), pointerEvents: 'none', transformOrigin: '0 0', objectFit: 'fill',
  });
  document.body.append(copy);
  return copy;
}

function layerAbove(surface: HTMLElement): number {
  const value = Number.parseInt(getComputedStyle(surface).zIndex, 10);
  return Number.isFinite(value) ? value + 1 : 1000;
}

export type LightboxMotion = { opened: Promise<void>; close: () => Promise<void>; cancel: () => void };

/**
 * A lightbox of several pictures tells its closing which picture is on show and
 * which page thumbnail it flies back into (`opened` is the thumbnail that
 * opened the lightbox). A resolver returning null closes with a fade.
 */
export type ClosingTargets = {
  media?: () => HTMLImageElement | null;
  origin?: (opened: HTMLImageElement | null) => HTMLImageElement | null;
};

/**
 * Plays the opening and returns the closing. `media` is the lightbox picture
 * (it shows the same loaded image as `origin` on its first frame); without an
 * origin, or under reduced motion, the lightbox only fades.
 */
export function playLightbox(surface: HTMLElement, panel: HTMLElement, media: HTMLImageElement | null,
  origin: HTMLImageElement | null, closing?: () => ClosingTargets | undefined): LightboxMotion {
  const duration = motionMs('--motion-base');
  const fadeDuration = motionMs('--motion-fast');
  const easing = motionEasing('--motion-ease');
  const exit = motionEasing('--motion-ease-exit');
  const running: Animation[] = [];
  const track = (animation: Animation) => { running.push(animation); return animation; };
  const finished = (animation: Animation) => animation.finished.then(() => undefined, () => undefined);
  const backdrop = surface.querySelector<HTMLElement>('[data-modal-surface-backdrop]');
  const fadeIn = (element: Element | null, time: number) => element ? track(element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: time, easing })) : null;
  // From where the element is: a swipe has already dimmed the backdrop, and a close during the opening starts mid-fade.
  const fadeOut = (element: Element | null, time: number) => element
    ? track(element.animate([{ opacity: getComputedStyle(element).opacity }, { opacity: 0 }], { duration: time, easing: exit, fill: 'forwards' })) : null;

  const zoom = Boolean(duration && origin && media?.complete && media.naturalWidth && !prefersReducedMotion());
  if (!zoom || !origin || !media) {
    // Reduced motion, no origin or a picture not loaded yet: a plain fade.
    const time = fadeDuration || 0;
    const opening = time ? [fadeIn(backdrop, time), fadeIn(panel, time)] : [];
    return {
      opened: Promise.all(opening.map(animation => animation ? finished(animation) : undefined)).then(() => undefined),
      close: () => time ? Promise.all([fadeOut(backdrop, time), fadeOut(panel, time)].map(animation => animation ? finished(animation) : undefined)).then(() => undefined) : Promise.resolve(),
      cancel: () => running.forEach(animation => animation.cancel()),
    };
  }

  const target = pictureBox(media);
  const start = pictureBox(origin);
  const copy = flightCopy(origin, target, layerAbove(surface));
  media.style.visibility = 'hidden';
  const flight = track(copy.animate([{ transform: flightTransform(start, target) }, { transform: 'none' }], { duration, easing }));
  fadeIn(backdrop, duration);
  fadeIn(panel, fadeDuration || duration);
  const land = () => { media.style.visibility = ''; copy.remove(); };
  const opened = finished(flight).then(land);

  const close = async () => {
    await opened;
    const targets = closing?.();
    const shown = targets?.media ? targets.media() : media;
    const returnTo = targets?.origin ? targets.origin(origin) : origin;
    const page = shown && returnTo?.isConnected && visible(returnTo.getBoundingClientRect()) ? pictureBox(returnTo) : null;
    if (!page || !shown) {
      await Promise.all([fadeOut(backdrop, fadeDuration), fadeOut(panel, fadeDuration)].map(animation => animation ? finished(animation) : undefined));
      return;
    }
    const from = pictureBox(shown);
    const back = flightCopy(shown, from, layerAbove(surface));
    shown.style.visibility = 'hidden';
    const flightBack = track(back.animate([{ transform: 'none' }, { transform: flightTransform(page, from) }], { duration, easing: exit, fill: 'forwards' }));
    fadeOut(backdrop, duration);
    fadeOut(panel, fadeDuration || duration);
    await finished(flightBack);
    back.remove();
  };
  return {
    opened,
    close,
    cancel: () => { running.forEach(animation => animation.cancel()); land(); document.querySelectorAll('.lightbox-flight').forEach(node => node.remove()); },
  };
}

/** Swipe down on the picture to close on a touch screen: the panel follows the finger, a long or fast pull closes it. */
export function swipeToClose(panel: HTMLElement, backdrop: HTMLElement | null, close: () => void): () => void {
  let start: { y: number; at: number; id: number } | null = null;
  let offset = 0;
  const reset = () => {
    panel.style.transform = '';
    panel.style.transition = '';
    if (backdrop) backdrop.style.opacity = '';
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !(event.target instanceof Element) || !event.target.closest('[data-lightbox-media]')) return;
    start = { y: event.clientY, at: performance.now(), id: event.pointerId };
    offset = 0;
  };
  const move = (event: PointerEvent) => {
    if (!start || event.pointerId !== start.id) return;
    offset = Math.max(0, event.clientY - start.y);
    panel.style.transform = `translateY(${offset}px)`;
    if (backdrop) backdrop.style.opacity = String(Math.max(0.2, 1 - offset / 400));
  };
  const up = (event: PointerEvent) => {
    if (!start || event.pointerId !== start.id) return;
    const speed = offset / Math.max(1, performance.now() - start.at);
    start = null;
    if (offset > 96 || (offset > 24 && speed > 0.6)) { close(); return; }
    panel.style.transition = `transform var(--motion-fast) var(--motion-ease)`;
    panel.style.transform = '';
    if (backdrop) backdrop.style.opacity = '';
    window.setTimeout(reset, motionMs('--motion-fast'));
  };
  panel.addEventListener('pointerdown', down, { passive: true });
  panel.addEventListener('pointermove', move, { passive: true });
  panel.addEventListener('pointerup', up, { passive: true });
  panel.addEventListener('pointercancel', up, { passive: true });
  return () => {
    panel.removeEventListener('pointerdown', down);
    panel.removeEventListener('pointermove', move);
    panel.removeEventListener('pointerup', up);
    panel.removeEventListener('pointercancel', up);
    reset();
  };
}
