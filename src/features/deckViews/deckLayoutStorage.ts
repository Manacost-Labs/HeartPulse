/** One choice for every deck list on the site; the fun-decks key is its older name. */
export const DECK_LAYOUT_STORAGE_KEY = 'hp:deck-layout';
export const LEGACY_DECK_LAYOUT_STORAGE_KEY = 'hp:fun-decks:layout';

/** How long after the window's `load` the server tiles stay unseen when the page has not hydrated by then. */
export const DECK_LAYOUT_RESTORE_AFTER_LOAD_MS = 1_000;
/** The mark's limit from the script itself, for a window whose `load` never comes. */
export const DECK_LAYOUT_RESTORE_LIMIT_MS = 15_000;

/**
 * Inline script for a page whose server HTML is the tile view: it runs before
 * the deck list is parsed and marks `<html data-deck-layout-restore>` when this
 * browser keeps another view («Строки», «Картинки»). The page's CSS then keeps
 * the server tiles invisible (their space stays) until the page hydrates and
 * draws the kept view in the same frame (`useDeckLayout`), which drops the mark.
 * No storage, a blocked one or the tile view: nothing is marked, the HTML shows
 * as served. A page that never hydrates still shows its tiles: the window's
 * `load` comes also when its scripts fail or are blocked (they load before it),
 * and the mark goes `DECK_LAYOUT_RESTORE_AFTER_LOAD_MS` after it, or after
 * `DECK_LAYOUT_RESTORE_LIMIT_MS` at the latest. A slow bundle only delays `load`,
 * so its reader never sees the tiles before the kept view.
 */
export const DECK_LAYOUT_RESTORE_SCRIPT = 'try{var s=window.localStorage,d=document.documentElement,'
  + `l=s.getItem(${JSON.stringify(DECK_LAYOUT_STORAGE_KEY)});if(l===null)l=s.getItem(${JSON.stringify(LEGACY_DECK_LAYOUT_STORAGE_KEY)});`
  + 'if(l==="rows"||l==="images"){d.dataset.deckLayoutRestore=l;var c=function(){delete d.dataset.deckLayoutRestore};'
  + `window.addEventListener("load",function(){setTimeout(c,${DECK_LAYOUT_RESTORE_AFTER_LOAD_MS})});setTimeout(c,${DECK_LAYOUT_RESTORE_LIMIT_MS})}}catch(e){}`;

/** Ends what `DECK_LAYOUT_RESTORE_SCRIPT` marked, once the kept view is drawn. */
export function clearDeckLayoutRestore(): void {
  delete document.documentElement.dataset.deckLayoutRestore;
}
