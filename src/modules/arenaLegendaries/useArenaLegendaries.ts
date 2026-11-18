'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createArenaLegendariesClient } from './model/client';
import { loadPublicLegendaries } from './model/publicClient';
import { mergeLegendaryPaid } from './model/publicProjection';
import type { ArenaLegendariesState } from './model/state';
import type { LegendariesData, LegendarySource } from './model/types';

type ViewState = {
  accountId: string | null;
  source: LegendarySource | null;
  status: 'loading' | ArenaLegendariesState['status'];
  data: LegendariesData | null;
};
type OpenBySource = Partial<Record<LegendarySource, LegendariesData>>;

const EMPTY_VIEW: ViewState = { accountId: null, source: null, status: 'loading', data: null };

function browserStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

/**
 * The open groups come first: `initial` is what the server printed (it needs no
 * request for HSReplay; `null` means it had none), another source or a missing snapshot is read from
 * `/api/legendaries/public`. A viewer with the Arena entitlement (`enabled`)
 * also gets the protected groups, and their paid figures are laid over the open
 * ones. Losing the entitlement or the account drops the paid figures at once.
 */
export function useArenaLegendaries(accountId: string | undefined, enabled: boolean, initial?: LegendariesData | null) {
  const [source, setSource] = useState<LegendarySource>('hsreplay');
  const [open, setOpen] = useState<OpenBySource>(() => initial ? { [initial.sourceId ?? 'hsreplay']: initial } : {});
  const [openFailed, setOpenFailed] = useState<Partial<Record<LegendarySource, boolean>>>(
    // `null`: the server tried and had no snapshot, so its HTML already says «unavailable»; the browser asks again.
    () => initial === null ? { hsreplay: true } : {});
  const [view, setView] = useState<ViewState>(EMPTY_VIEW);
  const [request, setRequest] = useState({ sequence: 0, bust: false });
  const openRef = useRef(open);
  openRef.current = open;
  // A server snapshot marked stale/fallback is read again once; a failed read keeps it.
  const refreshed = useRef<Partial<Record<LegendarySource, boolean>>>({});

  const changeSource = useCallback((next: LegendarySource) => {
    if (next === source) return;
    setRequest(previous => previous.bust ? { ...previous, bust: false } : previous);
    setSource(next);
  }, [source]);
  const retry = useCallback(() => {
    setOpenFailed({});
    setRequest(previous => ({ sequence: previous.sequence + 1, bust: true }));
  }, []);

  useEffect(() => {
    const known = openRef.current[source];
    if (known && !request.bust && (!known.warning || refreshed.current[source])) return;
    const controller = new AbortController();
    refreshed.current[source] = true;
    void loadPublicLegendaries(source, { signal: controller.signal, bust: request.bust }).then(next => {
      if (controller.signal.aborted) return;
      if (next) {
        setOpen(previous => ({ ...previous, [source]: next }));
        setOpenFailed(previous => ({ ...previous, [source]: false }));
      } else setOpenFailed(previous => ({ ...previous, [source]: !openRef.current[source] }));
    });
    return () => controller.abort();
  }, [source, request.sequence, request.bust]);

  useEffect(() => {
    if (!enabled || !accountId) {
      setView(EMPTY_VIEW);
      return;
    }
    const controller = new AbortController();
    setView(previous => ({ accountId, source, status: 'loading',
      data: previous.accountId === accountId && previous.source === source ? previous.data : null }));
    const accept = (next: ArenaLegendariesState) => {
      if (controller.signal.aborted) return;
      setView(previous => {
        if (controller.signal.aborted) return previous;
        return next.status === 'error' && previous.accountId === accountId && previous.source === source && previous.data
          ? { accountId, source, status: 'stale', data: { ...previous.data, warning: 'stale' } }
          : { accountId, source, ...next };
      });
    };
    const client = createArenaLegendariesClient({ request: fetch, storage: browserStorage() });
    void client.load(accountId, source, { signal: controller.signal,
      bust: request.bust, onCache: accept }).then(accept);
    return () => controller.abort();
  }, [accountId, enabled, source, request.sequence, request.bust]);

  const paid = enabled && accountId && view.accountId === accountId && view.source === source
    ? view : { status: 'loading' as const, data: null };
  const shownOpen = open[source] ?? null;
  const data = useMemo(() => shownOpen ? mergeLegendaryPaid(shownOpen, paid.data) : paid.data,
    [shownOpen, paid.data]);
  // While the other source loads, the previous one stays on screen.
  const other = open[source === 'hsreplay' ? 'firestone' : 'hsreplay'] ?? null;
  const shown = data ?? (openFailed[source] ? null : other);
  const waiting = !data && !openFailed[source];
  const state = { status: paid.status, data: shown };
  return { source, state, changeSource, retry,
    loading: waiting && !shown,
    switching: waiting && Boolean(shown),
    error: !data && Boolean(openFailed[source]),
    paid: { loading: enabled && paid.status === 'loading' && !paid.data,
      failed: enabled && !paid.data && (paid.status === 'error' || paid.status === 'denied') },
  };
}
