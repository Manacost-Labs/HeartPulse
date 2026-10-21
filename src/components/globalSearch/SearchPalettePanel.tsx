import { BookOpen, ChevronRight, Clock3, Compass, Library, ListTree, LoaderCircle, LockKeyhole } from 'lucide-react';
import type { MouseEvent } from 'react';
import { isPlainNavigationClick } from '../../app/routing/isPlainNavigationClick';
import { NAVIGATION_ROUTES } from '../../app/routing/navigationDefinitions';
import type { PaletteEntry, PaletteGroup } from './searchPaletteModel';

const PAGE_ICONS = new Map(NAVIGATION_ROUTES.map(route => [`page:${route.id}`, route.icon]));
const GROUP_ICONS = { recent: Clock3, pages: Compass, archetypes: ListTree, cards: Library, articles: BookOpen } as const;

export type PaletteLocks = {
  /** A confirmed refusal of a VIP article: it leads to sign-in. */
  article: (entry: Extract<PaletteEntry, { kind: 'article' }>) => boolean;
  /** Card statistics are paid; the card page itself stays open. */
  cardStatistics: boolean;
};

function Thumb({ entry }: { entry: PaletteEntry }) {
  if (entry.kind === 'card') {
    return <span className="global-search-result__thumb is-card">
      {entry.image ? <img src={entry.image} alt="" loading="lazy" /> : <Library size={18} aria-hidden="true" />}
    </span>;
  }
  if (entry.kind === 'article') {
    return <span className="global-search-result__thumb is-article">
      {entry.article.image ? <img src={entry.article.image} alt="" loading="lazy" /> : <BookOpen size={18} aria-hidden="true" />}
    </span>;
  }
  if (entry.kind === 'archetype') {
    return <span className="global-search-result__thumb is-archetype">
      <img src={`/class_icon/ui/${entry.classKey}-64.webp`} alt="" loading="lazy" />
    </span>;
  }
  const Icon = PAGE_ICONS.get(entry.id) ?? Compass;
  return <span className="global-search-result__thumb is-page"><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span>;
}

/**
 * The header palette's results: one listbox whose rows keep DOM order equal to
 * keyboard order. The input owns focus and names the highlighted row through
 * `aria-activedescendant`; rows are still real links (and article buttons),
 * so a pointer, middle-click or Tab works as before.
 */
export function SearchPalettePanel({ panelId, groups, activeIndex, onHighlight, onRun, query, loading, error, locks, openingArticleId }: {
  panelId: string;
  groups: PaletteGroup[];
  activeIndex: number;
  onHighlight: (index: number) => void;
  onRun: (entry: PaletteEntry) => void;
  query: string;
  loading: boolean;
  error: string;
  locks: PaletteLocks;
  openingArticleId: string;
}) {
  let index = -1;
  const remote = query.trim().length >= 2;
  const empty = groups.every(group => group.entries.length === 0);
  return (
    <div id={panelId} className="global-search-panel" role="region" aria-label="Результаты глобального поиска">
      {error && <p className="global-search-state is-error" role="alert">{error}</p>}
      {empty && remote && !error && <p className="global-search-state" role="status">
        {loading ? 'Ищем разделы, архетипы, карты и статьи…' : 'Ничего не найдено. Попробуйте название карты, архетипа, механику или тему статьи.'}
      </p>}
      <div id={`${panelId}-list`} role="listbox" aria-label="Разделы, архетипы, карты и статьи">
        {groups.map(group => {
          const Icon = GROUP_ICONS[group.id];
          return (
            <section key={group.id} className={`global-search-group is-${group.id}`} role="group" aria-labelledby={`${panelId}-${group.id}`}>
              {/* A listbox owns only groups and options: the group's name is a presentational label. */}
              <div id={`${panelId}-${group.id}`} className="global-search-group__title" role="presentation"><Icon size={15} aria-hidden="true" /> {group.title}</div>
              {group.entries.map(entry => {
                const rowIndex = ++index;
                const highlighted = rowIndex === activeIndex;
                const common = {
                  id: `${panelId}-option-${rowIndex}`,
                  role: 'option' as const,
                  'aria-selected': highlighted,
                  'data-highlighted': highlighted ? '' : undefined,
                  className: `global-search-result is-${entry.kind}`,
                  onPointerMove: () => { if (!highlighted) onHighlight(rowIndex); },
                };
                const copy = <span className="global-search-result__copy"><strong>{entry.label}</strong>{entry.meta && <small>{entry.meta}</small>}</span>;
                if (entry.kind === 'article') {
                  const locked = locks.article(entry);
                  return <button key={entry.id} type="button" {...common} onClick={() => onRun(entry)}>
                    <Thumb entry={entry} />{copy}
                    {openingArticleId === entry.article.id ? <LoaderCircle size={16} className="global-search__spinner" /> : locked ? <LockKeyhole size={16} aria-label="Нужна подписка" /> : <ChevronRight size={16} aria-hidden="true" />}
                  </button>;
                }
                return <a key={entry.id} href={entry.path} {...common} onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                  if (!isPlainNavigationClick(event)) return;
                  event.preventDefault();
                  onRun(entry);
                }}>
                  <Thumb entry={entry} />{copy}
                  {entry.kind === 'card' && locks.cardStatistics && <span className="global-search-result__diamond"><LockKeyhole size={12} aria-hidden="true" /> Статистика</span>}
                  {entry.kind === 'card' && <ChevronRight size={16} aria-hidden="true" />}
                </a>;
              })}
            </section>
          );
        })}
      </div>
      {remote && loading && !empty && <p className="global-search-state is-inline" role="status">Ищем ещё…</p>}
    </div>
  );
}
