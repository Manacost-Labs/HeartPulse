import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import { replayModeLabel, replayResultLabel } from '../../../shared/text/replayLabels';
import { deleteAccountReplay, fetchAccountReplays, type AccountReplay } from '../api/replaysApi';
import AccountSectionHead from './AccountSectionHead';

type Props = {
  /** Loads the list (tests and stories pass their own). */
  load?: (signal: AbortSignal) => Promise<AccountReplay[] | null>;
  remove?: (id: string) => Promise<void>;
  /** Asks before deleting; the browser's own dialog by default. */
  confirmDelete?: (message: string) => boolean;
};

/** A replay's line in the list: mode and result (or place) in Russian. */
export function accountReplayTitle(replay: AccountReplay): string {
  if (replay.kind === 'battlegrounds') return `${replayModeLabel(replay.mode)}, ${replay.placement}-е место`;
  const result = replayResultLabel(replay.result);
  return result ? `${replayModeLabel(replay.mode)} · ${result}` : replayModeLabel(replay.mode);
}

/**
 * Replays the player uploaded from the Hearthpulse app (plan 2.2): a link to each and deleting it, after a question.
 * Shown while the account has some, or when the list failed to load (with a retry); they are deleted on their own
 * after 180 days.
 */
export default function AccountReplays({
  load = fetchAccountReplays,
  remove = deleteAccountReplay,
  confirmDelete = message => window.confirm(message),
}: Props) {
  const [replays, setReplays] = useState<AccountReplay[] | null | 'failed'>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).then(result => {
      if (!controller.signal.aborted) setReplays(result ?? 'failed');
    });
    return () => controller.abort();
  }, [load, attempt]);

  if (replays === null || (Array.isArray(replays) && replays.length === 0)) return null;
  const deleteReplay = (replay: AccountReplay) => {
    if (!confirmDelete(`Удалить реплей «${accountReplayTitle(replay)}» с сайта? Ссылка на него перестанет работать.`)) return;
    setError('');
    remove(replay.id)
      .then(() => setReplays(current => (Array.isArray(current) ? current.filter(item => item.id !== replay.id) : current)))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось удалить реплей'));
  };

  return (
    <section id="account-replays" className="account-section account-tracker-data" aria-labelledby="account-replays-title">
      <AccountSectionHead
        id="account-replays-title"
        icon={<Film size={15} aria-hidden="true" />}
        eyebrow="Hearthpulse"
        title="Реплеи на сайте"
        description="Матчи, которые вы загрузили из приложения. Их видит любой, у кого есть ссылка; через 180 дней они удаляются сами."
      />
      {replays === 'failed' ? (
        <p className="account-tracker-data__error" role="alert">
          Не удалось загрузить список реплеев.{' '}
          <button type="button" className="account-button account-button--secondary account-button--small"
            onClick={() => { setReplays(null); setAttempt(value => value + 1); }}>
            Повторить
          </button>
        </p>
      ) : (
        <ul className="account-replays__list">
          {replays.map(replay => (
            <li key={replay.id}>
              <a href={`/replay/${replay.id}`}>{accountReplayTitle(replay)}</a>{' '}
              <span>{new Date(replay.createdAt).toLocaleDateString('ru-RU')}</span>{' '}
              <button type="button" className="account-button account-button--secondary account-button--small" onClick={() => deleteReplay(replay)}>
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="account-tracker-data__error" role="alert">{error}</p> : null}
    </section>
  );
}
