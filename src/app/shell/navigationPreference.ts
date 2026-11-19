/**
 * The desktop sidebar's compact (icon rail) preference. The layout's head
 * script applies the remembered choice to `<html>` before the first paint, so
 * the workspace never shifts after hydration; React only reads and toggles
 * the attribute. Storage may be unavailable (private mode): the rail then
 * starts expanded and the choice lasts for the page's lifetime.
 */
import { NAVIGATION_MODES, type NavigationModeId } from '../routing/navigationData';

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

/**
 * The last chosen mode of the menu (any of `NAVIGATION_MODES`).
 * A page that belongs to a mode shows that mode's list; every other page (home,
 * help, profile) shows this one. The head script writes it to `<html>` before the
 * first paint, so the list never flashes; without storage or script the menu
 * lists Standard.
 */
export const MODE_NAVIGATION_KEY = 'hp:nav:mode';
export const MODE_NAVIGATION_ATTRIBUTE = 'data-nav-mode';
const MODES: readonly NavigationModeId[] = NAVIGATION_MODES.map(mode => mode.id);
export type RememberedNavigationMode = NavigationModeId;

export const MODE_NAVIGATION_SCRIPT = `try{var m=localStorage.getItem(${JSON.stringify(MODE_NAVIGATION_KEY)});if(${MODES.map(mode => `m===${JSON.stringify(mode)}`).join('||')})document.documentElement.setAttribute(${JSON.stringify(MODE_NAVIGATION_ATTRIBUTE)},m)}catch(e){}`;

const modeListeners = new Set<() => void>();

export function subscribeNavigationMode(listener: () => void) {
  modeListeners.add(listener);
  return () => { modeListeners.delete(listener); };
}

export function readNavigationMode(): RememberedNavigationMode {
  const value = document.documentElement.getAttribute(MODE_NAVIGATION_ATTRIBUTE);
  return MODES.find(mode => mode === value) ?? NAVIGATION_MODES[0].id;
}

export function setNavigationMode(mode: RememberedNavigationMode) {
  if (document.documentElement.getAttribute(MODE_NAVIGATION_ATTRIBUTE) === mode) return;
  document.documentElement.setAttribute(MODE_NAVIGATION_ATTRIBUTE, mode);
  try { localStorage.setItem(MODE_NAVIGATION_KEY, mode); } catch { /* the choice lasts for this page */ }
  modeListeners.forEach(listener => listener());
}
