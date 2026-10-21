'use client';
import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { readCompactNavigation, setCompactNavigation, subscribeCompactNavigation } from './navigationPreference';

const MENU_ROOTS = '.arena-sidebar, #arena-mobile-menu';
/** A press that never became a navigation (the click went elsewhere) is released after this. */
const PRESS_SAFETY_MS = 3000;

const clearPressed = () => {
  for (const link of document.querySelectorAll('[data-nav-pressed]')) link.removeAttribute('data-nav-pressed');
};

/**
 * Marks the menu link under a primary press at once (`data-nav-pressed`), so
 * the current-page indicator moves on pointerdown rather than after the click
 * and the router transition. It is a DOM attribute, not React state: no render
 * stands between the press and the next frame. A scroll gesture cancels the
 * press, releasing the pointer elsewhere drops it, and the committed (or
 * optimistic) current page replaces it.
 */
export function usePressedNavigationLink(activeKey: string) {
  useEffect(() => {
    let pressed: Element | null = null;
    let safety: ReturnType<typeof setTimeout> | undefined;
    const release = () => { clearTimeout(safety); pressed = null; clearPressed(); };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[data-nav-link]') : null;
      if (!link?.closest(MENU_ROOTS) || link.getAttribute('aria-current') === 'page') return;
      release();
      pressed = link;
      link.setAttribute('data-nav-pressed', '');
      safety = setTimeout(release, PRESS_SAFETY_MS);
    };
    const up = (event: PointerEvent) => {
      if (pressed && !(event.target instanceof Node && pressed.contains(event.target))) release();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', release, true);
    document.addEventListener('dragstart', release, true);
    return () => {
      release();
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', release, true);
      document.removeEventListener('dragstart', release, true);
    };
  }, []);
  // The new current item paints in the same frame as the press is dropped.
  useLayoutEffect(() => { clearPressed(); }, [activeKey]);
}

/** The compact desktop rail, remembered per browser; the server and hydration render it expanded. */
export function useCompactNavigation(): [boolean, () => void] {
  const compact = useSyncExternalStore(subscribeCompactNavigation, readCompactNavigation, () => false);
  return [compact, () => setCompactNavigation(!readCompactNavigation())];
}

/**
 * One tooltip for the whole compact rail, placed next to the hovered or
 * keyboard-focused item. The rail scrolls, so a tooltip inside an item would
 * be clipped; this one is `position: fixed` and hidden while the rail
 * scrolls. Screen readers keep the items' own names: it is aria-hidden.
 */
export function useNavigationTooltip(compact: boolean) {
  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>('.arena-sidebar');
    const tooltip = sidebar?.querySelector<HTMLElement>('.arena-nav-tooltip');
    if (!compact || !sidebar || !tooltip) return undefined;
    const show = (event: Event) => {
      const item = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-nav-tip]') : null;
      if (!item || (event.type === 'focusin' && !item.matches(':focus-visible'))) return;
      const box = item.getBoundingClientRect();
      tooltip.textContent = item.dataset.navTip ?? '';
      tooltip.style.setProperty('--nav-tip-x', `${Math.round(sidebar.getBoundingClientRect().right)}px`);
      tooltip.style.setProperty('--nav-tip-y', `${Math.round(box.top + box.height / 2)}px`);
      tooltip.dataset.visible = '';
    };
    const hide = (event: Event) => {
      const next = (event as PointerEvent | FocusEvent).relatedTarget;
      if (next instanceof Element && next.closest('[data-nav-tip]') === (event.target as Element).closest('[data-nav-tip]')) return;
      delete tooltip.dataset.visible;
    };
    const hideNow = () => { delete tooltip.dataset.visible; };
    sidebar.addEventListener('pointerover', show);
    sidebar.addEventListener('focusin', show);
    sidebar.addEventListener('pointerout', hide);
    sidebar.addEventListener('focusout', hide);
    sidebar.addEventListener('scroll', hideNow, { passive: true });
    sidebar.addEventListener('pointerdown', hideNow);
    return () => {
      hideNow();
      sidebar.removeEventListener('pointerover', show);
      sidebar.removeEventListener('focusin', show);
      sidebar.removeEventListener('pointerout', hide);
      sidebar.removeEventListener('focusout', hide);
      sidebar.removeEventListener('scroll', hideNow);
      sidebar.removeEventListener('pointerdown', hideNow);
    };
  }, [compact]);
}
