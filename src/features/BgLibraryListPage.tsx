import React, { useEffect, useRef, useState } from 'react';
import { SectionBanner } from '../shared/ui/EditorialRouteChrome';
import { LibraryControls } from '../modules/battlegrounds/public';
import { TierBadge } from '../modules/arenaTierList/public';
import PaywallGate, { type PaywallAccessState } from '../components/PaywallGate';
import { preferredScrollBehavior } from '../shared/ui/scrollBehavior';
import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import { BgLibraryListSkeleton } from './BgLibraryListSkeleton';
import { BattlegroundLoadError } from './BattlegroundsSkeletons';
import { LibraryCardTile } from './BgLibraryCardTile';
import { tavernIcon, type LibraryCard, type LibraryMeta } from './bgLibraryCards';
import { LIBRARY_SECTIONS, sectionFor, sectionHref, type LibraryKind, type PoolMode } from './bgLibrarySections';
import { useBgLibraryListFilters, type BgLibraryListFilters, type LibraryCardGroup } from './useBgLibraryListFilters';
import '../modules/battlegrounds/public.css';
import '../route-parchment.css';
import '../battlegrounds-shell.css';
import '../battlegrounds-parchment.css';

/** The cards of a listing and the state of their read; `retry` asks the source again. */
export type BgLibraryListData = {
  data: { cards: LibraryCard[]; meta: LibraryMeta } | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
};

const EMPTY_CARDS: LibraryCard[] = [];
const EMPTY_META: LibraryMeta = {};
/** The closed part of a listing for a viewer without access, named by the page's JSON-LD (`hasPart.cssSelector`). */
export const BG_LIBRARY_PAYWALLED_CLASS = 'paywalled-library';
/** The offer of the listing's locks: what the subscription adds to the library (not the meta's default copy). */
const LOCK_OFFER = {
  title: 'Архив карт и фильтры по механикам доступны подписчикам',
  description: 'Без подписки открыт актуальный пул. Подписка добавляет архив прошлых пулов, фильтры по механикам и статистику карт по ходам.',
  benefits: ['Архив прошлых пулов', 'Фильтры по механикам', 'Статистика карт по ходам'],
  actionLabel: 'Открыть библиотеку',
};

function LibraryGroups({ grouped, pool, navigatePath }: { grouped: LibraryCardGroup[]; pool: PoolMode; navigatePath: (path: string) => void }) {
  return <div className="space-y-8">
    {grouped.map((group, groupIndex) => <div key={group.key}>
      <div className="mb-4 flex items-center gap-3">
        {group.tavernTier && <img src={tavernIcon(group.tavernTier)} alt="" className="h-10 w-10" loading="lazy" />}
        <h2 className="font-hs text-2xl text-[#26374f]">{group.tier ? <TierBadge tier={group.tier} /> : group.label}</h2>
        <span className="rounded-full border border-[#d6e1f1] bg-white px-2.5 py-1 text-xs font-bold text-[#60718a]">{group.items.length}</span>
        <div className="h-px flex-1 bg-[#cbd9ed]" />
      </div>
      <div className="grid overflow-visible grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {group.items.map((card, cardIndex) => <LibraryCardTile key={`${card.dbf}-${card.card_id}`} card={card} pool={pool}
          navigatePath={navigatePath} tourId={groupIndex === 0 && cardIndex === 0 ? 'bg-library-results' : undefined} />)}
      </div>
    </div>)}
  </div>;
}

function ArchivePager({ archive }: { archive: BgLibraryListFilters['archive'] }) {
  const { page, pageCount, pages, setPage } = archive;
  const plain = 'rounded-md border border-[#cbd9ed] bg-white px-4 py-2 font-semibold text-[#33445d] disabled:cursor-not-allowed disabled:opacity-45';
  return <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
    <button type="button" disabled={page === 1} onClick={() => setPage(Math.max(1, page - 1))} className={plain}>Назад</button>
    {pages.map((number, index) => <React.Fragment key={number}>
      {index > 0 && number - pages[index - 1] > 1 && <span className="px-1 text-[#657893]">...</span>}
      <button type="button" onClick={() => setPage(number)}
        className={`h-10 min-w-10 rounded-md border px-3 font-semibold ${number === page ? 'border-[#e4c675] bg-[#e4c675] text-[#101827]' : 'border-[#cbd9ed] bg-white text-[#33445d] hover:border-[#d3af55]'}`}>
        {number}
      </button>
    </React.Fragment>)}
    <button type="button" disabled={page === pageCount} onClick={() => setPage(Math.min(pageCount, page + 1))} className={plain}>Вперёд</button>
  </div>;
}

function selections(filters: BgLibraryListFilters) {
  const label = (options: [string, string][], value: string) => options.find(([slug]) => slug === value)?.[1] || value;
  return [
    ...(filters.query ? [{ id: 'query', label: filters.query, remove: () => filters.setQuery('') }] : []),
    ...filters.tavernFilters.map(tier => ({ id: `tier-${tier}`, label: `Таверна ${tier}`, remove: () => filters.toggleTavern(tier) })),
    ...filters.raceFilters.map(slug => ({ id: `race-${slug}`, label: label(filters.creatureTypes, slug), remove: () => filters.toggleRace(slug) })),
    ...(filters.mechanic !== 'ALL' ? [{ id: 'mechanic', label: label(filters.mechanics, filters.mechanic), remove: () => filters.setMechanic('ALL') }] : []),
    ...(filters.groupFilter !== 'ALL' ? [{ id: 'group', label: label(filters.cardGroups, filters.groupFilter), remove: () => filters.setGroupFilter('ALL') }] : []),
    ...(filters.includeDuos ? [{ id: 'duos', label: 'Duo', remove: () => filters.setIncludeDuos(false) }] : []),
  ];
}

