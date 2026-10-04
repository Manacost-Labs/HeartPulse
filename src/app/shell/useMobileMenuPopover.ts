'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';

const supportsPopover = (element: HTMLElement) => typeof element.showPopover === 'function';

/**
 * The mobile drawer is a native `popover`, so its toggle opens it before React
 * hydrates. After hydration the shell's `open` state is the source of truth:
 * this mirrors it onto the popover, follows the closes the browser makes on
 * its own (Escape, a tap outside) and adopts a drawer opened before hydration.
 * Public pages can come back from the back/forward cache exactly as they were
 * left, so the drawer also closes as the page leaves (`pagehide`, rendered
 * synchronously so the scroll lock is released before the page is frozen)
 * and again on a restore, in case the browser kept a frame from before: Back
 * never lands on an open, scroll-locked drawer. Browsers without popovers
 * show the drawer through `data-open` only.
 */
export function useMobileMenuPopover(open: boolean, menuRef: RefObject<HTMLElement | null>, setOpen: (value: boolean) => void) {
  // The state last pushed to the popover. A `toggle` event that matches it is
  // the echo of that push (toggle events arrive a task later) and must not
  // override a newer state; any other is the browser's own open or close.
  // Starting at `false` keeps the first run from closing a drawer the visitor
  // opened before hydration.
  const applied = useRef(open);

  useEffect(() => {
    const menu = menuRef.current;
    // Closed at once, without the fade: a fade frozen by the back/forward
    // cache would play out over the restored page.
    const close = () => {
      const surfaces = [menu, menu?.nextElementSibling].filter(Boolean) as HTMLElement[];
      surfaces.forEach(surface => surface.style.setProperty('transition', 'none'));
      flushSync(() => setOpen(false));
      if (menu && supportsPopover(menu) && menu.matches(':popover-open')) {
        applied.current = false;
        menu.hidePopover();
      }
      surfaces.forEach(surface => { void getComputedStyle(surface).display; surface.style.removeProperty('transition'); });
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) close(); };
    const onToggle = (event: Event) => {
      const opened = (event as ToggleEvent).newState === 'open';
      if (opened !== applied.current) setOpen(opened);
    };
    addEventListener('pagehide', close);
    addEventListener('pageshow', onPageShow);
    const popover = menu && supportsPopover(menu) ? menu : null;
    popover?.addEventListener('toggle', onToggle);
    if (popover?.matches(':popover-open')) setOpen(true);
    return () => {
      removeEventListener('pagehide', close);
      removeEventListener('pageshow', onPageShow);
      popover?.removeEventListener('toggle', onToggle);
    };
  }, [menuRef, setOpen]);

  useEffect(() => {
    const menu = menuRef.current;
    if (applied.current === open || !menu || !supportsPopover(menu)) return;
    applied.current = open;
    const shown = menu.matches(':popover-open');
    if (open && !shown) menu.showPopover();
    else if (!open && shown) menu.hidePopover();
  }, [open, menuRef]);
}
