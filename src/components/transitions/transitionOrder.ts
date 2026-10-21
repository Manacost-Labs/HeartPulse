import { useState } from 'react';

/** Which way a change goes: forward to a later button (tab, mode), back to an earlier one. */
export type TransitionDirection = 'forward' | 'back';

/** The order of the Стандарт / Вольный switch on every page: Вольный is forward. */
export const MODE_ORDER = ['standard', 'wild'] as const;

/** forward when `next` comes after `previous` in `order` (a tab to the right, the next mode), else back. */
export function switchDirection<T>(order: readonly T[], previous: T, next: T): TransitionDirection {
  return order.indexOf(next) < order.indexOf(previous) ? 'back' : 'forward';
}

/**
 * The direction of the last change of `value` along `order` (tabs left to
 * right, Стандарт → Вольный). Kept apart from the preset engine, so a page
 * that only needs the direction does not load it.
 */
export function useSwitchDirection<T>(value: T, order: readonly T[]): TransitionDirection {
  const [last, setLast] = useState({ value, direction: 'forward' as TransitionDirection });
  if (Object.is(last.value, value)) return last.direction;
  const direction = switchDirection(order, last.value, value);
  setLast({ value, direction });
  return direction;
}
