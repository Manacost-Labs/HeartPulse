import { useCallback, useEffect, useState } from 'react';
import { createArenaClassesClient } from './model/client';
import type { ArenaClassesState } from './model/state';

function browserStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export function useArenaClasses(
  accountId: string | undefined,
  enabled: boolean,
  onUpdatedAt: (value: string | null) => void,
) {
  const [state, setState] = useState<ArenaClassesState>({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!enabled || !accountId) {
      setState({ status: 'loading', data: null });
      onUpdatedAt(null);
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading', data: null });
    const accept = (next: ArenaClassesState) => {
      if (controller.signal.aborted) return;
      setState(next);
      onUpdatedAt(next.data?.updatedAt ?? null);
    };
    const client = createArenaClassesClient({ request: fetch, storage: browserStorage() });
    void client.load(accountId, 'hsreplay', { signal: controller.signal, onCache: accept }).then(accept);
    return () => controller.abort();
  }, [accountId, enabled, attempt, onUpdatedAt]);
  return { state, retry };
}
