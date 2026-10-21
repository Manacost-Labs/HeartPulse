'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSyncExternalStore } from './react-compat';

const noopSubscribe = () => () => {};

/** True on the client; false during SSR and hydration (avoids mismatches). */
export function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Set by ThemeScope: the element its portaled layers render into, so they get the scope's tokens.
 * `undefined` = no scope (document.body); `null` = the scope's container has not mounted yet.
 */
export const PortalContainerContext = createContext<Element | null | undefined>(undefined);

/** Where portaled layers go: the nearest ThemeScope's container, else document.body; null on the server. */
export function usePortalContainer(): Element | null {
  const isClient = useIsClient();
  const scoped = useContext(PortalContainerContext);
  if (!isClient) return null;
  return scoped === undefined ? document.body : scoped;
}

export interface PortalProps {
  children: ReactNode;
  /** Defaults to the nearest ThemeScope's layer container, else document.body. */
  container?: Element | null;
}

export function Portal({ children, container }: PortalProps) {
  const isClient = useIsClient();
  const target = usePortalContainer();
  if (!isClient) return null;
  const resolved = container ?? target;
  // Inside a ThemeScope whose container is not attached yet: render on the next commit, in the right place.
  return resolved ? createPortal(children, resolved) : null;
}
