'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { fetchWithDeadline } from '@/src/shared/http/fetchWithDeadline';
import { publicArchetypeTeaser, type OpenArchetypeBuild } from '@/apps/public-web/lib/publicArchetypeTeaserData';
import { ArchetypeOpenBuild } from './ArchetypeOpenBuild';

const PAGE = 8;

type Loaded = { builds: OpenArchetypeBuild[]; at: number };

/**
 * «Загрузить ещё» of the open builds, for a guest as for a subscriber: the
 * next page of the same public answer (`?buildsOffset=`), checked by the same
 * allowlist as the server page. An archetype lists up to 200 builds, so the
 * server prints only the first page instead of carrying them all in the RSC payload.
 */
export function ArchetypeOpenBuildsMore({ format, slug, label, shown, total }: {
  format: 'standard' | 'wild'; slug: string; label: string; shown: number; total: number;
}) {
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const more = loaded.flatMap(page => page.builds.map(build => ({ build, at: page.at })));
  const next = shown + more.length;
  const load = async () => {
    setState('loading');
    try {
      const response = await fetchWithDeadline(`/api/constructed-archetypes/teaser/${format}/${slug}?buildsOffset=${next}`, { deadlineMs: 10_000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const builds = publicArchetypeTeaser(await response.json(), format, slug).openBuilds;
      if (!builds.length) throw new Error('No builds on the page');
      setLoaded(pages => [...pages, { builds, at: Date.now() }]);
      setState('idle');
    } catch {
      setState('error');
    }
  };
  return <>
    {more.map(({ build, at }, index) => <ArchetypeOpenBuild key={`${shown + index}:${build.deckCode}`} build={build} format={format}
      now={at} title={`${label}, сборка ${shown + index + 1}`} />)}
    {next < total ? <div className="archetype-open-builds__more">
      <button type="button" className="archetype-builds__more" disabled={state === 'loading'} onClick={() => void load()}>
        {state === 'loading' ? 'Загружаем сборки…' : `Загрузить ещё ${Math.min(PAGE, total - next)}`}
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {state === 'error' ? <p role="alert">Сборки не загрузились. Попробуйте ещё раз.</p> : null}
    </div> : null}
  </>;
}
