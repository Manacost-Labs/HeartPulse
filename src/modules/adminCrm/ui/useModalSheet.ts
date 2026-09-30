import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])';

/** Modal contract: focus moves into the sheet, Tab stays inside, Escape closes, focus returns to the trigger. */
export function useModalSheet(sheetRef: RefObject<HTMLElement | null>, initialFocusRef: RefObject<HTMLElement | null>, onClose: () => void) {
  // Read through a ref so a new callback identity never re-runs the focus and scroll-lock setup.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    initialFocusRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Another dialog (e.g. the access dialog opened from the card) may already own focus.
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) previous?.focus({ preventScroll: true });
    };
  }, [initialFocusRef, sheetRef]);
}
