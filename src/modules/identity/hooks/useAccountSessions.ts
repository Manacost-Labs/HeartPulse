import { useCallback, useEffect, useState } from 'react';
import { fetchAccountSessions, revokeAccountSession, revokeOtherAccountSessions } from '../api/privateAccountApi';
import { revokedSessionsMessage, type AccountSession } from '../model/accountSessions';

export type AccountSessionsControl = {
  /** Null while loading or when the list is unavailable (`failed`). */
  sessions: AccountSession[] | null;
  failed: boolean;
  /** The session id being ended, or `others`. */
  busy: string | null;
  revoke: (id: string) => void;
  revokeOthers: () => void;
};

/**
 * The account's sessions and the two ways to end them. After a revocation the
 * list is read again from the server, so it shows what the server now accepts.
 * `onMessage` should be stable, such as a state setter.
 */
export function useAccountSessions(
  accountId: string,
  onMessage: (message: { type: 'ok' | 'err'; text: string }) => void,
): AccountSessionsControl {
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!accountId) return undefined;
    const controller = new AbortController();
    void fetchAccountSessions(controller.signal).then(list => {
      if (controller.signal.aborted) return;
      setSessions(list);
      setFailed(list === null);
    });
    return () => controller.abort();
  }, [accountId, revision]);

  const run = useCallback((key: string, change: () => Promise<number>, success: (count: number) => string) => {
    setBusy(key);
    void change()
      .then(count => onMessage({ type: 'ok', text: success(count) }))
      .catch((error: unknown) => onMessage({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось завершить сеанс' }))
      .finally(() => {
        setBusy(null);
        setRevision(value => value + 1);
      });
  }, [onMessage]);

  return {
    sessions,
    failed,
    busy,
    revoke: id => run(id, () => revokeAccountSession(id), () => 'Сеанс завершён.'),
    revokeOthers: () => run('others', revokeOtherAccountSessions, revokedSessionsMessage),
  };
}
