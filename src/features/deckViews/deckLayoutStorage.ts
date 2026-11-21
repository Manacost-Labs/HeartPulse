/** One choice for every deck list on the site; the fun-decks key is its older name. */
export const DECK_LAYOUT_STORAGE_KEY = 'hp:deck-layout';
export const LEGACY_DECK_LAYOUT_STORAGE_KEY = 'hp:fun-decks:layout';

/** How long the server tiles may stay unseen: a page whose scripts never run shows them after this. */
export const DECK_LAYOUT_RESTORE_LIMIT_MS = 3_000;

/**
 * Inline script for a page whose server HTML is the tile view: it runs before
 * the deck list is parsed and marks `<html data-deck-layout-restore>` when this
 * browser keeps another view («Строки», «Картинки»). The page's CSS then keeps
 * the server tiles invisible (their space stays) until the page hydrates and
 * draws the kept view in the same frame (`useDeckLayout`). No storage, a
 * blocked one or the tile view: nothing is marked, the HTML shows as served.
 * The script drops its own mark after `DECK_LAYOUT_RESTORE_LIMIT_MS`, so a page
 * whose bundle fails to load or to run still shows its tiles.
 */
export const DECK_LAYOUT_RESTORE_SCRIPT = 'try{var s=window.localStorage,d=document.documentElement,'
  + `l=s.getItem(${JSON.stringify(DECK_LAYOUT_STORAGE_KEY)});if(l===null)l=s.getItem(${JSON.stringify(LEGACY_DECK_LAYOUT_STORAGE_KEY)});`
  + 'if(l==="rows"||l==="images"){d.dataset.deckLayoutRestore=l;'
  + `setTimeout(function(){delete d.dataset.deckLayoutRestore},${DECK_LAYOUT_RESTORE_LIMIT_MS})}}catch(e){}`;

/** Ends what `DECK_LAYOUT_RESTORE_SCRIPT` marked, once the kept view is drawn. */
export function clearDeckLayoutRestore(): void {
  delete document.documentElement.dataset.deckLayoutRestore;
}
