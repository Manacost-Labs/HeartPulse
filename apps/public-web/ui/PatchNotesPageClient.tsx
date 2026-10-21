'use client';

import { useEffect, useState } from 'react';
import type { PatchNotesDetail, PatchNotesSummary } from '@/src/modules/patchNotes/public';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { patchNotesHref } from '@/src/modules/patchNotes/public';
import { PatchNotesView } from '@/src/features/PatchNotesView';
import { fetchWithDeadline } from '@/src/shared/http/fetchWithDeadline';
import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';
import { LoadingSurface } from '@/src/shared/ui/LoadingSurface';
import '@/src/shared/ui/LoadingSurface.css';
import type { PublicPatchNotes } from '@/apps/public-web/lib/publicPatchNotes';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

type State = { patch: PatchNotesDetail | null; archive: PatchNotesSummary[] | null; error: 'missing' | 'failed' | null };

async function readJson<T>(path: string, signal: AbortSignal): Promise<T | 'missing'> {
  const response = await fetchWithDeadline(path, { signal, headers: { Accept: 'application/json' } });
  if (response.status === 404) return 'missing';
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

/** Public patch notes: the server seeds what it read in time, the browser loads the rest. */
export function PatchNotesPageClient({ version, initial }: { version: string | null; initial: PublicPatchNotes }) {
  const access = usePublicAccess();
  const [state, setState] = useState<State>({ ...initial, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if ((state.patch && state.archive) || state.error) return undefined;
    const controller = new AbortController();
    void Promise.all([
      state.patch ? state.patch : readJson<PatchNotesDetail>(`/api/patch-notes/${encodeURIComponent(version ?? 'latest')}`, controller.signal),
      state.archive ? { patches: state.archive } : readJson<{ patches: PatchNotesSummary[] }>('/api/patch-notes', controller.signal),
    ]).then(([patch, list]) => {
      if (controller.signal.aborted) return;
      setState({
        patch: patch === 'missing' ? null : patch,
        archive: list === 'missing' ? [] : list.patches,
        error: patch === 'missing' ? 'missing' : null,
      });
    }, () => {
      if (!controller.signal.aborted) setState(current => ({ ...current, error: 'failed' }));
    });
    return () => controller.abort();
  }, [version, attempt, state.patch, state.archive, state.error]);

  return <PublicPageShell activeTab="patch-notes" pathname="/standard/patches/" access={access} navigate={navigate} wide>
    <section className="space-y-5">
      {!state.patch && <SectionBanner title="Патчноуты Hearthstone" subtitle="Что изменилось в картах Стандарта, Арены и Полей сражений: было → стало, усиления и ослабления" />}
      {state.patch
        ? <PatchNotesView patch={state.patch} archive={state.archive ?? []} onSelectVersion={navigate} />
        : state.error === 'missing'
          ? <p className="hp-patch-notes__notice" role="status">
            Патч {version} не найден в архиве. <a href={patchNotesHref(null)}>Открыть последний патч</a>
          </p>
          : state.error === 'failed'
            ? <div role="alert" className="hp-patch-notes__notice">
              <p>Архив патчей сейчас недоступен.</p>
              <button type="button" className="home-action home-action--primary"
                onClick={() => { setState(current => ({ ...current, error: null })); setAttempt(value => value + 1); }}>
                Повторить
              </button>
            </div>
            : <LoadingSurface label="Загружаем патчноуты" layout="rows" count={4} />}
    </section>
  </PublicPageShell>;
}
