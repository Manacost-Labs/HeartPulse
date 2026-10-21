'use client';

import { useEffect, type RefObject } from 'react';
import { isInDismissIgnoredRegion } from './useDismissableLayer';

const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/** A radio stops Tab only when checked, or as the first of a group with nothing checked (the browser's own order). */
function isRadioStop(radio: HTMLInputElement, scope: HTMLElement) {
  if (radio.checked || !radio.name) return true;
  const group = Array.from(scope.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(radio.name)}"]`));
  return !group.some((r) => r.checked) && group[0] === radio;
}

export function getTabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) =>
      // Roving-tabindex items (inactive tabs, a combobox's toggle, a field's clear button) are not Tab stops.
      el.tabIndex >= 0 &&
      !el.closest('[inert]') &&
      el.getClientRects().length > 0 &&
      !(el instanceof HTMLInputElement && el.type === 'radio' && !isRadioStop(el, container)),
  );
}

// Only the most recently activated trap handles Tab (nested dialogs).
const traps: HTMLElement[] = [];

export interface FocusTrapOptions {
  initialFocusRef?: RefObject<HTMLElement | null>;
  restoreFocus?: boolean;
}

/** Keeps Tab focus inside `ref` while active and restores focus on release. */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  { initialFocusRef, restoreFocus = true }: FocusTrapOptions = {},
) {
  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    traps.push(container);

    const target = initialFocusRef?.current ?? getTabbables(container)[0] ?? container;
    target.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || traps[traps.length - 1] !== container) return;
      // A layer opened inside (a popover, a menu, a listbox) already moved focus itself.
      if (event.defaultPrevented) return;
      // Focus parked in a non-modal region above the modal (e.g. a toast reached via F8) may tab on there.
      if (isInDismissIgnoredRegion(document.activeElement)) return;
      const items = getTabbables(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      // Focus in another portaled layer that this one does not hold (a popover opened from the dialog): that layer
      // owns Tab; pulling focus back here would leave it open behind.
      const layer = current instanceof HTMLElement ? current.closest('[data-ui-portal]') : null;
      if (layer && !layer.contains(container) && !container.contains(layer)) return;
      const outside = !container.contains(current);
      if (event.shiftKey && (current === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      traps.splice(traps.indexOf(container), 1);
      if (restoreFocus && previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
    // initialFocusRef is read once on activation by design.
  }, [active, ref, restoreFocus]);
}
