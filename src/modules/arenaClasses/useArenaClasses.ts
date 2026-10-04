import { useCallback, useEffect, useState } from 'react';
import { createArenaClassesClient } from './model/client';
import type { ArenaClassesState } from './model/state';

function browserStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

const LOADING: ArenaClassesState = { status: 'loading', data: null };

export function useArenaClasses(
  accountId: string | undefined,
  enabled: boolean,
  onUpdatedAt: (value: string | null) => void,
) {
  const [view, setView] = useState<{ accountId: string | null; state: ArenaClassesState }>({ accountId: null, state: LOADING });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!enabled || !accountId) {
      setView({ accountId: null, state: LOADING });
      onUpdatedAt(null);
      return;
    }
    const controller = new AbortController();
    setView({ accountId, state: LOADING });
    const accept = (next: ArenaClassesState) => {
      if (controller.signal.aborted) return;
      setView({ accountId, state: next });
      onUpdatedAt(next.data?.updatedAt ?? null);
    };
    const client = createArenaClassesClient({ request: fetch, storage: browserStorage() });
    void client.load(accountId, 'hsreplay', { signal: controller.signal, onCache: accept }).then(accept);
    return () => controller.abort();
  }, [accountId, enabled, attempt, onUpdatedAt]);
  // Derived in render, not in the effect: the statistics leave the page in the
  // same render that takes access away (a sign-out seen by a restored page).
  const state = enabled && accountId && view.accountId === accountId ? view.state : LOADING;
  return { state, retry };
}
