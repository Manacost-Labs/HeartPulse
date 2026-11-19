/**
 * The query of the address as a store, so a component follows `?format=wild` and the rest of
 * the query the way it follows the path: a page that rewrites its own address with
 * `history.pushState` / `replaceState`, and Back and Forward, all reach the subscribers.
 * Next patches the same two methods; each patch calls the one it wrapped, so installing this
 * one before or after it makes no difference. The server and hydration read `null` (the query
 * is not known there), so a first render never disagrees with the server's HTML.
 */
import { useSyncExternalStore } from 'react';

const EVENT = 'hp:location-search';
const listeners = new Set<() => void>();
let installed = false;

function notify() {
  // A history write can come from inside a commit (Next pushes the address of a finished
  // navigation there), where React does not take a state update: wait until it ends.
  queueMicrotask(() => listeners.forEach(listener => listener()));
}

function install() {
  if (installed) return;
  installed = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method];
    window.history[method] = function patched(this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
  }
  window.addEventListener('popstate', notify);
  window.addEventListener(EVENT, notify);
}

export function subscribeLocationSearch(listener: () => void): () => void {
  install();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function readLocationSearch(): string {
  return window.location.search;
}

/** The query of the address, e.g. `?format=wild`; null on the server and while hydrating. */
export function useLocationSearch(): string | null {
  return useSyncExternalStore(subscribeLocationSearch, readLocationSearch, () => null);
}
