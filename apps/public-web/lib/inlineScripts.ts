import { ANALYTICS_LOADER } from './analyticsLoader';
import { AUTH_PREFETCH } from './authPrefetch';
import { SEARCH_SCRIPT } from './unavailablePage';
import { COMPACT_NAVIGATION_SCRIPT, MODE_NAVIGATION_SCRIPT } from '@/src/app/shell/navigationPreference';
import { DECK_LAYOUT_RESTORE_SCRIPT } from '@/src/features/deckViews/deckLayoutStorage';

/** The non-executable block that carries the runtime switches; `RUNTIME_CONFIG_SCRIPT` reads it. */
export const RUNTIME_CONFIG_ELEMENT_ID = 'hp-runtime-config';

/**
 * Publishes the switches of the preceding JSON block on `window`. The switches
 * change without a release, so they travel as data: this script stays the same
 * text on every document and keeps one Content-Security-Policy hash.
 */
const RUNTIME_CONFIG_SCRIPT = 'try{window.__ARENA_RUNTIME_CONFIG__=JSON.parse('
  + `document.getElementById(${JSON.stringify(RUNTIME_CONFIG_ELEMENT_ID)}).textContent)}catch(e){}`;

/**
 * Every executable inline script of the Next.js documents. A page renders one
 * only through `ui/InlineScript.tsx` (the proxy's 503 page writes
 * `unavailableSearch` into its own HTML string), and `apps/public-web/inlineScriptHashes.json`
 * holds the sha256 of each source for the Content-Security-Policy
 * (`npm run csp:hashes` rewrites it; docs/specs/csp.md). The sources must be
 * constant: a value that varies per request belongs in a data block.
 */
export const INLINE_SCRIPTS = Object.freeze({
  navigation: COMPACT_NAVIGATION_SCRIPT + MODE_NAVIGATION_SCRIPT,
  authPrefetch: AUTH_PREFETCH,
  runtimeConfig: RUNTIME_CONFIG_SCRIPT,
  analytics: ANALYTICS_LOADER,
  deckLayoutRestore: DECK_LAYOUT_RESTORE_SCRIPT,
  unavailableSearch: SEARCH_SCRIPT,
});

export type InlineScriptId = keyof typeof INLINE_SCRIPTS;
