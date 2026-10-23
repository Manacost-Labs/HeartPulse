import { useEffect, useState } from 'react';
import { Download, HardDrive } from 'lucide-react';
import { pluralRu } from '../../../shared/text/pluralRu';
import { deleteTrackerData, fetchTrackerDataSummary, TRACKER_DATA_EXPORT_URL, type TrackerDataSummary } from '../api/trackerDataApi';
import AccountSectionHead from './AccountSectionHead';

const formatDay = (value: string | null) => (value
  ? new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  : '');

/**
 * The player's own data from the desktop tracker: what is stored, a download
 * of all of it and deletion of all of it. Shown only while something is
 * stored (and right after deleting, to confirm it), independently of whether
 * the statistics section is switched on.
 */
export default function AccountTrackerData() {
  const [summary, setSummary] = useState<TrackerDataSummary | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchTrackerDataSummary(controller.signal).then(result => {
      if (!controller.signal.aborted) setSummary(result);
    });
    return () => controller.abort();
  }, []);

  if (!summary || (summary.events === 0 && status?.type !== 'ok')) return null;
  if (summary.events === 0) {
    return <p className="account-tracker-data__done" role="status">{status?.text}</p>;
  }
  const count = `${summary.events.toLocaleString('ru-RU')} ${pluralRu(summary.events, 'событие', 'события', 'событий')}`;
  const remove = () => {
    setConfirming(false);
    setBusy(true);
    setStatus(null);
    deleteTrackerData()
      .then(deleted => {
        setSummary({ events: 0, firstOccurredAt: null, lastOccurredAt: null });
        setStatus({ type: 'ok', text: `Данные приложения удалены: ${deleted.toLocaleString('ru-RU')} ${pluralRu(deleted, 'событие', 'события', 'событий')}.` });
      })
      .catch((error: unknown) => setStatus({ type: 'err', text: error instanceof Error ? error.message : 'Не удалось удалить данные приложения' }))
      .finally(() => setBusy(false));
  };

  return (
    <section id="account-tracker-data" className="account-section account-tracker-data" aria-labelledby="account-tracker-data-title">
      <AccountSectionHead
        id="account-tracker-data-title"
        icon={<HardDrive size={15} aria-hidden="true" />}
        eyebrow="Hearthpulse"
        title="Данные приложения"
        description={`Сохранено ${count} из приложения Hearthpulse (${formatDay(summary.firstOccurredAt)} — ${formatDay(summary.lastOccurredAt)}). Они видны только вам.`}
        aside={(
          <>
            <a className="account-button account-button--secondary account-button--small" href={TRACKER_DATA_EXPORT_URL} download>
              <Download size={15} aria-hidden="true" /> Скачать мои данные
            </a>
            {!confirming ? (
              <button type="button" className="account-button account-button--secondary account-button--small" disabled={busy}
                onClick={() => setConfirming(true)}>{busy ? 'Удаляем…' : 'Удалить данные'}</button>
            ) : null}
          </>
        )}
      />
      {confirming ? (
        <div className="account-sessions__confirm" role="alertdialog" aria-labelledby="account-tracker-data-confirm">
          <p id="account-tracker-data-confirm">Удалить {count} без возможности восстановления? Статистика в профиле станет пустой.</p>
          <button type="button" className="account-button account-button--small" autoFocus onClick={remove}>Удалить</button>
          <button type="button" className="account-button account-button--secondary account-button--small" onClick={() => setConfirming(false)}>Отмена</button>
        </div>
      ) : null}
      {status?.type === 'err' ? <p className="account-tracker-data__error" role="alert">{status.text}</p> : null}
    </section>
  );
}
