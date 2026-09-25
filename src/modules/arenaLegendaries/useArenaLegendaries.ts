import { useCallback, useEffect, useState } from 'react';
import { createArenaLegendariesClient } from './model/client';
import type { ArenaLegendariesState } from './model/state';
import type { LegendariesData, LegendarySource } from './model/types';

type ViewState = {
  accountId: string | null;
  status: 'loading' | ArenaLegendariesState['status'];
  data: LegendariesData | null;
};

function browserStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export function useArenaLegendaries(accountId: string | undefined, enabled: boolean) {
  const [source, setSource] = useState<LegendarySource>('hsreplay');
  const [view, setView] = useState<ViewState>({ accountId: null, status: 'loading', data: null });
  const [request, setRequest] = useState({ sequence: 0, bust: false });
  const changeSource = useCallback((next: LegendarySource) => {
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
      setView({ accountId: null, status: 'loading', data: null });
      return;
    }
    const controller = new AbortController();
    setView(previous => ({ accountId, status: 'loading',
      data: previous.accountId === accountId ? previous.data : null }));
    const accept = (next: ArenaLegendariesState) => {
      if (controller.signal.aborted) return;
      setView(previous => {
        if (controller.signal.aborted) return previous;
        return next.status === 'error' && previous.accountId === accountId && previous.data
          ? { accountId, status: 'stale', data: { ...previous.data, warning: 'stale' } }
          : { accountId, ...next };
      });
    };
    const client = createArenaLegendariesClient({ request: fetch, storage: browserStorage() });
    void client.load(accountId, source, { signal: controller.signal,
      bust: request.bust, onCache: accept }).then(accept);
    return () => controller.abort();
  }, [accountId, enabled, source, request.sequence, request.bust]);

  const state = enabled && accountId && view.accountId === accountId
    ? view : { status: 'loading' as const, data: null };
  return { source, state, changeSource, retry,
    loading: state.status === 'loading' && !state.data,
    switching: state.status === 'loading' && Boolean(state.data),
    error: state.status === 'error',
  };
}
