import { useCallback, useEffect, useState } from 'react';
import { createStandardMatchupsClient } from './model/client';
import type { StandardMatchupsState } from './model/state';
import type { StandardMatchupsData, StandardMatchupsFormat } from './model/types';

type ViewState = {
  accountId: string | null;
  format: StandardMatchupsFormat;
  status: 'loading' | StandardMatchupsState['status'];
  data: StandardMatchupsData | null;
};

function browserStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export function useStandardMatchups(accountId: string | undefined, enabled: boolean) {
  const [format, setFormat] = useState<StandardMatchupsFormat>('standard');
  const [view, setView] = useState<ViewState>({ accountId: null, format: 'standard', status: 'loading', data: null });
  const [request, setRequest] = useState({ sequence: 0, bust: false });
  const changeFormat = useCallback((next: StandardMatchupsFormat) => {
    if (next === format) return;
    setRequest(previous => previous.bust ? { ...previous, bust: false } : previous);
    setFormat(next);
  }, [format]);
  const retry = useCallback(() => {
    setView(previous => ({ ...previous, status: 'loading' }));
    setRequest(previous => ({ sequence: previous.sequence + 1, bust: true }));
  }, []);

  useEffect(() => {
    if (!enabled || !accountId) {
      setView({ accountId: null, format, status: 'loading', data: null });
      return;
    }
    const controller = new AbortController();
    setView(previous => ({ accountId, format, status: 'loading',
      data: previous.accountId === accountId && previous.format === format ? previous.data : null }));
    const accept = (next: StandardMatchupsState) => {
      if (controller.signal.aborted) return;
      setView(previous => {
        if (controller.signal.aborted) return previous;
        return next.status === 'error' && previous.accountId === accountId
          && previous.format === format && previous.data
          ? { accountId, format, status: 'stale', data: { ...previous.data, warning: 'stale' } }
          : { accountId, format, ...next };
      });
    };
    const client = createStandardMatchupsClient({ request: fetch, storage: browserStorage() });
    void client.load(accountId, format, { signal: controller.signal,
      bust: request.bust, onCache: accept }).then(accept);
    return () => controller.abort();
  }, [accountId, enabled, format, request.sequence, request.bust]);

  const state = enabled && accountId && view.accountId === accountId && view.format === format
    ? view : { status: 'loading' as const, data: null };
  return { format, state, changeFormat, retry,
    loading: state.status === 'loading' && !state.data,
    error: state.status === 'error',
  };
}
