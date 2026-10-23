import type React from 'react';
import { useState } from 'react';
import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import type { Contest } from '../../ContestAdminContests';
import { authJsonHeaders, errorText, readResponseJson, type AdminMessageSink } from '../adminSectionKit';
import { dateTimeInputToIso, parseDateTimeInput, parseWinnerIds } from './contestFormModel';
import type { useContestForm } from './useContestForm';

async function contestRequest(path: string, init: RequestInit, fallbackError: string) {
  const response = await fetchWithDeadline(path, { ...init, headers: authJsonHeaders() });
  const data = await readResponseJson(response);
  if (!response.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : fallbackError);
  return data;
}

type ContestActionsInput = {
  editor: ReturnType<typeof useContestForm>;
  selectedContestId: string;
  winnersText: string;
  onMessage: AdminMessageSink;
  reloadContests: (preferredContestId?: string) => Promise<void>;
  onDeselect: () => void;
};

/** Saving, deleting and publishing winners; each change reports in the toast and reloads the list. */
export function useContestActions({ editor, selectedContestId, winnersText, onMessage, reloadContests, onDeselect }: ContestActionsInput) {
  const [busy, setBusy] = useState(false);
  /** Runs one change with the shared busy flag and toast; resolves to the server answer or null. */
  const mutate = async (work: () => Promise<Record<string, unknown>>, okText: string) => {
    setBusy(true);
    onMessage(null);
    try {
      const data = await work();
      onMessage({ type: 'ok', text: okText });
      return data;
    } catch (error) {
      onMessage({ type: 'err', text: errorText(error, 'Действие не выполнено') });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const { form } = editor;
    const startsAt = parseDateTimeInput(form.startsAt);
    const endsAt = parseDateTimeInput(form.endsAt);
    if ((form.startsAt && !startsAt) || (form.endsAt && !endsAt)) {
      onMessage({ type: 'err', text: 'Проверьте дату и время конкурса.' });
      return;
    }
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
      onMessage({ type: 'err', text: 'Финиш конкурса должен быть позже старта.' });
      return;
    }
    const data = await mutate(() => contestRequest('/api/admin/contests', {
      method: 'POST',
      body: JSON.stringify({ ...form, startsAt: dateTimeInputToIso(form.startsAt), endsAt: dateTimeInputToIso(form.endsAt) }),
    }, 'Не удалось сохранить конкурс'), 'Конкурс сохранен.');
    if (!data) return;
    editor.clear();
    const saved = data.contest && typeof data.contest === 'object' ? (data.contest as { id?: unknown }).id : undefined;
    await reloadContests(saved ? String(saved) : undefined);
    editor.setView('manage');
  };

  const saveWinners = async () => {
    if (!selectedContestId) return;
    const winners = parseWinnerIds(winnersText);
    if (winners.length === 0) {
      onMessage({ type: 'err', text: 'Укажите хотя бы одного победителя из заявок конкурса.' });
      return;
    }
    if (!window.confirm(`Опубликовать ${winners.length} победител${winners.length === 1 ? 'я' : 'ей'} и завершить конкурс?`)) return;
    const data = await mutate(() => contestRequest(`/api/admin/contests/${encodeURIComponent(selectedContestId)}/winners`, {
      method: 'POST', body: JSON.stringify({ winners }),
    }, 'Не удалось сохранить победителей'), 'Победители опубликованы.');
    if (data) await reloadContests();
  };

  const remove = async (contest: Contest) => {
    if (!window.confirm(`Удалить конкурс «${contest.title}» вместе со всеми заявками?`)) return;
    const data = await mutate(() => contestRequest(`/api/admin/contests/${encodeURIComponent(contest.id)}`, { method: 'DELETE' },
      'Не удалось удалить конкурс'), 'Конкурс удален.');
    if (!data) return;
    if (selectedContestId === contest.id) onDeselect();
    if (editor.form.id === contest.id) editor.clear();
    await reloadContests();
  };

  return { busy, submit, saveWinners, remove };
}
