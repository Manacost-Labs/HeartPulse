'use client';
import { useEffect, type RefObject } from 'react';

export function usePublicMenuFocus(open: boolean, menuRef: RefObject<HTMLElement | null>, toggleRef: RefObject<HTMLButtonElement | null>, setOpen: (value: boolean) => void) {
  useEffect(() => {
    if (!open) return undefined;
    const menu = menuRef.current;
    if (!menu) return undefined;
    // Read at each use: the banners of the mode switch are focusable only while its panel is open.
    const focusables = () => Array.from(menu.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),summary'))
      .filter(element => element.checkVisibility());
    focusables()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        toggleRef.current?.focus();
        setOpen(false);
      }
      const focusable = focusables();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.key !== 'Tab' || !first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, menuRef, toggleRef, setOpen]);
}
