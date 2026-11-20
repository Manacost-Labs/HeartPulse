import React, { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { pluralRu } from '../shared/text/pluralRu';
import type { ArchetypeBuild, ArchetypeFormat } from './archetypeBuildViews';
import { buildsWindowNote } from './archetypeBuildsModel';
import { openBuildAsBuild, openBuildCards, type OpenBuild, type OpenBuilds } from './archetypeOpenBuilds';
import ConstructedArchetypeDeckGallery from './ConstructedArchetypeDeckGallery';

/** Builds the gallery shows at first and adds with each «Загрузить ещё». */
const BUILDS_PAGE = 8;

type Item = { format: ArchetypeFormat; archetype: string; archetypeLabel: string; classKey: string | null; deckCount: number };

/**
 * The open builds a page holds and the pages a guest adds: the server's first page, then the next pages of the same
 * public answer. The list a subscriber's page shows instead is the caller's `paid`.
 */
export function useOpenBuildList(open: OpenBuilds | undefined) {
  const [more, setMore] = useState<OpenBuild[]>([]);
  const [next, setNext] = useState(open?.next ?? null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const builds = useMemo(() => [...(open?.builds ?? []), ...more], [open?.builds, more]);
  const load = async () => {
    if (!open?.loadMore || next === null) return;
    setState('loading');
    try {
      const page = await open.loadMore(next);
      const seen = new Set(builds.map(build => build.deckCode));
      setMore(current => [...current, ...page.builds.filter(build => !seen.has(build.deckCode))]);
      setNext(page.next);
      setState('idle');
    } catch {
      setState('error');
    }
  };
  return { builds, next: open?.loadMore ? next : null, state, load };
}

function MoreButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" className="archetype-builds__more" disabled={disabled} onClick={onClick}>{label}<ChevronDown size={17} /></button>;
}

/**
 * «Сборки архетипа»: the subscriber's gallery for everyone. A guest's gallery stands on the open builds (their card
 * lists are drawn from the server's answer); once the paid answer has its builds they take over in the same gallery,
 * the open ones keeping their place, so nothing remounts.
 */
export function ArchetypeBuildsSection({ item, open, paid, pagePeriod }: {
  item: Item; open: OpenBuilds | undefined; paid: ArchetypeBuild[] | null; pagePeriod: string | null;
}) {
  const [visible, setVisible] = useState(BUILDS_PAGE);
  const list = useOpenBuildList(open);
  const seeds = useMemo(() => new Map(list.builds.flatMap(build => {
    const cards = openBuildCards(build, item.format);
    return cards ? [[build.deckCode, cards] as const] : [];
  })), [list.builds, item.format]);
  const builds = paid ?? list.builds.map(openBuildAsBuild);
  // Without builds the page's own «Колоды появятся…» note stands; builds the allowlist refused leave one short line,
  // and the next page may still have some.
  if (!builds.length) {
    if (item.deckCount === 0) return null;
    const left = list.next === null ? 0 : Math.max(1, (open?.total ?? 0) - list.next);
    return (
      <section className="archetype-builds" aria-labelledby="archetype-builds-title" data-tour-id="archetype-builds">
        <header className="archetype-section-heading"><div><h2 id="archetype-builds-title">Сборки архетипа</h2>
          {left ? null : <p>Сборок пока нет.</p>}</div></header>
        {left ? <MoreButton label={list.state === 'loading' ? 'Загружаем сборки…' : `Загрузить ещё ${Math.min(BUILDS_PAGE, left)}`}
          disabled={list.state === 'loading'} onClick={() => void list.load()} /> : null}
        {list.state === 'error' ? <p role="alert" className="archetype-builds__error">Сборки не загрузились. Попробуйте ещё раз.</p> : null}
      </section>
    );
  }
  const shown = paid ? builds.slice(0, visible) : builds;
  const total = paid ? builds.length : Math.max(open?.total ?? 0, builds.length);
  const note = buildsWindowNote(builds, pagePeriod);
  const remaining = paid ? builds.length - visible : list.next === null ? 0 : Math.max(1, total - list.next);
  return (
    <section className="archetype-builds" aria-labelledby="archetype-builds-title" data-tour-id="archetype-builds">
      <header className="archetype-section-heading">
        <div>
          <h2 id="archetype-builds-title">Сборки архетипа</h2>
          <p>Сборки отсортированы по размеру выборки. Код можно скопировать и сразу импортировать в Hearthstone.</p>
          {note ? <small className="archetype-builds__window">{note}</small> : null}
        </div>
        <span className="archetype-section-heading__count">{total} {pluralRu(total, 'сборка', 'сборки', 'сборок')}</span>
      </header>
      <ConstructedArchetypeDeckGallery builds={shown} format={item.format} archetype={item.archetype}
        archetypeLabel={item.archetypeLabel} classKey={item.classKey} seeds={seeds} />
      {remaining > 0 ? (
        <MoreButton label={!paid && list.state === 'loading' ? 'Загружаем сборки…' : `Загрузить ещё ${Math.min(BUILDS_PAGE, remaining)}`}
          disabled={!paid && list.state === 'loading'} onClick={() => (paid ? setVisible(value => value + BUILDS_PAGE) : void list.load())} />
      ) : null}
      {!paid && list.state === 'error' ? <p role="alert" className="archetype-builds__error">Сборки не загрузились. Попробуйте ещё раз.</p> : null}
    </section>
  );
}
