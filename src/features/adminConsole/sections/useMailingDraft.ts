import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import { EMPTY_MAILING_DRAFT, type MailingDraft, type MailingTemplate } from '../../ContestAdminMailing';
import { authJsonHeaders, errorText, readResponseJson, type AdminMessageSink } from '../adminSectionKit';

export type MailingPreviewAnswer = { html: string; recipientCount: number; sanitizedHtmlBody: string; previewDigest: string };

const PREVIEW_DEBOUNCE_MS = 450;

/**
 * The letter being written and its server-rendered preview. The preview follows the draft after a
 * pause in typing; an older answer never replaces a newer one.
 */
export function useMailingDraft(onMessage: AdminMessageSink) {
  const [draft, setDraft] = useState<MailingDraft>(EMPTY_MAILING_DRAFT);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewCount, setPreviewCount] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const requestRef = useRef(0);
  const dirtyRef = useRef(false);

  const requestPreview = useCallback(async (next: MailingDraft, options?: { quiet?: boolean }): Promise<MailingPreviewAnswer | null> => {
    const requestId = ++requestRef.current;
    if (!options?.quiet) setPreviewLoading(true);
    try {
      const response = await fetchWithDeadline('/api/admin/mailings/preview', {
        method: 'POST',
        headers: authJsonHeaders(),
        body: JSON.stringify(next),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : 'Не удалось собрать предпросмотр');
      if (requestId === requestRef.current) {
        setPreviewHtml(String(data.html || ''));
        setPreviewCount(Number(data.recipientCount || 0));
      }
      return data as unknown as MailingPreviewAnswer;
    } catch (error) {
      if (requestId === requestRef.current) {
        setPreviewHtml('');
        setPreviewCount(0);
        if (!options?.quiet) onMessage({ type: 'err', text: errorText(error, 'Не удалось собрать предпросмотр') });
      }
      return null;
    } finally {
      if (requestId === requestRef.current) setPreviewLoading(false);
    }
  }, [onMessage]);

  useEffect(() => {
    if (!draft.subject.trim() || !draft.htmlBody.trim()) return undefined;
    const timer = window.setTimeout(() => void requestPreview(draft, { quiet: true }), PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, requestPreview]);

  const invalidatePreview = () => {
    requestRef.current += 1;
    setPreviewHtml('');
    setPreviewCount(0);
    setPreviewLoading(false);
  };

  const update = (patch: Partial<MailingDraft>, options?: { invalidatePreview?: boolean }) => {
    setDraft(current => ({ ...current, ...patch }));
    dirtyRef.current = true;
    if (options?.invalidatePreview) invalidatePreview();
  };

  const applyTemplate = (template: MailingTemplate) => {
    if (dirtyRef.current && !window.confirm('Заменить текущий текст выбранным шаблоном?')) return;
    setDraft(current => ({
      subject: template.subject || EMPTY_MAILING_DRAFT.subject,
      preheader: template.preheader || EMPTY_MAILING_DRAFT.preheader,
      htmlBody: template.htmlBody || EMPTY_MAILING_DRAFT.htmlBody,
      segment: current.segment,
      templateKey: template.id,
    }));
    dirtyRef.current = false;
  };

  return { draft, previewHtml, previewCount, previewLoading, requestPreview, update, applyTemplate };
}
