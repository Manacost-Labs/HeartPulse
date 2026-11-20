'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { fetchWithDeadline } from '@/src/shared/http/fetchWithDeadline';
import { publicArchetypeTeaser, type OpenArchetypeBuild } from '@/apps/public-web/lib/publicArchetypeTeaserData';
import { ArchetypeOpenBuild } from './ArchetypeOpenBuild';

const PAGE = 8;
/** Pages read in one click at most while the allowlist refuses every build of them. */
const MAX_PAGES_PER_CLICK = 5;

type Shown = { build: OpenArchetypeBuild; at: number };

/**
 * «Загрузить ещё» of the open builds, for a guest as for a subscriber: the
 * next page of the same public answer, checked by the same allowlist as the
 * server page. The offset is the source's (`nextOffset` of the last answer),
 * never the count of builds shown, so a refused build neither repeats the
 * next one nor hides it; a code already shown is not shown again. An
 * archetype lists up to 200 builds, so the server prints only the first page
 * instead of carrying them all in the RSC payload.
 */
export function ArchetypeOpenBuildsMore({ format, slug, label, shownCodes, next: firstNext, total }: {
  format: 'standard' | 'wild'; slug: string; label: string; shownCodes: string[]; next: number | null; total: number;
}) {
  const [more, setMore] = useState<Shown[]>([]);
  const [next, setNext] = useState(firstNext);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const load = async () => {
    setState('loading');
    try {
      const seen = new Set([...shownCodes, ...more.map(({ build }) => build.deckCode)]);
      const fresh: Shown[] = [];
      let offset = next;
      for (let pages = 0; offset !== null && !fresh.length && pages < MAX_PAGES_PER_CLICK; pages += 1) {
        const response = await fetchWithDeadline(`/api/constructed-archetypes/teaser/${format}/${slug}?buildsOffset=${offset}`, { deadlineMs: 10_000 });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const page = publicArchetypeTeaser(await response.json(), format, slug);
        const at = Date.now();
        for (const build of page.openBuilds) {
          if (!seen.has(build.deckCode)) { seen.add(build.deckCode); fresh.push({ build, at }); }
        }
        offset = page.openBuildsNext !== null && page.openBuildsNext > offset ? page.openBuildsNext : null;
      }
      setMore(current => [...current, ...fresh]);
      setNext(offset);
      setState('idle');
    } catch {
      setState('error');
    }
  };
  const shown = shownCodes.length;
  return <>
    {more.map(({ build, at }, index) => <ArchetypeOpenBuild key={build.deckCode} build={build} format={format}
      now={at} title={`${label}, сборка ${shown + index + 1}`} />)}
    {next !== null ? <div className="archetype-open-builds__more">
      <button type="button" className="archetype-builds__more" disabled={state === 'loading'} onClick={() => void load()}>
        {state === 'loading' ? 'Загружаем сборки…' : `Загрузить ещё ${Math.max(1, Math.min(PAGE, total - next))}`}
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {state === 'error' ? <p role="alert">Сборки не загрузились. Попробуйте ещё раз.</p> : null}
    </div> : null}
  </>;
}
