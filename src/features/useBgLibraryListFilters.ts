import { useDeferredValue, useMemo, useState } from 'react';
import {
  cleanSearch, compareLibraryCards, INITIAL_VISIBLE_CARDS, libraryDisplayGroup, searchText,
  type LibraryCard, type LibraryDisplayGroup, type LibraryMeta,
} from './bgLibraryCards';
import { isArchiveDisplayCard } from './bgLibraryCardImages';
import type { LibraryKind, PoolMode } from './bgLibrarySections';

export const MORE_VISIBLE_CARDS = 36;
export const ARCHIVE_PAGE_SIZE = 72;

export type LibraryCardGroup = LibraryDisplayGroup & { items: LibraryCard[] };
type Options = [string, string][];

const sortedOptions = (seen: Map<string, string>): Options => Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ru'));

/** The filter options a listing offers: tribes (catalog order first), mechanics and groups of its cards. */
function useLibraryOptions(cards: LibraryCard[], meta: LibraryMeta) {
  const creatureTypes = useMemo(() => {
    const seen = new Map<string, string>();
    (meta.creature_types || []).forEach(item => { if (item.slug && item.name_ru) seen.set(item.slug, item.name_ru); });
    cards.forEach(card => { if (card.creature_type?.slug && card.creature_type?.name_ru) seen.set(card.creature_type.slug, card.creature_type.name_ru); });
    return Array.from(seen.entries()).filter(([slug]) => slug !== 'all');
  }, [cards, meta.creature_types]);
  const mechanics = useMemo(() => {
    const seen = new Map<string, string>();
    (meta.mechanics || []).forEach(item => seen.set(item.slug, item.name_ru));
    cards.forEach(card => (card.mechanics || []).forEach(item => seen.set(item.slug, item.name_ru)));
    return sortedOptions(seen);
  }, [cards, meta.mechanics]);
  const cardGroups = useMemo(() => {
    const seen = new Map<string, string>();
    cards.forEach(card => {
      const slug = card.group?.slug || card.group?.name_ru;
      const label = card.group?.name_ru || card.group?.slug;
      if (slug && label) seen.set(String(slug), String(label));
    });
    return sortedOptions(seen);
  }, [cards]);
  return { creatureTypes, mechanics, cardGroups };
}

function groupCards(cards: LibraryCard[], kind: LibraryKind): LibraryCardGroup[] {
  const groups = new Map<string, LibraryCardGroup>();
  cards.forEach(card => {
    const group = libraryDisplayGroup(card, kind);
    const entry = groups.get(group.key) ?? { ...group, items: [] };
    entry.items.push(card);
    groups.set(group.key, entry);
  });
  return Array.from(groups.values());
}

function archivePageNumbers(count: number, current: number): number[] {
  const pages = new Set<number>([1, count, current]);
  for (let page = current - 2; page <= current + 2; page += 1) if (page >= 1 && page <= count) pages.add(page);
  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * The search, filters and paging of a library listing over `cards`, the same for the subscriber's catalog and the
 * open listing. Paging starts over with any filter; a host renders one listing per section and pool (`key`), so the
 * filters start empty there.
 */
export function useBgLibraryListFilters(cards: LibraryCard[], meta: LibraryMeta, kind: LibraryKind, pool: PoolMode) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [tavernFilters, setTavernFilters] = useState<string[]>([]);
  const [raceFilters, setRaceFilters] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [mechanic, setMechanic] = useState('ALL');
  const [includeDuos, setIncludeDuos] = useState(false);
  // The paging belongs to one set of filters: another set starts at the first page.
  const filterKey = JSON.stringify([query, tavernFilters, raceFilters, groupFilter, mechanic, includeDuos]);
  const [paging, setPaging] = useState({ filterKey, count: INITIAL_VISIBLE_CARDS, page: 1 });
  const current = paging.filterKey === filterKey ? paging : { filterKey, count: INITIAL_VISIBLE_CARDS, page: 1 };
  const visibleCount = current.count;
  const archivePage = current.page;
  const setArchivePage = (page: number) => setPaging({ ...current, page });
  const searchIndex = useMemo(() => [...cards].sort(compareLibraryCards(kind)).map(card => ({ card, search: searchText(card) })), [cards, kind]);
  const options = useLibraryOptions(cards, meta);

  const filtered = useMemo(() => {
    const needle = cleanSearch(deferredQuery);
    const tavernSet = new Set(tavernFilters);
    const raceSet = new Set(raceFilters);
    return searchIndex.filter(({ card, search }) => isArchiveDisplayCard(card, kind, pool)
      && (!needle || search.includes(needle))
      && (includeDuos || !card.duos_only)
      && (tavernSet.size === 0 || tavernSet.has(String(card.tavern_tier || '')))
      && (kind !== 'minion' || raceSet.size === 0 || raceSet.has(card.creature_type?.slug || ''))
      && (groupFilter === 'ALL' || String(card.group?.slug || card.group?.name_ru || '') === groupFilter)
      && (mechanic === 'ALL' || (card.mechanics || []).some(item => item.slug === mechanic))).map(({ card }) => card);
  }, [deferredQuery, groupFilter, includeDuos, kind, mechanic, pool, raceFilters, searchIndex, tavernFilters]);

  const archivePageCount = Math.max(1, Math.ceil(filtered.length / ARCHIVE_PAGE_SIZE));
  const page = Math.min(archivePage, archivePageCount);
  const archiveStart = (page - 1) * ARCHIVE_PAGE_SIZE;
  const visible = useMemo(() => pool === 'archive'
    ? filtered.slice(archiveStart, archiveStart + ARCHIVE_PAGE_SIZE) : filtered.slice(0, visibleCount), [archiveStart, filtered, pool, visibleCount]);
  const grouped = useMemo(() => groupCards(visible, kind), [kind, visible]);
  const toggle = (value: string) => (current: string[]) => current.includes(value) ? current.filter(item => item !== value) : [...current, value];

  return {
    ...options, query, setQuery, deferredQuery, tavernFilters, setTavernFilters, raceFilters, setRaceFilters,
    groupFilter, setGroupFilter, mechanic, setMechanic, includeDuos, setIncludeDuos, filtered, grouped,
    toggleTavern: (tier: string) => setTavernFilters(toggle(tier)),
    toggleRace: (slug: string) => setRaceFilters(toggle(slug)),
    reset: () => {
      setQuery(''); setTavernFilters([]); setRaceFilters([]); setGroupFilter('ALL'); setMechanic('ALL'); setIncludeDuos(false);
    },
    archive: { page, pageCount: archivePageCount, pages: archivePageNumbers(archivePageCount, page), setPage: setArchivePage },
    more: pool !== 'archive' && visibleCount < filtered.length ? () => setPaging({ ...current, count: visibleCount + MORE_VISIBLE_CARDS }) : null,
  };
}

export type BgLibraryListFilters = ReturnType<typeof useBgLibraryListFilters>;
