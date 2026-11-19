'use client';

import { useEffect, useState } from 'react';
import type { PatchNotesDetail } from '@/src/modules/patchNotes/public';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { patchNotesHref } from '@/src/modules/patchNotes/public';
import { PatchNotesView } from '@/src/features/PatchNotesView';
import '@/src/features/PatchNotesView.css';
import { fetchWithDeadline } from '@/src/shared/http/fetchWithDeadline';
import { PatchNotesSkeleton } from '@/src/features/patchNotes/PatchNotesSkeleton';
import { SectionBanner } from '@/src/shared/ui/EditorialRouteChrome';
import type { PublicPatchNotes } from '@/apps/public-web/lib/publicPatchNotes';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

type State = { patches: PatchNotesDetail[] | null; error: 'missing' | 'failed' | null };

async function readJson<T>(path: string, signal: AbortSignal): Promise<T | 'missing'> {
  const response = await fetchWithDeadline(path, { signal, headers: { Accept: 'application/json' } });
  if (response.status === 404) return 'missing';
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

/** Public patch notes: the server seeds what it read in time, the browser loads the rest. */
export function PatchNotesPageClient({ version, initial }: { version: string | null; initial: PublicPatchNotes }) {
  const access = usePublicAccess();
  const [state, setState] = useState<State>({ patches: initial.patches, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state.patches || state.error) return undefined;
    const controller = new AbortController();
    const path = version ? `/api/patch-notes/${encodeURIComponent(version)}` : '/api/patch-notes/recent';
    void readJson<PatchNotesDetail | { patches: PatchNotesDetail[] }>(path, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result === 'missing') return setState({ patches: null, error: 'missing' });
      const patches = 'patches' in result ? result.patches : [result];
      setState(patches.length ? { patches, error: null } : { patches: null, error: 'missing' });
    }, () => {
      if (!controller.signal.aborted) setState(current => ({ ...current, error: 'failed' }));
    });
    return () => controller.abort();
  }, [version, attempt, state.patches, state.error]);

  return <PublicPageShell activeTab="patch-notes" pathname="/standard/patches/" access={access} navigate={navigate} wide>
    <section className="space-y-5">
      {/* The skeleton carries the page heading itself, so only the missing and failed states show the route banner. */}
      {!state.patches && state.error && <SectionBanner title="Патчноуты Hearthstone" />}
      {state.patches
        ? <PatchNotesView patches={state.patches} />
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
            : <PatchNotesSkeleton />}
    </section>
  </PublicPageShell>;
}
