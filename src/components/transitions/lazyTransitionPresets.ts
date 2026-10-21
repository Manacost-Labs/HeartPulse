type TransitionPresets = typeof import('./transitionPresets');

let loaded: TransitionPresets | null = null;
let requested = false;

/**
 * The preset engine once loaded, else null. Route entrances and modal sheets
 * fall back to their plain fade until then: the ValyroUI engine (about 2.5 KB
 * gzip) stays out of the initial JavaScript of every page.
 */
export function transitionPresetsNow(): TransitionPresets | null {
  return loaded;
}

/** Loads the preset engine now (a story, a test); resolves with it. */
export function loadTransitionPresets(): Promise<TransitionPresets> {
  return import('./transitionPresets').then(presets => { loaded = presets; return presets; });
}

/** Loads the preset engine when the browser is idle after the first paint; once per document. */
export function preloadTransitionPresets(): void {
  if (requested || typeof window === 'undefined') return;
  requested = true;
  const load = () => { loadTransitionPresets().catch(() => { requested = false; }); };
  const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(load, { timeout: 3000 });
  else window.setTimeout(load, 1000);
}
