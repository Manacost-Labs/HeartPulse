type DeckViewApi = NonNullable<typeof window.HSReplayDeckView>;

let deckViewLoader: Promise<DeckViewApi> | null = null;

export function loadedDeckView(): DeckViewApi | null {
  if (typeof window === 'undefined') return null;
  return window.HSReplayDeckView?.renderDeck ? window.HSReplayDeckView : null;
}

/**
 * Loads the vendored HSReplay deck renderer (a UMD script that defines
 * `window.HSReplayDeckView`) once per document. A failed chunk is forgotten,
 * so the next caller retries.
 */
export function loadDeckView(): Promise<DeckViewApi> {
  const loaded = loadedDeckView();
  if (loaded) return Promise.resolve(loaded);
  if (!deckViewLoader) {
    deckViewLoader = import('./hsReplayDeckViewVendor')
      .then(() => {
        const api = loadedDeckView();
        if (!api) throw new Error('HSReplay DeckView API is unavailable');
        return api;
      })
      .catch(cause => {
        deckViewLoader = null;
        throw cause;
      });
  }
  return deckViewLoader;
}
