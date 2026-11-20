import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/**
 * False in server HTML and while the page hydrates, true afterwards. Controls that only work with a script
 * stay inert until then, so a visitor without JavaScript has no focusable element that does nothing.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
