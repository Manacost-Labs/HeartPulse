import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  createBattlegroundHeroTierResource,
  BattlegroundHeroMmr,
  BattlegroundHeroMode,
  BattlegroundHeroSortDirection,
  BattlegroundHeroSortKey,
  BattlegroundHeroTierEntry,
} from '../modules/battlegrounds/public';

/** The state of the hero ranking of `/heroes/`: its options, the address it reads and writes, search and counts. */
export type BattlegroundHeroView = 'grid' | 'table';
export type HeroTierResource = ReturnType<typeof createBattlegroundHeroTierResource>;

export const BG_HERO_MODES: Array<{ id: BattlegroundHeroMode; label: string; hint: string }> = [
  { id: 'solo', label: 'Соло', hint: 'Обычные матчи' },
  { id: 'duos', label: 'Дуо', hint: 'Командные матчи' },
];
export const BG_HERO_MMR_OPTIONS: Array<{ id: BattlegroundHeroMmr; label: string }> = [
  { id: 'TOP_50_PERCENT', label: 'Топ 50%' },
  { id: 'TOP_20_PERCENT', label: 'Топ 20%' },
  { id: 'TOP_5_PERCENT', label: 'Топ 5%' },
  { id: 'TOP_1_PERCENT', label: 'Топ 1%' },
];
export const OPEN_MMR: BattlegroundHeroMmr = 'TOP_50_PERCENT';

function bgHeroModeFromValue(value: unknown): BattlegroundHeroMode {
  return String(value || '').toLowerCase() === 'duos' ? 'duos' : 'solo';
}

function bgHeroMmrFromValue(value: unknown): BattlegroundHeroMmr {
  const normalized = String(value || '').toUpperCase();
  return BG_HERO_MMR_OPTIONS.some(option => option.id === normalized)
    ? normalized as BattlegroundHeroMmr
    : OPEN_MMR;
}

function bgHeroViewFromValue(value: unknown): BattlegroundHeroView {
  return String(value || '').toLowerCase() === 'table' ? 'table' : 'grid';
}

function bgHeroSortKeyFromValue(value: unknown): BattlegroundHeroSortKey {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'pickrate') return 'pickRate';
  if (normalized === 'averageplace') return 'averagePlace';
  return 'tier';
}

function bgHeroSortDirectionFromValue(value: unknown, sortKey: BattlegroundHeroSortKey): BattlegroundHeroSortDirection {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'asc' || normalized === 'desc') return normalized;
  return sortKey === 'pickRate' ? 'desc' : 'asc';
}

type HeroListUrlState = {
  mode: BattlegroundHeroMode;
  mmr: BattlegroundHeroMmr;
  view: BattlegroundHeroView;
  search: string;
  sortKey: BattlegroundHeroSortKey;
  sortDirection: BattlegroundHeroSortDirection;
};

function bgHeroListUrlState(search: string): HeroListUrlState {
  const params = new URLSearchParams(search);
  const sortKey = bgHeroSortKeyFromValue(params.get('sort'));
  return {
    mode: bgHeroModeFromValue(params.get('mode')),
    mmr: bgHeroMmrFromValue(params.get('mmr')),
    view: bgHeroViewFromValue(params.get('view')),
    search: String(params.get('q') || '').slice(0, 120),
    sortKey,
    sortDirection: bgHeroSortDirectionFromValue(params.get('dir'), sortKey),
  };
}

export function bgHeroSearchText(hero: BattlegroundHeroTierEntry, tier: string): string {
  return [
    hero.name,
    hero.originalName,
    tier,
    hero.averagePlace,
    hero.popularity,
    hero.bestComposition,
    hero.heroPower?.name,
    hero.heroPower?.text,
  ].filter(Boolean).join(' ');
}

export function bgNormalizeHeroSearch(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9%.,\s-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function bgHeroCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun = mod10 === 1 && mod100 !== 11
    ? 'герой'
    : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'героя' : 'героев');
  return `${count} ${noun}`;
}

/** The list's controls, query and address: a server-rendered view applies the address only after hydration. */
export function useHeroListState(serverRendered: boolean, locked: boolean) {
  const initial = useMemo(
    () => bgHeroListUrlState(serverRendered || typeof window === 'undefined' ? '' : window.location.search),
    [serverRendered],
  );
  const [mode, setMode] = useState<BattlegroundHeroMode>(initial.mode);
  const [requestedMmr, setMmr] = useState<BattlegroundHeroMmr>(initial.mmr);
  const [view, setView] = useState<BattlegroundHeroView>(initial.view);
  const [searchTerm, setSearchTerm] = useState(initial.search);
  const [sortKey, setSortKey] = useState<BattlegroundHeroSortKey>(initial.sortKey);
  const [sortDirection, setSortDirection] = useState<BattlegroundHeroSortDirection>(initial.sortDirection);
  // A state, not a ref: the address is written only once the render with the applied values has happened.
  const [addressApplied, setAddressApplied] = useState(!serverRendered);

  useEffect(() => {
    if (addressApplied) return;
    const state = bgHeroListUrlState(window.location.search);
    setMode(state.mode); setMmr(state.mmr); setView(state.view); setSearchTerm(state.search);
    setSortKey(state.sortKey); setSortDirection(state.sortDirection);
    setAddressApplied(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !addressApplied) return;
    const params = new URLSearchParams();
    if (mode !== 'solo') params.set('mode', mode);
    // The requested range, not the shown one: a locked range asked for in the address stays there for the
    // subscriber's view that replaces this one once access is confirmed.
    if (requestedMmr !== OPEN_MMR) params.set('mmr', requestedMmr);
    if (view !== 'grid') params.set('view', view);
    if (sortKey !== 'tier') params.set('sort', sortKey);
    if (sortDirection !== (sortKey === 'pickRate' ? 'desc' : 'asc')) params.set('dir', sortDirection);
    if (searchTerm.trim()) params.set('q', searchTerm.trim());
    const nextUrl = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [addressApplied, requestedMmr, mode, searchTerm, sortDirection, sortKey, view]);

  const onSort = useCallback((field: BattlegroundHeroSortKey) => {
    if (field === sortKey) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(field);
    setSortDirection(field === 'pickRate' ? 'desc' : 'asc');
  }, [sortKey]);

  return { mode, setMode, mmr: locked ? OPEN_MMR : requestedMmr, setMmr, view, setView, searchTerm, setSearchTerm,
    sortKey, sortDirection, onSort };
}

export type HeroListState = ReturnType<typeof useHeroListState>;
