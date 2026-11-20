import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LayoutGrid, List, LockKeyhole, Search } from 'lucide-react';
import {
  useBattlegroundHeroTierData,
  type BattlegroundHeroMode,
  type BattlegroundHeroTierSection,
} from '../modules/battlegrounds/public';
import '../modules/battlegrounds/public.css';
import { TierBadge } from '../modules/arenaTierList/public';
import PaywallGate, { type PaywallAccessState } from '../components/PaywallGate';
import { useViewEntrance } from '../components/transitions/useViewEntrance';
import { preferredScrollBehavior } from '../shared/ui/scrollBehavior';
import { BattlegroundHeroCard as MemoBattlegroundHeroCard } from './BattlegroundHeroCard';
import { BattlegroundHeroListSkeleton, BattlegroundLoadError } from './BattlegroundsSkeletons';
import '../route-parchment.css';
import './Battlegrounds.css';
import '../battlegrounds-shell.css';
import '../battlegrounds-parchment.css';

import {
  BG_HERO_MMR_OPTIONS, BG_HERO_MODES, OPEN_MMR, bgHeroCountLabel, bgHeroSearchText, bgNormalizeHeroSearch, useHeroListState,
  type HeroListState, type HeroTierResource,
} from './battlegroundHeroListState';

export { BG_HERO_MMR_OPTIONS, bgHeroCountLabel } from './battlegroundHeroListState';

const BattlegroundHeroLedger = React.lazy(() => import('./BattlegroundHeroLedger'));

