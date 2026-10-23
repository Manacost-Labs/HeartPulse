import React, { useEffect, useState } from 'react';
import { useAdminResource } from '../../../modules/adminWorkspace/public';
import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import {
  ContestAdminMailing,
  mailingAudienceWarning,
  type MailingOverview,
  type MailingPreviewMode,
} from '../../ContestAdminMailing';
import { authJsonHeaders, errorText, formatDate, readResponseJson, type AdminMessageSink } from '../adminSectionKit';
import { useMailingDraft } from './useMailingDraft';

const OVERVIEW_KEY = '/api/admin/mailings/overview';
/** While a campaign is queued or sending, its counters refresh this often. */
const SENDING_POLL_MS = 2_500;

async function fetchMailingOverview(): Promise<MailingOverview> {
  const response = await fetchWithDeadline(`${OVERVIEW_KEY}?t=${Date.now()}`, { headers: authJsonHeaders(), cache: 'no-store' });
  const data = await readResponseJson(response);
  if (!response.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : 'Не удалось загрузить рассылку');
  return data as unknown as MailingOverview;
}

async function postMailing(path: string, body: unknown, fallbackError: string): Promise<Record<string, unknown>> {
  const response = await fetchWithDeadline(path, {
    method: 'POST',
    deadlineMs: 60_000, // the test letter is handed to the mail server, and queuing writes one row per recipient
    headers: authJsonHeaders(),
    body: JSON.stringify(body),
  });
  const data = await readResponseJson(response);
  if (!response.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : fallbackError);
  return data;
}

/** The mailing section: audience, letter editor with live preview, test letter and the send queue. */
export function MailingSection({ adminEmail, onMessage }: { adminEmail: string; onMessage: AdminMessageSink }) {
  const overview = useAdminResource(OVERVIEW_KEY, fetchMailingOverview);
  const letter = useMailingDraft(onMessage);
  const [previewMode, setPreviewMode] = useState<MailingPreviewMode>('desktop');
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const { draft } = letter;
  const { reload: reloadOverview, data: overviewData } = overview;

  // A failed background refresh keeps the last overview quietly; only a section with nothing to show says so.
  const loadFailure = overviewData === undefined ? overview.error : null;
  useEffect(() => {
    if (loadFailure) onMessage({ type: 'err', text: loadFailure.message || 'Не удалось загрузить рассылку' });
  }, [loadFailure, onMessage]);

  const sendingNow = overviewData?.campaigns.some(campaign => campaign.status === 'queued' || campaign.status === 'sending');
  useEffect(() => {
    if (!sendingNow) return undefined;
    const timer = window.setInterval(() => void reloadOverview(), SENDING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [reloadOverview, sendingNow]);

  const letterReady = () => {
    if (draft.subject.trim() && draft.htmlBody.trim()) return true;
    onMessage({ type: 'err', text: 'Заполните тему и HTML письма.' });
    return false;
  };

  const sendTest = async () => {
    if (!letterReady()) return;
    if (!window.confirm(`Отправить тестовое письмо только на адрес администратора ${adminEmail}?`)) return;
    setTesting(true);
    onMessage(null);
    try {
      const data = await postMailing('/api/admin/mailings/test', draft, 'Не удалось отправить тест');
      onMessage({ type: 'ok', text: typeof data.message === 'string' && data.message ? data.message : 'Тестовое письмо отправлено администратору.' });
    } catch (error) {
      onMessage({ type: 'err', text: errorText(error, 'Не удалось отправить тест') });
    } finally {
      setTesting(false);
    }
  };

  const send = async () => {
    if (!letterReady()) return;
    setSending(true);
    onMessage(null);
    try {
      const preview = await letter.requestPreview(draft);
      if (!preview) return;
      const recipients = Number(preview.recipientCount || 0);
      if (!recipients) throw new Error('В выбранной аудитории нет адресов для отправки.');
      const warning = mailingAudienceWarning(draft.segment);
      if (!window.confirm(`Запустить рассылку «${draft.subject}» для ${recipients} получателей?${warning}\n\nОтправку нельзя отменить после запуска.`)) return;
      await postMailing('/api/admin/mailings/send', {
        ...draft,
        confirmation: 'SEND',
        expectedRecipients: recipients,
        previewDigest: preview.previewDigest,
      }, 'Не удалось запустить рассылку');
      onMessage({ type: 'ok', text: `Рассылка поставлена в очередь для ${recipients} получателей.` });
      await reloadOverview();
    } catch (error) {
      onMessage({ type: 'err', text: errorText(error, 'Не удалось запустить рассылку') });
    } finally {
      setSending(false);
    }
  };

  return (
    <ContestAdminMailing
      overview={overviewData ?? null}
      loading={overview.loading || (overview.refreshing && !sendingNow)}
      draft={draft}
      previewHtml={letter.previewHtml}
      previewCount={letter.previewCount}
      previewMode={previewMode}
      previewLoading={letter.previewLoading}
      sending={sending}
      testing={testing}
      onReload={() => void reloadOverview()}
      onApplyTemplate={letter.applyTemplate}
      onDraftChange={letter.update}
      onPreviewModeChange={setPreviewMode}
      onPreview={() => void letter.requestPreview(draft)}
      onTest={() => void sendTest()}
      onSend={() => void send()}
      formatDate={formatDate}
    />
  );
}
