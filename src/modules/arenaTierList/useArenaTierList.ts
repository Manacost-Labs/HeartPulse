import { useCallback, useEffect, useMemo, useState } from 'react';
import { createArenaTierListClient } from './model/client';
import type { ArenaTierListState } from './model/state';
import type { TierlistData, TierlistSource } from './model/types';

type ViewState = {
  accountId: string | null;
  source: TierlistSource;
  status: 'loading' | ArenaTierListState['status'];
  data: TierlistData | null;
};

function browserStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export function useArenaTierList(accountId: string | undefined, enabled: boolean) {
  const [source, setSource] = useState<TierlistSource>('hsreplay');
  const [view, setView] = useState<ViewState>({ accountId: null, source: 'hsreplay', status: 'loading', data: null });
  const client = useMemo(() => createArenaTierListClient({ request: fetch, storage: browserStorage() }), [accountId, enabled]);
  const [request, setRequest] = useState({ sequence: 0, bust: false });
  const changeSource = useCallback((next: TierlistSource) => {
    if (next === source) return;
    setRequest(previous => previous.bust ? { ...previous, bust: false } : previous);
    setView(previous => ({ ...previous, status: 'loading' }));
    setSource(next);
  }, [source]);
  const retry = useCallback(() => {
    setView(previous => ({ ...previous, status: 'loading' }));
    setRequest(previous => ({ sequence: previous.sequence + 1, bust: true }));
  }, []);

  useEffect(() => {
    if (!enabled || !accountId) {
      setView({ accountId: null, source: 'hsreplay', status: 'loading', data: null });
      return;
    }
    const controller = new AbortController();
    setView(previous => ({ accountId, source: previous.source, status: 'loading',
      data: previous.accountId === accountId ? previous.data : null }));
    const accept = (next: ArenaTierListState) => {
      if (controller.signal.aborted) return;
      setView(previous => {
        if (controller.signal.aborted) return previous;
        return next.status === 'error' && previous.accountId === accountId && previous.source === source && previous.data
          ? { accountId, source, status: 'stale', data: { ...previous.data, warning: 'stale' } }
          : { accountId, source, ...next };
      });
    };
    void client.load(accountId, source, { signal: controller.signal,
      bust: request.bust, onCache: accept }).then(accept);
    return () => controller.abort();
  }, [accountId, enabled, source, request.sequence, request.bust, client]);

  const state = enabled && accountId && view.accountId === accountId
    ? view : { status: 'loading' as const, data: null };
  return { source, state, changeSource, retry,
    loading: state.status === 'loading' && !state.data,
    switching: state.status === 'loading' && Boolean(state.data),
    error: state.status === 'error' || state.status === 'denied',
  };
}
