/**
 * Lightbox intent: a lightbox opens at once when its full-size picture (and,
 * for a lazily loaded lightbox, its code) is already on its way when the
 * reader presses. A trigger marks what it opens:
 *
 * - `data-lightbox-src` (+ `data-lightbox-srcset`, `data-lightbox-sizes`): the
 *   full-size picture, preloaded and decoded on hover, focus or touch;
 * - `data-lightbox-module`: a key registered with `registerLightboxModule`,
 *   whose chunk starts downloading on the same intent.
 *
 * `installLightboxIntent` adds one set of passive document listeners for the
 * whole page; they also remember the element a press started on, which
 * ModalSurface uses as the zoom's origin in browsers that do not focus a
 * pressed button.
 */
const decoded = new Set<string>();
const requested = new Set<string>();
const modules = new Map<string, () => Promise<unknown>>();
let pressed: { element: Element; at: number } | null = null;
let installed = false;

/** Preloads and decodes one picture; repeated calls for the same source do nothing. */
export function preloadLightboxImage(src: string, srcSet?: string | null, sizes?: string | null): void {
  const key = srcSet ? `${src} ${srcSet}` : src;
  if (!src || requested.has(key) || typeof Image === 'undefined') return;
  requested.add(key);
  const image = new Image();
  image.decoding = 'async';
  if (sizes) image.sizes = sizes;
  if (srcSet) image.srcset = srcSet;
  image.src = src;
  image.decode().then(() => { decoded.add(src); }, () => { requested.delete(key); });
}

/** True once `src` has been preloaded and decoded: a lightbox may show it on its first frame. */
export function lightboxImageDecoded(src: string | null | undefined): boolean {
  return Boolean(src && decoded.has(src));
}

/**
 * A lazily loaded lightbox registers its chunk under `key`;
 * `data-lightbox-module="<key>"` triggers warm it. Registering installs the
 * page's intent listeners (a lightbox's own module, ModalSurface, does the same).
 */
export function registerLightboxModule(key: string, load: () => Promise<unknown>, { idle = false } = {}): void {
  modules.set(key, load);
  installLightboxIntent();
  // A lightbox that most visitors of the page open (a card sheet behind every
  // picture) downloads at idle: on a slow phone network even a tap's head start
  // is shorter than the chunk.
  if (idle && typeof window !== 'undefined') {
    const warmNow = () => { load().catch(() => undefined); };
    if (window.requestIdleCallback) window.requestIdleCallback(warmNow, { timeout: 4000 });
    else window.setTimeout(warmNow, 2000);
  }
}

/** The element the latest press started on, within `windowMs`. */
export function recentPress(windowMs: number): Element | null {
  return pressed && performance.now() - pressed.at < windowMs ? pressed.element : null;
}

function warm(event: Event): void {
  if (event.type === 'pointerdown' && event.target instanceof Element) pressed = { element: event.target, at: performance.now() };
  const trigger = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-lightbox-src], [data-lightbox-module]') : null;
  if (!trigger) return;
  const { lightboxSrc, lightboxSrcset, lightboxSizes, lightboxModule } = trigger.dataset;
  if (lightboxSrc) preloadLightboxImage(lightboxSrc, lightboxSrcset, lightboxSizes);
  const load = lightboxModule ? modules.get(lightboxModule) : undefined;
  if (load) load().catch(() => undefined);
}

/** Installs the page's lightbox intent listeners once (hover, focus, touch, press). */
export function installLightboxIntent(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const options = { capture: true, passive: true } as const;
  for (const type of ['pointerover', 'focusin', 'touchstart', 'pointerdown']) document.addEventListener(type, warm, options);
}
