import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';
import { deleteAccountReplay, fetchAccountReplays, type AccountReplay } from '../api/replaysApi';
import AccountSectionHead from './AccountSectionHead';

/**
 * Replays the player uploaded from the Hearthpulse app (plan 2.2): a link to each and deleting it. Shown only while
 * the account has some; they are deleted on their own after 180 days.
 */
export default function AccountReplays() {
  const [replays, setReplays] = useState<AccountReplay[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetchAccountReplays(controller.signal).then(result => {
      if (!controller.signal.aborted) setReplays(result);
    });
    return () => controller.abort();
  }, []);

  if (!replays || replays.length === 0) return null;
  const remove = (id: string) => {
    setError('');
    deleteAccountReplay(id)
      .then(() => setReplays(current => (current ?? []).filter(replay => replay.id !== id)))
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
      <ul className="account-replays__list">
        {replays.map(replay => (
          <li key={replay.id}>
            <a href={`/replay/${replay.id}`}>
              {replay.kind === 'battlegrounds' ? `Поля сражений, ${replay.placement}-е место` : `${replay.mode} · ${replay.result}`}
            </a>{' '}
            <span>{new Date(replay.createdAt).toLocaleDateString('ru-RU')}</span>{' '}
            <button type="button" className="account-button account-button--secondary account-button--small" onClick={() => remove(replay.id)}>
              Удалить
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="account-tracker-data__error" role="alert">{error}</p> : null}
    </section>
  );
}
