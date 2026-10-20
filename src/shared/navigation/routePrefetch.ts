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

/** Speculation is skipped offline, with Save-Data and on 2G; touch is a press, never a hover. */
export function allowsRoutePrefetch(connection: { online: boolean; saveData?: boolean; effectiveType?: string }) {
  return connection.online && !connection.saveData && !['slow-2g', '2g'].includes(connection.effectiveType ?? '');
}

type Clock = {
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout> | undefined) => void;
};

const systemClock: Clock = { setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: timer => clearTimeout(timer) };

/**
 * One cancellable hover per mounted adapter; focus and a press bypass the
 * dwell. `dwellMs` (the adapter passes `--motion-fast`) separates a pointer
 * resting on a link from one crossing it.
 */
export function createRouteIntent(prepare: (path: string) => void, allowed: () => boolean,
  { dwellMs = 120, clock = systemClock }: { dwellMs?: number; clock?: Clock } = {}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovering: string | undefined;
  let disposed = false;
  const cancel = () => {
    clock.clearTimeout(timer);
    timer = undefined;
    hovering = undefined;
  };
  const now = (path: string) => { cancel(); if (!disposed && allowed()) prepare(path); };
  return {
    hover(path: string) {
      if (disposed || hovering === path) return;
      cancel();
      if (!allowed()) return;
      hovering = path;
      timer = clock.setTimeout(() => {
        timer = undefined;
        if (!disposed && allowed()) prepare(path);
      }, dwellMs);
    },
    focus: now,
    // The click follows a mouse press or a touch by about 100 ms: the route can already be on its way.
    press: now,
    cancel,
    dispose() { disposed = true; cancel(); },
  };
}
