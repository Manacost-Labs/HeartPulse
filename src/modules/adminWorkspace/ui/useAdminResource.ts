import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createAdminResourceStore, type AdminResourceSnapshot } from '../model/adminResourceStore';

const store = createAdminResourceStore();
const EMPTY: AdminResourceSnapshot = store.read('');
const noopSubscribe = () => () => {};

/** Answers younger than this are shown without asking the server again. */
export const ADMIN_RESOURCE_FRESH_MS = 30_000;

export interface AdminResourceOptions {
  /** How long an answer counts as fresh; older ones are shown and refreshed in the background. */
  maxAgeMs?: number;
  /** While a new key loads for the first time, keep showing the previous key's data (paging, filters). */
  keepPrevious?: boolean;
}

export interface AdminResource<T> {
  data: T | undefined;
  error: Error | null;
  /** No data to show yet: render the section's skeleton. */
  loading: boolean;
  /** A request is running while data is shown (background refresh or a new page). */
  refreshing: boolean;
  updatedAt: number | null;
  /** Asks the server again now (the section's «Обновить» button). */
  reload: () => Promise<void>;
}

/**
 * Reads one admin answer through the tab-wide cache. `key` names the request (path and query);
 * `null` disables it. `load` may change identity between renders; the latest one is used.
 */
export function useAdminResource<T>(
  key: string | null,
  load: () => Promise<T>,
  { maxAgeMs = ADMIN_RESOURCE_FRESH_MS, keepPrevious = false }: AdminResourceOptions = {},
): AdminResource<T> {
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const subscribe = useCallback(
    (listener: () => void) => (key ? store.subscribe(key, listener) : noopSubscribe()),
    [key],
  );
  const snapshot = useSyncExternalStore(subscribe, () => (key ? store.read(key) : EMPTY), () => EMPTY);
  useEffect(() => {
    if (key) void store.ensure(key, () => loadRef.current(), maxAgeMs);
  }, [key, maxAgeMs]);

  const [previous, setPrevious] = useState<T | undefined>(undefined);
  const current = snapshot.data as T | undefined;
  useEffect(() => {
    if (keepPrevious && current !== undefined) setPrevious(current);
  }, [current, keepPrevious]);
  const data = current ?? (keepPrevious ? previous : undefined);

  const reload = useCallback(
    () => (key ? store.refresh(key, () => loadRef.current()) : Promise.resolve()),
    [key],
  );
  return {
    data,
    error: snapshot.error,
    loading: data === undefined && (snapshot.fetching || (key !== null && snapshot.updatedAt === null && !snapshot.error)),
    refreshing: data !== undefined && snapshot.fetching,
    updatedAt: snapshot.updatedAt,
    reload,
  };
}

/** Marks cached answers whose key starts with `prefix` as stale, e.g. after a mutation changed them. */
export function invalidateAdminResources(prefix: string): void {
  store.invalidate(prefix);
}

/** Starts loading a key ahead of time (hover or idle prefetch); a fresh or running request is reused. */
export function prefetchAdminResource<T>(key: string, load: () => Promise<T>, maxAgeMs = ADMIN_RESOURCE_FRESH_MS): void {
  void store.ensure(key, load, maxAgeMs);
}
