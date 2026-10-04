'use client';
import { useEffect, useRef, type RefObject } from 'react';

const supportsPopover = (element: HTMLElement) => typeof element.showPopover === 'function';

/**
 * The mobile drawer is a native `popover`, so its toggle opens it before React
 * hydrates. After hydration the shell's `open` state is the source of truth:
 * this mirrors it onto the popover, follows the closes the browser makes on
 * its own (Escape, a tap outside), adopts a drawer opened before hydration and
 * closes the drawer when a page returns from the back/forward cache, where it
 * would otherwise come back open with the page scroll-locked. Browsers without
 * popovers show the drawer through `data-open` only.
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
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) setOpen(false); };
    const onToggle = (event: Event) => {
      const opened = (event as ToggleEvent).newState === 'open';
      if (opened !== applied.current) setOpen(opened);
    };
    addEventListener('pageshow', onPageShow);
    const popover = menu && supportsPopover(menu) ? menu : null;
    popover?.addEventListener('toggle', onToggle);
    if (popover?.matches(':popover-open')) setOpen(true);
    return () => {
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
