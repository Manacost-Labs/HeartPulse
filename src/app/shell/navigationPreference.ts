/**
 * The desktop sidebar's compact (icon rail) preference. The layout's head
 * script applies the remembered choice to `<html>` before the first paint, so
 * the workspace never shifts after hydration; React only reads and toggles
 * the attribute. Storage may be unavailable (private mode): the rail then
 * starts expanded and the choice lasts for the page's lifetime.
 */
export const COMPACT_NAVIGATION_KEY = 'hp:nav:compact';
export const COMPACT_NAVIGATION_ATTRIBUTE = 'data-nav-compact';

/** Inline head script; it must stay tiny and never throw. */
export const COMPACT_NAVIGATION_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(COMPACT_NAVIGATION_KEY)})==='1')document.documentElement.setAttribute(${JSON.stringify(COMPACT_NAVIGATION_ATTRIBUTE)},'')}catch(e){}`;

const listeners = new Set<() => void>();

export function subscribeCompactNavigation(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function readCompactNavigation(): boolean {
  return document.documentElement.hasAttribute(COMPACT_NAVIGATION_ATTRIBUTE);
}

export function setCompactNavigation(compact: boolean) {
  document.documentElement.toggleAttribute(COMPACT_NAVIGATION_ATTRIBUTE, compact);
  try {
    if (compact) localStorage.setItem(COMPACT_NAVIGATION_KEY, '1');
    else localStorage.removeItem(COMPACT_NAVIGATION_KEY);
  } catch { /* the choice lasts for this page */ }
  listeners.forEach(listener => listener());
}
