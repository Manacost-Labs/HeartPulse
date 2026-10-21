'use client';

/*
 * React 17 / 18 / 19 compatibility. The library is written the React 19 way (`ref` as a prop, ref callbacks
 * that return a cleanup, `useId`…); these helpers give the same behaviour on the older versions the peer range
 * allows, and are the plain React APIs on React 19. scripts/react-compat-audit.mjs (run by
 * src/lib/react-compat.test.ts) keeps library code on them; `npm run test:react-versions` renders the built
 * packages on React 17, 18 and 19.
 */
import * as React from 'react';
import { forwardRef, useEffect, useLayoutEffect as useReactLayoutEffect, useState, type ReactElement, type ReactNode, type Ref, type RefCallback } from 'react';

const major = Number.parseInt(React.version, 10);

/**
 * A React API that older versions lack, read by name at runtime: a static `import { useId } from 'react'` makes
 * some bundlers fail the build on React 17.
 */
function reactApi<T>(name: string): T | undefined {
  return (React as unknown as Record<string, T | undefined>)[name];
}

/** React 19: refs are props, ref callbacks may return a cleanup, and the DOM props below are known. */
const react19 = major >= 19;

const canUseDOM = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * useLayoutEffect in the browser, useEffect on the server, where React 17 and 18 warn about layout effects
 * (neither runs there). Library code imports it under the usual name from here.
 */
export const useLayoutEffect: typeof useReactLayoutEffect = canUseDOM ? useReactLayoutEffect : useEffect;

/* ---------------------------------------------------------------------------------------------- refs */

/**
 * Wraps a component that reads `ref` from its props (React 19) so React 17 and 18, which pass a ref only to
 * forwardRef components, hand it over too. Returns `render` itself on React 19, and keeps its type (generics
 * included) everywhere, so the public props stay as declared. `statics` are attached to the component:
 * the parts of a compound component (`Card.Header`).
 */
export function withRef<T extends (props: never) => ReactNode, S extends object = Record<never, never>>(render: T, statics?: S): T & S {
  if (react19) return Object.assign(render, statics);
  const call = render as unknown as (props: object) => ReactNode;
  const Forwarded = forwardRef<unknown, object>((props, ref) => call(ref == null ? props : { ...props, ref }));
  Forwarded.displayName = (render as { displayName?: string }).displayName ?? render.name;
  return Object.assign(Forwarded, statics) as unknown as T & S;
}

/**
 * A ref callback that may return a cleanup, the React 19 way. On React 17 and 18 the cleanup runs when React
 * detaches the ref (calls it with null) instead, and a callback without a cleanup gets that null call as before.
 */
export function cleanupRef<T>(callback: (node: T) => void | (() => void)): RefCallback<T> {
  // React 17 and 18 ignore a returned cleanup (18 warns) and call the ref with null instead.
  if (react19) return callback as RefCallback<T>;
  let cleanup: (() => void) | undefined;
  return (node) => {
    if (node !== null) {
      // HearthPulse: typed for the project's `strict: false`, where `void | (() => void)` does not narrow under `??`.
      cleanup = (callback(node) as (() => void) | undefined) ?? (() => (callback as (node: T | null) => void)(null));
      return;
    }
    const run = cleanup;
    cleanup = undefined;
    run?.();
  };
}

/**
 * cleanupRef for one stable callback that many elements share (`ref={measure}` on every row). React 17 and 18
 * call it with null without saying which element detached, so after that commit the cleanups of the elements
 * that left the document run. Keep the returned callback stable (useCallback / useMemo).
 */
export function sharedCleanupRef<T extends Element>(callback: (node: T) => void | (() => void)): RefCallback<T> {
  if (react19) return callback as RefCallback<T>;
  const cleanups = new Map<T, () => void>();
  let sweeping = false;
  return (node) => {
    if (node !== null) {
      const cleanup = callback(node);
      if (cleanup) cleanups.set(node, cleanup);
      return;
    }
    if (sweeping) return;
    sweeping = true;
    // A microtask runs once React has finished the commit that removed the element.
    queueMicrotask(() => {
      sweeping = false;
      for (const [element, cleanup] of cleanups) {
        if (element.isConnected) continue;
        cleanups.delete(element);
        cleanup();
      }
    });
  };
}

