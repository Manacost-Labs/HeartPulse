import { useEffect, type KeyboardEvent, type RefObject } from 'react';
import { LoaderCircle } from 'lucide-react';
import { useListNavigation } from '../../vendor/valyro-ui/primitives/useListNavigation';
import { SearchPalettePanel, type PaletteLocks } from './SearchPalettePanel';
import { useGlobalSearch } from './useGlobalSearch';
import { paletteGroups, type PaletteEntry } from './searchPaletteModel';

/** What the header input drives in the palette once its code has loaded. */
export type PaletteHandle = { onKeyDown: (event: KeyboardEvent) => void; highlight: (index: number) => void };

/**
 * The open header palette: remote results, grouping and the highlighted row.
 * Loaded on first use, so pages carry only the header field; the field keeps
 * focus and names the highlighted row through `aria-activedescendant`.
 */
export default function SearchPalette({ panelId, query, admin, recent, locks, openingArticleId, articleError, onRun, handleRef, onActiveOption, onLoading }: {
  panelId: string;
  query: string;
  admin: boolean;
  recent: PaletteEntry[];
  locks: PaletteLocks;
  openingArticleId: string;
  articleError: string;
  onRun: (entry: PaletteEntry) => void;
  handleRef: RefObject<PaletteHandle | null>;
  onActiveOption: (id: string | undefined) => void;
  onLoading: (loading: boolean) => void;
}) {
  const { results, loading, error } = useGlobalSearch(query);
  const groups = paletteGroups({
    query, admin, recent,
    archetypes: results.archetypes, cards: results.search?.cards ?? [], articles: results.search?.articles ?? [],
  });
  const count = groups.reduce((total, group) => total + group.entries.length, 0);
  const list = useListNavigation({
    count,
    initialIndex: query.trim() ? 0 : -1,
    // The row's own handler runs the entry, so a highlighted link behaves exactly like a click on it.
    onSelect: index => document.getElementById(`${panelId}-option-${index}`)?.click(),
  });
  const { activeIndex, onKeyDown, setActiveIndex } = list;
  useEffect(() => {
    handleRef.current = { onKeyDown, highlight: setActiveIndex };
    return () => { handleRef.current = null; };
  }, [handleRef, onKeyDown, setActiveIndex]);
  useEffect(() => { onActiveOption(activeIndex >= 0 ? `${panelId}-option-${activeIndex}` : undefined); }, [activeIndex, onActiveOption, panelId]);
  useEffect(() => { onLoading(loading); }, [loading, onLoading]);
  useEffect(() => () => { onActiveOption(undefined); onLoading(false); }, [onActiveOption, onLoading]);
  return <>
    {loading && <LoaderCircle size={16} className="global-search__spinner" aria-label="Идет поиск" />}
    <SearchPalettePanel panelId={panelId} groups={groups} activeIndex={activeIndex} onHighlight={setActiveIndex} onRun={onRun}
      query={query} loading={loading} error={articleError || error} locks={locks} openingArticleId={openingArticleId} />
  </>;
}
