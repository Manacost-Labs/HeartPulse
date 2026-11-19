'use client';
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { motionEasing, motionMs, prefersReducedMotion } from '../../shared/ui/motionTokens';
import { modeOfTab, type TabId } from '../routing/navigationRoutes';
import {
  readNavigationMode, setNavigationMode, subscribeNavigationMode, type RememberedNavigationMode,
} from './navigationPreference';

const PANELS = 'details.hp-mode';

/** Closes every open mode panel; `focus` puts the keyboard back on its button. */
export function closeModePanels(focus = false) {
  for (const panel of document.querySelectorAll<HTMLDetailsElement>(`${PANELS}[open]`)) {
    panel.open = false;
    if (focus) panel.querySelector<HTMLElement>('summary')?.focus();
  }
}

/**
 * The mode the menu lists: the page's own, else the last chosen one (read from
 * `<html>`, where the head script put it before first paint; the server and
 * hydration render Standard, and CSS already shows the right list meanwhile).
 * A page that belongs to a mode becomes the remembered one.
 */
export function useNavigationMode(activeTab: TabId): RememberedNavigationMode {
  const stored = useSyncExternalStore(subscribeNavigationMode, readNavigationMode, () => 'standard' as const);
  const pageMode = modeOfTab(activeTab);
  useEffect(() => { if (pageMode) setNavigationMode(pageMode); }, [pageMode]);
  // The list of a new mode slides in. Read from <html>, which already shows the right list, so hydration never replays it.
  const shown = useRef<RememberedNavigationMode | null>(null);
  const current = pageMode ?? stored;
  useLayoutEffect(() => {
    const now = pageMode ?? readNavigationMode();
    const before = shown.current;
    shown.current = now;
    if (!before || before === now || prefersReducedMotion()) return;
    const duration = motionMs('--motion-base');
    if (!duration) return;
    for (const list of document.querySelectorAll<HTMLElement>('.hp-nav-list')) {
      if (list.getClientRects().length) {
        list.animate([{ opacity: 0, transform: 'translateX(8px)' }, { opacity: 1, transform: 'none' }], { duration, easing: motionEasing('--motion-ease') });
      }
    }
  }, [pageMode, stored]);
  return current;
}

/**
 * Behaviour on top of the native `<details>` mode switch: Escape closes it and
 * returns focus to its button (before the drawer's own Escape handler, so the
 * first press only closes the panel), and so does a press elsewhere, focus
 * moving out of it, or choosing a banner.
 */
export function useModePanels() {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !document.querySelector(`${PANELS}[open]`)) return;
      // The drawer is a native popover that Escape would close too; this press belongs to the banners.
      event.preventDefault();
      event.stopPropagation();
      closeModePanels(true);
    };
    const outside = (event: Event, next: EventTarget | null) => {
      if (!(next instanceof Element)) return;
      for (const panel of document.querySelectorAll<HTMLDetailsElement>(`${PANELS}[open]`)) {
        if (!panel.contains(next)) panel.open = false;
      }
      void event;
    };
    const pointerdown = (event: PointerEvent) => outside(event, event.target);
    const focusout = (event: FocusEvent) => outside(event, event.relatedTarget);
    const click = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-mode-card]')) closeModePanels();
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('pointerdown', pointerdown, true);
    document.addEventListener('focusout', focusout);
    document.addEventListener('click', click);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('pointerdown', pointerdown, true);
      document.removeEventListener('focusout', focusout);
      document.removeEventListener('click', click);
    };
  }, []);
}