/** The `ref` of an element: `props.ref` on React 19, `element.ref` before (reading the other warns in development). */
export function getElementRef(element: ReactElement): Ref<unknown> | undefined {
  if (react19) return (element.props as { ref?: Ref<unknown> }).ref;
  return (element as unknown as { ref?: Ref<unknown> | null }).ref ?? undefined;
}

/* ---------------------------------------------------------------------------------------------- DOM attributes */

/**
 * The value of the `inert` attribute: a boolean on React 19; React 17 and 18 don't know the attribute and
 * need the empty string (present) or undefined (absent). Use as `inert={inertAttr(closed)}`.
 */
export function inertAttr(inert: boolean | undefined): boolean | undefined {
  if (react19) return inert || undefined;
  return (inert ? '' : undefined) as unknown as boolean | undefined;
}

/** `fetchPriority` for an <img>: React 19 knows the camelCase prop, React 17 and 18 pass the lowercase attribute. */
export function fetchPriorityAttr(priority: 'high' | 'low' | 'auto' | undefined): { fetchPriority?: 'high' | 'low' | 'auto' } {
  if (priority === undefined) return {};
  return (react19 ? { fetchPriority: priority } : { fetchpriority: priority }) as { fetchPriority?: 'high' | 'low' | 'auto' };
}

/* ---------------------------------------------------------------------------------------------- React 18 APIs */

let fallbackIds = 0;

/**
 * React 17: no id on the server and in the first client render (so hydration matches), then a unique one,
 * assigned before the browser paints.
 */
function useFallbackId(): string {
  const [id, setId] = useState('');
  useLayoutEffect(() => {
    setId((current) => current || `v${(fallbackIds += 1)}`);
  }, []);
  return id;
}

/** React's useId (18+); on React 17 an id set right after mount (empty in server markup). */
export const useId: () => string = reactApi<() => string>('useId') ?? useFallbackId;

type Subscribe = (onStoreChange: () => void) => () => void;

interface StoreInstance<T> {
  value: T;
  getSnapshot: () => T;
}

function snapshotChanged<T>(inst: StoreInstance<T>) {
  try {
    return !Object.is(inst.value, inst.getSnapshot());
  } catch {
    // A throwing getSnapshot re-renders, so the error surfaces in render where an error boundary sees it.
    return true;
  }
}

/**
 * React 17 version of useSyncExternalStore (the logic of the official `use-sync-external-store/shim`), except
 * that the first render reads `getServerSnapshot` like React 18 does while hydrating, so server markup matches.
 */
function useSyncExternalStoreFallback<T>(subscribe: Subscribe, getSnapshot: () => T, getServerSnapshot?: () => T): T {
  const [hydrating, setHydrating] = useState(getServerSnapshot !== undefined);
  const value = hydrating && getServerSnapshot ? getServerSnapshot() : getSnapshot();
  const [{ inst }, forceUpdate] = useState<{ inst: StoreInstance<T> }>(() => ({ inst: { value, getSnapshot } }));
  useLayoutEffect(() => {
    if (hydrating) {
      setHydrating(false);
      return;
    }
    inst.value = value;
    inst.getSnapshot = getSnapshot;
    if (snapshotChanged(inst)) forceUpdate({ inst });
  }, [subscribe, value, getSnapshot, hydrating]);
  useEffect(() => {
    if (snapshotChanged(inst)) forceUpdate({ inst });
    return subscribe(() => {
      if (snapshotChanged(inst)) forceUpdate({ inst });
    });
  }, [subscribe]);
  return value;
}

/** React's useSyncExternalStore (18+), or the equivalent built from state and effects on React 17. */
export const useSyncExternalStore: <T>(subscribe: Subscribe, getSnapshot: () => T, getServerSnapshot?: () => T) => T =
  reactApi<typeof useSyncExternalStoreFallback>('useSyncExternalStore') ?? useSyncExternalStoreFallback;

/** React's startTransition (18+); React 17 has no concurrent rendering, so the update runs at once. */
export const startTransition: (scope: () => void) => void = reactApi<(scope: () => void) => void>('startTransition') ?? ((scope) => scope());

const noPending = (): [boolean, (scope: () => void) => void] => [false, startTransition];

/** React's useTransition (18+); never pending on React 17. */
export const useTransition: () => [boolean, (scope: () => void) => void] = reactApi<typeof noPending>('useTransition') ?? noPending;

/** React's useDeferredValue (18+); on React 17 the value itself. */
export const useDeferredValue: <T>(value: T) => T = reactApi<<T>(value: T) => T>('useDeferredValue') ?? ((value) => value);
