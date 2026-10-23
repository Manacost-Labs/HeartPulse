import { useRef, useState } from 'react';
import { preferredScrollBehavior } from '../../../shared/ui/scrollBehavior';
import type { Contest, ContestDraft, ContestWorkspaceView } from '../../ContestAdminContests';
import {
  addHoursForDateInput,
  EMPTY_CONTEST_DRAFT,
  formatDateTimeInput,
  parseDateTimeInput,
} from './contestFormModel';

/** The contest editor: the draft, which view is open and the quick start/end presets. */
export function useContestForm() {
  const [form, setForm] = useState<ContestDraft>(EMPTY_CONTEST_DRAFT);
  const [view, setView] = useState<ContestWorkspaceView>('manage');
  const formRef = useRef<HTMLFormElement | null>(null);

  const endAfterStart = (minutes: number) => setForm(current => {
    const start = parseDateTimeInput(current.startsAt) || new Date();
    return { ...current, endsAt: formatDateTimeInput(new Date(start.getTime() + minutes * 60 * 1000).toISOString()) };
  });

  return {
    form,
    view,
    formRef,
    setView,
    patch: (patch: Partial<ContestDraft>) => setForm(current => ({ ...current, ...patch })),
    clear: () => setForm(EMPTY_CONTEST_DRAFT),
    /** «Создать новый»: an empty draft in the editor. */
    startNew: () => {
      setForm(EMPTY_CONTEST_DRAFT);
      setView('editor');
    },
    edit: (contest: Contest) => {
      setView('editor');
      setForm({
        id: contest.id,
        title: contest.title,
        prize: contest.prize,
        imageUrl: contest.imageUrl,
        startsAt: formatDateTimeInput(contest.startsAt),
        endsAt: formatDateTimeInput(contest.endsAt),
        status: contest.status,
        description: contest.description,
      });
      window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' }));
    },
    startNow: () => setForm(current => ({ ...current, startsAt: addHoursForDateInput(0) })),
    startInHour: () => setForm(current => ({ ...current, startsAt: addHoursForDateInput(1) })),
    endInTenMinutes: () => endAfterStart(10),
    endInHour: () => endAfterStart(60),
    endTomorrow: () => endAfterStart(24 * 60),
  };
}
