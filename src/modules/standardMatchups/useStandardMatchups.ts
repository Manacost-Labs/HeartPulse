'use client';

import { useCallback, useEffect, useState } from 'react';
import { createStandardMatchupsClient } from './model/client';
import { readStandardMatchupsSlice, sameStandardMatchupsSlice, writeStandardMatchupsSlice } from './model/slice';
import type { StandardMatchupsState } from './model/state';
import {
  DEFAULT_STANDARD_MATCHUPS_SLICE, type StandardMatchupsData, type StandardMatchupsFormat, type StandardMatchupsSlice,
} from './model/types';

type ViewState = {
  accountId: string | null;
  slice: StandardMatchupsSlice;
  status: 'loading' | StandardMatchupsState['status'];
  data: StandardMatchupsData | null;
};

function browserStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

/**
 * The subscriber's HSGuru matchup slice. With `syncUrl` the slice is read from
 * and written to the page's query (`?format=wild&rank=all&period=…&min_games=…`);
 * the matchups page renders it only after the access check, in the browser. A page whose path names the
 * format (`pathFormat`, `/standard/matchups/wild/`) takes it from there: the query never carries `format`.
 */
export function useStandardMatchups(accountId: string | undefined, enabled: boolean,
  { syncUrl = false, pathFormat }: { syncUrl?: boolean; pathFormat?: StandardMatchupsFormat } = {}) {
  const [slice, setSlice] = useState<StandardMatchupsSlice>(() => {
    const fromAddress = syncUrl && typeof window !== 'undefined'
      ? readStandardMatchupsSlice(window.location.search) : DEFAULT_STANDARD_MATCHUPS_SLICE;
    return pathFormat ? { ...fromAddress, format: pathFormat } : fromAddress;
  });
  const [view, setView] = useState<ViewState>({ accountId: null, slice, status: 'loading', data: null });
  const [request, setRequest] = useState({ sequence: 0, bust: false });
  const changeSlice = useCallback((patch: Partial<StandardMatchupsSlice>) => {
    setSlice(previous => {
      const next = { ...previous, ...patch };
      return sameStandardMatchupsSlice(previous, next) ? previous : next;
    });
    // A retry's cache bypass applies to the slice it retried, not to the next one.
    setRequest(current => current.bust ? { ...current, bust: false } : current);
  }, []);
  const changeFormat = useCallback((format: StandardMatchupsFormat) => changeSlice({ format }), [changeSlice]);
  const retry = useCallback(() => {
    setView(previous => ({ ...previous, status: 'loading' }));
    setRequest(previous => ({ sequence: previous.sequence + 1, bust: true }));
  }, []);

  useEffect(() => {
    if (!syncUrl) return;
    // With the format in the path, the default format leaves no parameter, so a stray `?format=` is dropped as well.
    const search = writeStandardMatchupsSlice(window.location.search, pathFormat ? { ...slice, format: DEFAULT_STANDARD_MATCHUPS_SLICE.format } : slice);
    if (search === window.location.search) return;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}${window.location.hash}`);
  }, [slice, syncUrl, pathFormat]);

  useEffect(() => {
    if (!enabled || !accountId) {
      setView({ accountId: null, slice, status: 'loading', data: null });
      return;
    }
    const controller = new AbortController();
    // A new slice keeps the previous matrix on screen (marked busy) until the next one arrives.
    setView(previous => ({ accountId, slice, status: 'loading',
      data: previous.accountId === accountId && previous.data?.format === slice.format ? previous.data : null }));
    const accept = (next: StandardMatchupsState) => {
      if (controller.signal.aborted) return;
      setView(previous => {
        if (controller.signal.aborted) return previous;
        return next.status === 'error' && previous.accountId === accountId && previous.data
          && sameStandardMatchupsSlice(previous.slice, slice)
          ? { accountId, slice, status: 'stale', data: { ...previous.data, warning: 'stale' } }
          : { accountId, slice, ...next };
      });
    };
    const client = createStandardMatchupsClient({ request: fetch, storage: browserStorage() });
    void client.load(accountId, slice, { signal: controller.signal,
      bust: request.bust, onCache: accept }).then(accept);
    return () => controller.abort();
  }, [accountId, enabled, slice, request.sequence, request.bust]);

  const current = enabled && accountId && view.accountId === accountId && sameStandardMatchupsSlice(view.slice, slice);
  const state = current ? view : { status: 'loading' as const, data: null };
  const settled = current && view.status !== 'loading';
  return { format: slice.format, slice, state, changeFormat, changeSlice, retry,
    /** The matrix on screen, possibly of the previous slice while the next one loads. */
    shown: enabled && accountId && view.accountId === accountId ? view.data : null,
    loading: !settled,
    error: state.status === 'error' || state.status === 'denied',
  };
}
