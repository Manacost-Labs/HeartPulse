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

const MODE_ATTRIBUTE_JSON = JSON.stringify(MODE_NAVIGATION_ATTRIBUTE);

/**
 * Inline head script. First the remembered mode goes to `<html>`. Then the pages of Standard
 * that the server cannot tell apart (the prerendered HTML has no query) get the mode of their
 * address: `?format=wild` is Wild, any other is Standard, and patch notes keep Wild only if
 * Wild was the choice. Pages whose path names the format or the mode are marked by the server;
 * the same rules are in `routing/navigationPlace.ts`, and a test runs this script against them.
 */
export const MODE_NAVIGATION_SCRIPT = `(function(){var m;try{m=localStorage.getItem(${JSON.stringify(MODE_NAVIGATION_KEY)});if(${MODES.map(mode => `m===${JSON.stringify(mode)}`).join('||')})document.documentElement.setAttribute(${MODE_ATTRIBUTE_JSON},m)}catch(e){}try{var p=location.pathname;if(/^\\/standard\\//.test(p)&&!/^\\/standard\\/(?:(?:cards|archetypes|meta)\\/(?:wild|standard)|vicious-gold)(?:\\/|$)/.test(p))document.documentElement.setAttribute(${MODE_ATTRIBUTE_JSON},(/^\\/standard\\/patches(?:\\/|$)/.test(p)?m==='wild':/[?&]format=wild(?:&|$)/.test(location.search))?'wild':'standard')}catch(e){}})();`;

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
