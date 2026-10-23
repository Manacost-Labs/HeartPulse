import { useCallback, useEffect, useState } from 'react';
import { fetchOwnPublicProfile, saveOwnNickname } from '../api/privateAccountApi';
import type { OwnPublicProfile } from '../model/publicProfile';

export type AccountPublicProfileControl = {
  /** Null while loading or when unavailable (`failed`). */
  identity: OwnPublicProfile | null;
  failed: boolean;
  saving: boolean;
  saveNickname: (nickname: string) => void;
};

/**
 * The account's public link and nickname. `onMessage` should be stable, such
 * as a state setter; save results go there, like the other account actions.
 */
export function useAccountPublicProfile(
  accountId: string,
  onMessage: (message: { type: 'ok' | 'err'; text: string }) => void,
): AccountPublicProfileControl {
  const [identity, setIdentity] = useState<OwnPublicProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId) return undefined;
    const controller = new AbortController();
    void fetchOwnPublicProfile(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setIdentity(value);
      setFailed(value === null);
    });
    return () => controller.abort();
  }, [accountId]);

  const saveNickname = useCallback((nickname: string) => {
    setSaving(true);
    void saveOwnNickname(nickname)
      .then(saved => {
        setIdentity(saved);
        onMessage({ type: 'ok', text: 'Ник сохранён.' });
      })
      .catch((error: unknown) => onMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось сохранить ник' }))
      .finally(() => setSaving(false));
  }, [onMessage]);

  return { identity, failed, saving, saveNickname };
}
