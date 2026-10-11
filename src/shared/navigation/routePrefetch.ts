type Prefetch = (path: string, options: { onInvalidate: () => void }) => void;

/** Bounded freshness markers; eviction never cancels the router's own cached data. */
export function createRoutePrefetcher(prefetch: Prefetch, { capacity = 32 } = {}) {
  const fresh = new Map<string, object>();
  return (destination: string) => {
    const path = destination.split('#')[0];
    if (fresh.has(path)) return;
    const generation = {};
    fresh.set(path, generation);
    const oldest = fresh.keys().next().value;
    if (fresh.size > capacity && oldest !== undefined) fresh.delete(oldest);
    const invalidate = () => { if (fresh.get(path) === generation) fresh.delete(path); };
    try { prefetch(path, { onInvalidate: invalidate }); }
    catch { invalidate(); }
  };
}

export function allowsRoutePrefetch(connection: { online: boolean; saveData?: boolean; effectiveType?: string }, pointerType = 'mouse') {
  return connection.online && !connection.saveData && pointerType !== 'touch'
    && !['slow-2g', '2g'].includes(connection.effectiveType ?? '');
}

type Clock = {
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout> | undefined) => void;
};

/** One cancellable hover per mounted adapter; focus bypasses the dwell delay. */
export function createRouteIntent(prepare: (path: string) => void, allowed: () => boolean,
  clock: Clock = { setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: timer => clearTimeout(timer) }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovering: string | undefined;
  let disposed = false;
  const cancel = () => {
    clock.clearTimeout(timer);
    timer = undefined;
    hovering = undefined;
  };
  return {
    hover(path: string) {
      if (disposed || hovering === path) return;
      cancel();
      if (!allowed()) return;
      hovering = path;
      timer = clock.setTimeout(() => {
        timer = undefined;
        if (!disposed && allowed()) prepare(path);
      }, 120);
    },
    focus(path: string) { cancel(); if (!disposed && allowed()) prepare(path); },
    cancel,
    dispose() { disposed = true; cancel(); },
  };
}
