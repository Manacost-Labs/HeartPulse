type PageNavigator = (path: string) => void;
let pageNavigator: PageNavigator | null = null;

/**
 * Installed by the application's router adapter. A later cleanup of an older
 * adapter never detaches its replacement.
 */
export function installPageNavigator(navigator: PageNavigator): () => void {
  pageNavigator = navigator;
  return () => { if (pageNavigator === navigator) pageNavigator = null; };
}

/**
 * Opens a same-site page from code that cannot render a link (an action that
 * may end in sign-in, a search result). The application router keeps the menu
 * and loaded code; without one this is a normal document navigation.
 */
export function openPage(path: string): void {
  if (pageNavigator) pageNavigator(path);
  else window.location.assign(path);
}
