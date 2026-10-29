import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motionEasing, motionMs, prefersReducedMotion } from '../../shared/ui/motionTokens';
import { registerLightboxModule } from '../../shared/ui/lightboxIntent';
import type { MediaLightboxController } from './mediaLightboxController';

/**
 * The gestures are a chunk of their own: the lightbox opens, zooms from the
 * thumbnail and pages with its buttons and arrow keys without it, and it is
 * fetched at idle on every page that can open a lightbox, long before a finger
 * lands on the picture.
 */
const loadController = () => import('./mediaLightboxController');
registerLightboxModule('media-lightbox', loadController, { idle: true });

type PagingInput = {
  stageRef: RefObject<HTMLElement | null>;
  trackRef: RefObject<HTMLElement | null>;
  index: number;
  count: number;
  /** The picture on show. */
  item: { kind?: 'image' | 'video'; alt: string };
  onIndexChange: (index: number) => void;
  /** Closes the lightbox like Esc does (ModalSurface fills it). */
  requestCloseRef: RefObject<(() => void) | null>;
};

/**
 * What MediaLightbox does when its picture changes: the page turn (the picture
 * track slides over `--motion-base`, scaled to the distance left, then the
 * parent makes the neighbour the picture on show), the gesture controller on
 * the stage, and the announcement a screen reader hears.
 */
export function useMediaLightboxPaging({ stageRef, trackRef, index, count, item, onIndexChange, requestCloseRef }: PagingInput) {
  const controllerRef = useRef<MediaLightboxController | null>(null);
  const alive = useRef(true);
  const indexRef = useRef(index);
  const latest = useRef({ count, item, onIndexChange });
  // What the handlers below read: the latest render's, synced as it commits.
  useLayoutEffect(() => {
    indexRef.current = index;
    latest.current = { count, item, onIndexChange };
  });
  const turning = useRef<Animation | null>(null);
  const turned = useRef<Animation | null>(null);
  const queued = useRef(0);
  const shownIndex = useRef(index);
  const [announcement, setAnnouncement] = useState('');

  /**
   * Turns the page by `step` after `travelled` px of drag. Turns asked for
   * while one is under way add up and follow it at once; a key turns at once.
   */
  const page = useCallback((step: number, travelled = 0, instant = false) => {
    if (latest.current.count < 2) return;
    if (turning.current) { queued.current += step; return; }
    const total = latest.current.count;
    const target = (((indexRef.current + step) % total) + total) % total;
    let done = false;
    const finish = () => {
      if (done || !alive.current) return;
      done = true;
      turning.current = null;
      indexRef.current = target;
      latest.current.onIndexChange(target);
    };
    const track = trackRef.current;
    const stage = stageRef.current;
    const width = stage?.clientWidth ?? 0;
    if (instant || Math.abs(step) !== 1 || !stage || !track?.animate || !width || prefersReducedMotion()) { finish(); return; }
    // The neighbour waits one stage width and a gap away.
    const reach = width + (Number.parseFloat(getComputedStyle(stage).getPropertyValue('--media-lightbox-gap')) || 0);
    const distance = Math.abs(-step * reach - travelled);
    const duration = Math.max(motionMs('--motion-instant'), motionMs('--motion-base') * (distance / reach));
    const animation = track.animate(
      [{ transform: `translate3d(${travelled}px, 0, 0)` }, { transform: `translate3d(${-step * reach}px, 0, 0)` }],
      { duration, easing: motionEasing('--motion-ease'), fill: 'forwards' },
    );
    turned.current = animation;
    turning.current = animation;
    animation.finished.then(finish, () => undefined);
  }, [stageRef, trackRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    alive.current = true;
    let controller: MediaLightboxController | null = null;
    let stopped = false;
    void loadController().then(({ MediaLightboxController: Controller }) => {
      if (stopped) return;
      controller = new Controller(stage, {
        isImage: () => latest.current.item.kind !== 'video',
        canPage: () => latest.current.count > 1,
        busy: () => turning.current !== null,
        page: (step, travelled) => page(step, travelled),
        close: () => requestCloseRef.current?.(),
      });
      controllerRef.current = controller;
      stage.dataset.gestures = '';
    }).catch(() => undefined); // A chunk that cannot load leaves the buttons and keys, which need none.
    return () => {
      stopped = true;
      alive.current = false;
      controller?.destroy();
      controllerRef.current = null;
      delete stage.dataset.gestures;
    };
  }, [page, stageRef, requestCloseRef]);

  // Another picture is on show: it stands at rest where the track brought it, and a screen reader hears which one.
  useLayoutEffect(() => {
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    turned.current?.cancel();
    turned.current = null;
    turning.current = null;
    controllerRef.current?.reset();
    // Reduced motion: no travel; the new picture fades in.
    const track = trackRef.current;
    if (track?.animate && prefersReducedMotion()) {
      track.animate([{ opacity: 0 }, { opacity: 1 }], { duration: motionMs('--motion-fast'), easing: motionEasing('--motion-ease') });
    }
    setAnnouncement(`${item.kind === 'video' ? 'Видео' : 'Картинка'} ${index + 1} из ${count}: ${item.alt}`);
    const waiting = queued.current;
    queued.current = 0;
    if (waiting) page(waiting);
  }, [index, count, item.kind, item.alt, page, trackRef]);

  return { page, controllerRef, announcement };
}
