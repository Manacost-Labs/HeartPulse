import { useEffect, useState } from 'react';
import { loadArenaCompanionIds } from './model/companionIds';

const EMPTY_IDS = new Set<string>();

export function useArenaCompanionIds(accountId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<{ accountId: string | null; ids: Set<string> }>({
    accountId: null, ids: EMPTY_IDS,
  });
  useEffect(() => {
    if (!enabled || !accountId) {
      setState({ accountId: null, ids: EMPTY_IDS });
      return;
    }
    const controller = new AbortController();
    void loadArenaCompanionIds(fetch, controller.signal).then(ids => {
      if (!controller.signal.aborted) setState({ accountId, ids });
    });
    return () => controller.abort();
  }, [accountId, enabled]);
  return enabled && state.accountId === accountId ? state.ids : EMPTY_IDS;
}
