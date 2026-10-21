'use client';
import { useEffect, useRef, type RefObject } from 'react';

/** How far a finger travels before the drawer decides between a swipe and a scroll. */
const DECIDE_PX = 10;
/** A swipe closes past this share of the drawer's width, or when flicked faster than FLICK_PX_PER_MS. */
const CLOSE_SHARE = 0.3;
const FLICK_PX_PER_MS = 0.5;

/**
 * The phone drawer follows a horizontal swipe towards its edge and closes past
 * a third of its width or on a flick; a vertical move stays a native scroll
 * (`touch-action: pan-y`). It also keeps its own scroll position between
 * openings and, on the first opening, brings the current page into view.
 */
export function useDrawerGesture(open: boolean, menuRef: RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  const scrollTop = useRef<number | null>(null);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return undefined;
    let start: { x: number; y: number; time: number; id: number } | null = null;
    let dragging = false;
    let offset = 0;
    // The lifted finger must not also activate the link the swipe started on.
    let swallowClick = false;
    const reset = () => {
      menu.style.removeProperty('translate');
      menu.style.removeProperty('transition');
      start = null;
      dragging = false;
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' || !event.isPrimary) return;
      start = { x: event.clientX, y: event.clientY, time: event.timeStamp, id: event.pointerId };
      dragging = false;
      swallowClick = false;
      offset = 0;
    };
    const move = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!dragging) {
        if (Math.abs(dy) > DECIDE_PX && Math.abs(dy) >= Math.abs(dx)) { start = null; return; }
        if (dx > -DECIDE_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        dragging = true;
        menu.style.setProperty('transition', 'none');
      }
      offset = Math.min(0, dx);
      menu.style.setProperty('translate', `${offset}px 0`);
    };
    const up = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const wasDragging = dragging;
      const velocity = offset / Math.max(1, event.timeStamp - start.time);
      const shouldClose = wasDragging && (offset < -menu.offsetWidth * CLOSE_SHARE || velocity < -FLICK_PX_PER_MS);
      // Back to the stylesheet's transition: the drawer slides on from where the finger left it.
      reset();
      if (!wasDragging) return;
      swallowClick = true;
      if (shouldClose) closeRef.current();
    };
    const click = (event: Event) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };
    menu.addEventListener('pointerdown', down);
    menu.addEventListener('pointermove', move);
    menu.addEventListener('pointerup', up);
    menu.addEventListener('pointercancel', reset);
    menu.addEventListener('click', click, true);
    return () => {
      reset();
      menu.removeEventListener('pointerdown', down);
      menu.removeEventListener('pointermove', move);
      menu.removeEventListener('pointerup', up);
      menu.removeEventListener('pointercancel', reset);
      menu.removeEventListener('click', click, true);
    };
  }, [menuRef]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return undefined;
    if (!open) return undefined;
    // The drawer is laid out once it is shown; restore on the next frame.
    const frame = requestAnimationFrame(() => {
      if (scrollTop.current !== null) { menu.scrollTop = scrollTop.current; return; }
      const current = menu.querySelector<HTMLElement>('[aria-current="page"]');
      if (!current) return;
      const box = current.getBoundingClientRect();
      const frameBox = menu.getBoundingClientRect();
      if (box.bottom > frameBox.bottom || box.top < frameBox.top) {
        menu.scrollTop += box.top - frameBox.top - (frameBox.height - box.height) / 2;
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      scrollTop.current = menu.scrollTop;
    };
  }, [open, menuRef]);
}
