/**
 * Where an address puts the reader in the menu: the mode whose list is shown and the item
 * that is highlighted in it. Standard and Wild are one set of pages in two formats, so for
 * a page of `/standard/…` the format of the address decides the mode: `?format=wild` or a
 * `/wild/` segment of the path is Wild, anything else is Standard. A page without a format
 * of its own (patch notes) keeps the one the reader chose last. The menu and the head script
 * of `shell/navigationPreference.ts` follow this table.
 */
import { readPageFormat } from '../../shared/navigation/pageFormat';
import { WILD_NAVIGATION_ITEMS, type NavigationModeId } from './navigationData';
import { TABS, modeOfTab, tabFromPath, type TabId } from './navigationRoutes';

export type WildItemId = (typeof WILD_NAVIGATION_ITEMS)[number]['id'];
/** Every item of the menu: a site route or its twin in the Wild list. */
export type MenuItemId = TabId | WildItemId;

export type NavigationPlace = {
  /** The mode whose list is shown; null when the address does not tell (home, help pages, or a format not known yet). */
  mode: NavigationModeId | null;
  /** The highlighted item of that list. */
  item: MenuItemId;
};

const WILD_OF: ReadonlyMap<string, WildItemId> = new Map(WILD_NAVIGATION_ITEMS.map(item => [item.twin, item.id]));
/** Standard pages that exist in both formats, so the address names the format. */
const FORMAT_BOUND_TABS: ReadonlySet<string> = new Set(WILD_NAVIGATION_ITEMS.filter(item => !('shared' in item)).map(item => item.twin));
const WILD_SEGMENT = /^\/standard\/(?:cards|archetypes|meta)\/wild(?:\/|$)/;

/**
 * `search` is the query of the address, or null while it is not known (the server and the
 * hydration render know the path only); `remembered` is the mode the reader chose last, or
 * null while it is not known. An unknown input never decides a mode.
 */
export function navigationPlace(path: string, search: string | null, remembered: NavigationModeId | null): NavigationPlace {
  const tab = tabFromPath(path);
  const clean = path.replace(/[?#].*$/, '').replace(/\/+$/, '');
  const mode = modeOfTab(tab);
  if (mode !== 'standard') return { mode, item: tab };
  if (FORMAT_BOUND_TABS.has(tab)) {
    const wild = WILD_SEGMENT.test(clean) || (search !== null && readPageFormat(search) === 'wild');
    if (wild) return { mode: 'wild', item: WILD_OF.get(tab) ?? tab };
    // A path alone does not rule out `?format=wild`.
    return { mode: search === null ? null : 'standard', item: tab };
  }
  if (!WILD_OF.has(tab)) return { mode: 'standard', item: tab };
  if (remembered === null) return { mode: null, item: tab };
  return remembered === 'wild' ? { mode: 'wild', item: WILD_OF.get(tab) ?? tab } : { mode: 'standard', item: tab };
}

/** The address of a menu item, for the menu's own click handler. */
export function pathOfMenuItem(id: MenuItemId): string {
  return TABS.find(route => route.id === id)?.path ?? WILD_NAVIGATION_ITEMS.find(item => item.id === id)?.path ?? '/';
}