function HeroModeControl({ state, resource }: { state: HeroListState; resource: HeroTierResource }) {
  return (
    <fieldset className="bg-heroes-control-group">
      <legend>Тип игры</legend>
      <div className="bg-heroes-segmented">
        {BG_HERO_MODES.map(option => (
          <button key={option.id} type="button" aria-pressed={state.mode === option.id} title={option.hint}
            onPointerEnter={() => { void resource.load(option.id, state.mmr).catch(() => undefined); }}
            onFocus={() => { void resource.load(option.id, state.mmr).catch(() => undefined); }}
            onClick={() => state.setMode(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** For a viewer without access the narrower ranges are locks; their fieldset is the page's `.paywalled-heroes`. */
function HeroRangeControl({ state, resource, locked, offer, onLocked }: {
  state: HeroListState; resource: HeroTierResource; locked: boolean; offer: boolean; onLocked: () => void;
}) {
  return (
    <fieldset className={`bg-heroes-control-group bg-heroes-control-group--mmr${locked ? ' paywalled-heroes' : ''}`}>
      <legend>Рейтинг игроков</legend>
      <div className="bg-heroes-segmented">
        {BG_HERO_MMR_OPTIONS.map(option => {
          const closed = locked && option.id !== OPEN_MMR;
          const prefetch = closed ? undefined : () => { void resource.load(state.mode, option.id).catch(() => undefined); };
          return (
            <button key={option.id} type="button" aria-pressed={state.mmr === option.id}
              aria-expanded={closed ? offer : undefined} className={closed ? 'bg-heroes-locked' : undefined}
              title={closed ? 'Доступно по подписке' : undefined} onPointerEnter={prefetch} onFocus={prefetch}
              onClick={closed ? onLocked : () => state.setMmr(option.id)}>
              {closed && <LockKeyhole aria-hidden="true" />}
              {option.label}
              {closed && <span className="sr-only"> — по подписке</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function HeroViewControl({ state }: { state: HeroListState }) {
  return (
    <fieldset className="bg-heroes-control-group bg-heroes-control-group--view">
      <legend>Вид списка</legend>
      <div className="bg-heroes-segmented bg-heroes-view-toggle">
        <button type="button" aria-pressed={state.view === 'grid'} aria-label="Показать карточками" title="Карточки"
          onClick={() => state.setView('grid')}>
          <LayoutGrid aria-hidden="true" />
          <span>Карточки</span>
        </button>
        <button type="button" aria-pressed={state.view === 'table'} aria-label="Показать таблицей" title="Таблица"
          onClick={() => state.setView('table')}>
          <List aria-hidden="true" />
          <span>Таблица</span>
        </button>
      </div>
    </fieldset>
  );
}

function HeroListLegend({ state, source, totalHeroes, visibleHeroes, searching }: {
  state: HeroListState; source: ReactNode; totalHeroes: number; visibleHeroes: number; searching: boolean;
}) {
  return (
    <>
      <div className="bg-heroes-tools__legend">
        <div className="bg-heroes-tools__explanation">
          <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">
            {state.mode === 'duos' ? 'Командный рейтинг' : 'Одиночный рейтинг'}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#6b4c2a]">
            {state.view === 'table'
              ? 'Таблица объединяет силу героя, состав и распределение мест в одной строке.'
              : 'На карточках указаны среднее место и частота выбора героя.'}
          </p>
          {source && <p className="bg-heroes-tools__source">{source}</p>}
        </div>
        <div className="bg-heroes-tools__metrics" aria-label="Обозначения показателей" data-tour-id="bg-heroes-metrics">
          <span className="bg-heroes-metric bg-heroes-metric--placement"><strong>4,06</strong>Среднее место</span>
          <span className="bg-heroes-metric bg-heroes-metric--pickrate"><strong>23.05%</strong>Выбор героя</span>
        </div>
      </div>
      <label className="bg-heroes-search" data-tour-id="bg-heroes-search">
        <span className="sr-only">Поиск по героям</span>
        <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
        <input type="search" value={state.searchTerm} onChange={event => state.setSearchTerm(event.target.value)}
          placeholder="Герой, сила героя или состав — на русском и английском"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
        {state.searchTerm && <button type="button" onClick={() => state.setSearchTerm('')} className="bg-heroes-search__reset">Сбросить</button>}
        <span className="bg-heroes-search__count">
          {searching ? `${visibleHeroes} / ${bgHeroCountLabel(totalHeroes)}` : bgHeroCountLabel(totalHeroes)}
        </span>
      </label>
    </>
  );
}

function HeroTierSections({ sections, onNavigate }: { sections: BattlegroundHeroTierSection[]; onNavigate: (path: string) => void }) {
  return <>{sections.map((section, sectionIndex) => {
    const heroes = Array.isArray(section.heroes) ? section.heroes : [];
    if (!heroes.length) return null;
    return (
      <section key={section.tier} className="rounded-lg border border-[#c4a46a]/35 bg-[#fff3d8]/65 p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-3">
          <TierBadge tier={section.tier} />
          <div>
            <h3 className="font-hs text-lg text-[#3d2a1e]">{section.title || `Тир ${section.tier}`}</h3>
            <p className="text-xs text-[#8b6c42]">{bgHeroCountLabel(heroes.length)}</p>
          </div>
        </div>
        <div className="bg-heroes-grid grid gap-3">
          {heroes.map((hero, heroIndex) => (
            <MemoBattlegroundHeroCard key={`${section.tier}-${hero.dbfId || hero.name}`} hero={hero} tier={section.tier}
              onNavigate={onNavigate} tourId={sectionIndex === 0 && heroIndex === 0 ? 'bg-heroes-results' : undefined} />
          ))}
        </div>
      </section>
    );
  })}</>;
}

function HeroListResults({ state, sections, filteredSections, loading, error, onRetry, onNavigate, onLocked }: {
  state: HeroListState; sections: BattlegroundHeroTierSection[]; filteredSections: BattlegroundHeroTierSection[];
  loading: boolean; error: string; onRetry: () => void; onNavigate: (path: string) => void; onLocked?: () => void;
}) {
  const viewRef = useViewEntrance<HTMLDivElement>(state.view);
  return (
    <>
      {loading && sections.length === 0 && <BattlegroundHeroListSkeleton />}
      {loading && sections.length > 0 && (
        <div className="bg-heroes-refresh-status" role="status" aria-live="polite">Обновляем рейтинг…</div>
      )}
      {error && !loading && <BattlegroundLoadError message={error} onRetry={onRetry} />}
      {sections.length > 0 && !error && (
        <div className={state.view === 'grid' ? 'space-y-5' : ''} aria-busy={loading} ref={viewRef}>
          {filteredSections.length === 0 && (
            <div className="rounded-2xl border border-[#d7b66a]/65 bg-[#fff9ed] p-6 text-center font-hs text-[#6b4c2a]">
              Герои не найдены
            </div>
          )}
          {state.view === 'table' && filteredSections.length > 0
            ? (
                <React.Suspense fallback={<div className="py-10 text-center font-hs text-[#6b4c2a]" role="status">Подготавливаем таблицу…</div>}>
                  <BattlegroundHeroLedger sections={filteredSections} mode={state.mode} mmr={state.mmr} sortKey={state.sortKey}
                    sortDirection={state.sortDirection} onSort={state.onSort} onNavigate={onNavigate} onLockedClick={onLocked} />
                </React.Suspense>
              )
            : <HeroTierSections sections={filteredSections} onNavigate={onNavigate} />}
        </div>
      )}
    </>
  );
}

/**
 * The hero ranking of `/heroes/`: mode, rating range, cards or table, search and tier sections.
 * A subscriber and a guest get this same view. With `paywall` (a viewer without access) the
 * rating range stays at the open «Топ 50%» and the closed parts (the narrower ranges, the
 * placement distribution, the best composition) are shown in place with a lock that opens the
 * subscription offer next to the controls. `serverRendered`: the view is part of the server HTML,
 * so the first render ignores the address and applies its query after hydration.
 */
export function BattlegroundHeroTierList({ resource, onNavigate, onRetry, paywall, serverRendered = false, sourceNote }: {
  resource: HeroTierResource;
  onNavigate: (path: string) => void;
  onRetry: () => void;
  paywall?: PaywallAccessState;
  serverRendered?: boolean;
  /** The line under the legend for a mode, in place of the resource's text (the open page dates it with `<time>`). */
  sourceNote?: (mode: BattlegroundHeroMode) => ReactNode;
}) {
  const locked = Boolean(paywall);
  const state = useHeroListState(serverRendered, locked);
  // Every press of a lock counts: a lock far down the table brings the offer by the controls into view each time.
  const [offerPresses, setOfferPresses] = useState(0);
  const offer = offerPresses > 0;
  const offerRef = useRef<HTMLDivElement | null>(null);
  const openOffer = useCallback(() => setOfferPresses(count => count + 1), []);
  useEffect(() => {
    if (offerPresses) offerRef.current?.scrollIntoView({ block: 'nearest', behavior: preferredScrollBehavior() });
  }, [offerPresses]);
  const { sections, sourceLabel, loading, error } = useBattlegroundHeroTierData(resource, state.mode, state.mmr);
  const normalizedSearch = bgNormalizeHeroSearch(useDeferredValue(state.searchTerm));
  const filteredSections = useMemo(() => !normalizedSearch ? sections : sections.flatMap(section => {
    const heroes = section.heroes.filter(hero => bgNormalizeHeroSearch(bgHeroSearchText(hero, section.tier)).includes(normalizedSearch));
    return heroes.length ? [{ ...section, heroes }] : [];
  }), [normalizedSearch, sections]);
  const count = (list: BattlegroundHeroTierSection[]) => list.reduce((sum, section) => sum + section.heroes.length, 0);

  return (
    <div className="bg-heroes-page space-y-5">
      <section className="bg-heroes-tools">
        <div className="bg-heroes-controls">
          <HeroModeControl state={state} resource={resource} />
          <HeroRangeControl state={state} resource={resource} locked={locked} offer={offer} onLocked={openOffer} />
          <HeroViewControl state={state} />
        </div>
        {paywall && offer && (
          <div ref={offerRef}>
            <PaywallGate active presentation="inline" headingLevel="h2"
              title="Узкие диапазоны рейтинга, составы и распределение мест доступны подписчикам" {...paywall} />
          </div>
        )}
        <HeroListLegend state={state} source={sourceNote ? sourceNote(state.mode) : sourceLabel} totalHeroes={count(sections)}
          visibleHeroes={count(filteredSections)} searching={Boolean(normalizedSearch)} />
      </section>
      <HeroListResults state={state} sections={sections} filteredSections={filteredSections} loading={loading} error={error}
        onRetry={onRetry} onNavigate={onNavigate} onLocked={paywall ? openOffer : undefined} />
    </div>
  );
}