/** The cards of a listing by group, its read state and the paging. */
function LibraryResults({ filters, pool, title, loading, error, retry, navigatePath }: {
  filters: BgLibraryListFilters; pool: PoolMode; title: string; loading: boolean; error: string | null; retry: () => void;
  navigatePath: (path: string) => void;
}) {
  const empty = !loading && !error && filters.filtered.length === 0;
  return <section className="bg-library-results overflow-visible p-1 sm:p-2" aria-busy={!loading && filters.query !== filters.deferredQuery}>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-hs text-xl text-[#26374f]">{title}</p></div>
    </div>
    {loading && <BgLibraryListSkeleton />}
    {error && <BattlegroundLoadError message={error} onRetry={retry} />}
    {empty && <div className="rounded-md border border-[#cbd9ed] bg-[#ffffff] p-8 text-center text-[#657893]">
      <p>По выбранным фильтрам ничего не найдено.</p>
      <button type="button" className="mt-3 min-h-[44px] underline" onClick={filters.reset}>Сбросить фильтры</button>
    </div>}
    <LibraryGroups grouped={filters.grouped} pool={pool} navigatePath={navigatePath} />
    {pool === 'archive' && filters.archive.pageCount > 1 && <ArchivePager archive={filters.archive} />}
    {filters.more && <div className="mt-8 text-center">
      <button type="button" onClick={filters.more} className="rounded-md border border-[#e4c675] bg-[#e4c675] px-6 py-3 font-hs text-[#101827]">Показать ещё</button>
    </div>}
  </section>;
}

/** The subscription offer of a locked control, scrolled into view on every press of a lock. */
function useLockOffer(enabled: boolean) {
  const [presses, setPresses] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (presses > 0) ref.current?.scrollIntoView({ block: 'center', behavior: preferredScrollBehavior() });
  }, [presses]);
  return { open: enabled && presses > 0, ref, press: () => setPresses(count => count + 1) };
}

/**
 * A listing of the Battlegrounds library: search, filters by tavern tier, tribe, mechanic and group, the cards by tier
 * and «Показать ещё» (pages in the archive). `library` holds the cards: the subscriber's catalog, or the open listing.
 * With `paywall` (a viewer without access) the controls that need closed data — the archive and the mechanics — stay
 * in place with a lock whose press opens the subscription offer under the controls.
 */
export function BgLibraryListPage({ kind, pool, navigatePath, library, paywall, heading = 'Библиотека Полей сражений' }: {
  kind: LibraryKind; pool: PoolMode; navigatePath: (path: string) => void; library: BgLibraryListData; paywall?: PaywallAccessState;
  /** The page's H1: the server page names its listing («Существа Полей сражений»). */
  heading?: string;
}) {
  const { data, loading, error, retry } = library;
  const cards = data?.cards ?? EMPTY_CARDS;
  const filters = useBgLibraryListFilters(cards, data?.meta ?? EMPTY_META, kind, pool);
  const offer = useLockOffer(Boolean(paywall));
  const activeSection = sectionFor(kind);
  return <div className="bg-library-page space-y-6 text-[#26374f]">
    <SectionBanner title={heading} />
    <p className="text-sm text-[#5e708a]">{pool === 'archive' ? 'Архив' : 'Актуальный пул'} · {activeSection.shortTitle}</p>
    <LibraryControls
      section={kind} pool={pool}
      sections={LIBRARY_SECTIONS.map(section => ({ value: section.kind, label: section.shortTitle }))}
      pools={[{ value: 'current', label: 'Актуальный пул' }, { value: 'archive', label: 'Архив', disabled: !activeSection.supportsArchive }]}
      onSection={value => navigatePath(canonicalPagePath(sectionHref(value as LibraryKind, pool)))}
      onPool={value => navigatePath(canonicalPagePath(sectionHref(kind, value as PoolMode)))}
      query={filters.query} onQuery={filters.setQuery}
      tiers={filters.tavernFilters} onTier={filters.toggleTavern} onClearTiers={() => filters.setTavernFilters([])}
      races={kind === 'minion' ? filters.creatureTypes : []} selectedRaces={filters.raceFilters}
      onRace={filters.toggleRace} onClearRaces={() => filters.setRaceFilters([])}
      mechanics={filters.mechanics} mechanic={filters.mechanic} onMechanic={filters.setMechanic}
      groups={filters.cardGroups} group={filters.groupFilter} onGroup={filters.setGroupFilter}
      duos={filters.includeDuos} onDuos={() => filters.setIncludeDuos(value => !value)}
      selections={selections(filters)} onReset={filters.reset} resultCount={filters.filtered.length} totalCount={cards.length}
      locked={paywall ? { onOpen: offer.press, offerOpen: offer.open, className: BG_LIBRARY_PAYWALLED_CLASS } : undefined}
    />
    {paywall && offer.open && <div ref={offer.ref}>
      <PaywallGate active presentation="inline" headingLevel="h2" {...paywall} {...LOCK_OFFER} />
    </div>}
    <LibraryResults filters={filters} pool={pool} title={`${activeSection.shortTitle} · ${pool === 'archive' ? 'Архив' : 'Актуальный пул'}`}
      loading={loading} error={error} retry={retry} navigatePath={navigatePath} />
  </div>;
}
