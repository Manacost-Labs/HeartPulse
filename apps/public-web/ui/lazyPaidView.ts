'use client';

import { useEffect, useState } from 'react';
import { hasAuthSessionHint } from '@/src/modules/identity/public';

// Paid views that a guest never sees load on demand (apps/public-web/README.md):
// a loaded module is kept and rendered in the same render that grants access,
// without a Suspense boundary whose reveal throttle would hold it back by about
// 300 ms. Used by `lazyBattlegrounds.tsx` and the Vicious Syndicate Gold page.

/** One lazily imported module: `load` starts (or joins) the download, `current` is the loaded module or null. */
export function moduleLoader<T>(load: () => Promise<T>) {
  let loaded: T | null = null;
  let pending: Promise<T> | null = null;
  return {
    current: () => loaded,
    load: () => {
      pending ??= load().then(module => { loaded = module; return module; }, error => { pending = null; throw error; });
      return pending;
    },
  };
}

/** The module once loaded, null until then; the download starts on mount. */
export function useLoadedModule<T>(loader: { current: () => T | null; load: () => Promise<T> }): T | null {
  const [state, setState] = useState<{ module: T | null; error: unknown }>(() => ({ module: loader.current(), error: null }));
  useEffect(() => {
    if (state.module) return;
    let active = true;
    loader.load().then(module => { if (active) setState({ module, error: null }); },
      error => { if (active) setState({ module: null, error }); });
    return () => { active = false; };
  }, [loader, state.module]);
  // A chunk that cannot load reaches the route's error boundary, which offers a reload.
  if (state.error) throw state.error;
  return state.module;
}

/**
 * A remembered session is probably a subscriber's: start the view's download
 * while the access check runs, so it is ready when the check finishes.
 * The hint grants nothing; the page still renders the view only when allowed.
 */
export function usePaidViewPrefetch(load: () => Promise<unknown>) {
  useEffect(() => {
    if (hasAuthSessionHint()) load().catch(() => { /* The view retries when it renders. */ });
  }, [load]);
}
