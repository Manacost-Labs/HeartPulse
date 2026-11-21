/** One choice for every deck list on the site; the fun-decks key is its older name. */
export const DECK_LAYOUT_STORAGE_KEY = 'hp:deck-layout';
export const LEGACY_DECK_LAYOUT_STORAGE_KEY = 'hp:fun-decks:layout';

/**
 * Inline script for a page whose server HTML is the tile view: it runs before
 * the deck list is parsed and marks `<html data-deck-layout-restore>` when this
 * browser keeps another view («Строки», «Картинки»). The page's CSS then keeps
 * the server tiles invisible (their space stays) until the page hydrates and
 * draws the kept view in the same frame (`useDeckLayout`). No storage, a
 * blocked one or the tile view: nothing is marked, the HTML shows as served.
 */
export const DECK_LAYOUT_RESTORE_SCRIPT = 'try{var s=window.localStorage,'
  + `l=s.getItem(${JSON.stringify(DECK_LAYOUT_STORAGE_KEY)});if(l===null)l=s.getItem(${JSON.stringify(LEGACY_DECK_LAYOUT_STORAGE_KEY)});`
  + 'if(l==="rows"||l==="images")document.documentElement.dataset.deckLayoutRestore=l}catch(e){}';

/** Ends what `DECK_LAYOUT_RESTORE_SCRIPT` marked, once the kept view is drawn. */
export function clearDeckLayoutRestore(): void {
  delete document.documentElement.dataset.deckLayoutRestore;
}
