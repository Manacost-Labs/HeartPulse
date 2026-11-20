import React, { useCallback, useEffect, useState } from 'react';
import { BattlegroundsTierListSearchIntro } from '../modules/searchLanding/public';
import {
  BATTLEGROUND_TIER_LISTS,
  battlegroundTierListMetaLine,
  TierListToolbar,
  type BattlegroundTierListKey,
} from '../modules/battlegrounds/public';
import { TierBadge } from '../modules/arenaTierList/public';
import PaywallGate, { type PaywallAccessState } from '../components/PaywallGate';
import { preferredScrollBehavior } from '../shared/ui/scrollBehavior';
import { tierItemsForDisplay, type TrinketView } from './battlegroundTrinkets';
import { BattlegroundLoadError } from './BattlegroundsSkeletons';
import { BattlegroundTierListSkeleton } from './BattlegroundTierListSkeleton';
import { MemoBattlegroundTierCard } from './BattlegroundTierCard';
import { BattlegroundTierListLightbox } from './BattlegroundTierListLightbox';
import { minionFilters, strategyFilters, trinketFilters, type TierListFilters } from './BattlegroundTierListFilters';
import {
  BG_TIER_VISIBLE_STEP, bgLightboxItem, bgTierInitialVisible, bgStrategyLightboxItems, type BattlegroundLightboxItem,
} from './battlegroundTierListItems';
import {
  BG_TIER_ORDER, OPEN_TIER_LIST,
  bgStrategyMatchesDeepLink, bgTierListRequest, bgTierListUrlState, bgVisibleLimitKey, type BattlegroundTierListUrlState,
} from './battlegroundTierListState';
import { useDisplayedTiers } from './useBattlegroundTierListView';
import { hasTierEntries, liveBattlegroundTierListSource, useBattlegroundTierListData, type BattlegroundTierListSource } from './useBattlegroundTierListData';
import '../modules/battlegrounds/public.css';
import '../route-parchment.css';
import './Battlegrounds.css';
import '../battlegrounds-shell.css';
import '../battlegrounds-parchment.css';
import './BattlegroundTierList.css';

/** The lists a viewer without access cannot open: their tabs carry a lock that opens the offer. */
const LOCKED_LISTS: readonly BattlegroundTierListKey[] = BATTLEGROUND_TIER_LISTS.map(entry => entry.id).filter(id => id !== OPEN_TIER_LIST);

function lightboxGallery(displayedTiers: Record<string, any[]>, list: BattlegroundTierListKey): BattlegroundLightboxItem[] {
  return BG_TIER_ORDER.flatMap(tier => (Array.isArray(displayedTiers[tier]) ? displayedTiers[tier] : []).flatMap((entry: any, index: number) => {
    if (list === 'strategies') return bgStrategyLightboxItems(entry, tier);
    const item = bgLightboxItem(entry, list, tier, index);
    return item ? [item] : [];
  }));
}

function TierSection({ tier, items, list, limit, onMore, highlight, onOpen, trinketView, firstResult }: {
  tier: string; items: any[]; list: BattlegroundTierListKey; limit: number; onMore: () => void;
  highlight: { key: string; title: string }; onOpen: (item: BattlegroundLightboxItem) => void; trinketView: TrinketView; firstResult: boolean;
}) {
  const visibleItems = tierItemsForDisplay(items, list, limit);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);
  return (
    <section className="bg-tierlist__tier" data-tier={tier} aria-labelledby={`bg-tierlist-tier-${tier}`}>
      <h3 id={`bg-tierlist-tier-${tier}`} className="bg-tierlist__tier-head">
        <TierBadge tier={tier} />
        <span className="bg-tierlist__tier-count">{items.length.toLocaleString('ru-RU')}</span>
      </h3>
      {list === 'trinkets' && trinketView === 'table' && (
        <div className="bg-trinket-tier-table-head" aria-hidden="true">
          <span>Аксессуар</span><span>Выбор</span><span>Среднее место</span><span>Места 1–8</span>
        </div>
      )}
      <div className={list === 'trinkets'
        ? trinketView === 'gallery' ? 'bg-trinket-tier-gallery' : 'bg-trinket-tier-table'
        : `bg-tierlist__grid bg-tierlist__grid--${list}`}>
        {visibleItems.map((item: any, idx: number) => (
          <React.Fragment key={`${list}-${tier}-${item.id || item.key || item.name || 'item'}-${idx}`}>
            <MemoBattlegroundTierCard item={item} list={list} tier={tier} index={idx}
              highlighted={list === 'strategies' && bgStrategyMatchesDeepLink(item, highlight.key, highlight.title)}
              onOpen={onOpen} trinketView={trinketView} tourId={firstResult && idx === 0 ? 'bg-tier-list-results' : undefined} />
          </React.Fragment>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button type="button" className="bg-tierlist__more" onClick={onMore}>
          Показать ещё {Math.min(hiddenCount, BG_TIER_VISIBLE_STEP[list]).toLocaleString('ru-RU')}
        </button>
      )}
    </section>
  );
}

/**
 * The Battlegrounds tier lists (minions, strategies, spells, trinkets). A subscriber and a guest get this same
 * view. `source` is where the slices are read (the protected lists by default). With `paywall` (a viewer without
 * access) the view stays on the open builds and the other lists' tabs are locked in place: a press opens the
 * subscription offer. `serverRendered`: the view is part of the server HTML, so the first render ignores the
 * address and applies it after hydration. `onDataReady` tells a host that keeps an open list in front of this
 * view that the list this view really asked for came back ok and not empty; it is never called otherwise.
 */
export function BattlegroundTierList({ source = liveBattlegroundTierListSource, onDataReady, paywall, serverRendered = false }: {
  source?: BattlegroundTierListSource; onDataReady?: () => void; paywall?: PaywallAccessState; serverRendered?: boolean;
} = {}) {
  const locked = Boolean(paywall);
  const [state, setState] = useState<BattlegroundTierListUrlState>(
    () => bgTierListUrlState(serverRendered || typeof window === 'undefined' ? '' : window.location.search, locked));
  const patch = useCallback((next: Partial<BattlegroundTierListUrlState>) => setState(current => ({ ...current, ...next })), []);
  const activeList = locked && LOCKED_LISTS.includes(state.list) ? OPEN_TIER_LIST : state.list;
  const [offer, setOffer] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [lightbox, setLightbox] = useState<{ items: BattlegroundLightboxItem[]; index: number }>({ items: [], index: -1 });
  const [minionRace, setMinionRace] = useState('ALL');
  const [minionTavern, setMinionTavern] = useState('ALL');
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});
  const listTitle = BATTLEGROUND_TIER_LISTS.find(item => item.id === activeList)?.title;
  useEffect(() => {
    const syncFromUrl = () => {
      const next = bgTierListUrlState(window.location.search, locked);
      setState(next);
      if (locked && LOCKED_LISTS.includes(next.list)) setOffer(true);
    };
    if (serverRendered) syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [locked, serverRendered]);

  const request = bgTierListRequest(activeList, state.source, state.trinketMmr, state.trinketTimeRange);
  const { data, loading, error, reset } = useBattlegroundTierListData(source, request, activeList, attempt);
  const activeData = data?.list === activeList ? data : null;
  useEffect(() => {
    if (!error && activeData && hasTierEntries(activeData)) onDataReady?.();
  }, [activeData, error, onDataReady]);
  const view = useDisplayedTiers(activeData, activeList, minionRace, minionTavern, state.trinketSize);
  const highlight = { key: state.strategyKey, title: state.strategyTitle };
  const hasStrategyHighlight = activeList === 'strategies' && Boolean(highlight.key || highlight.title);
  const openLightbox = useCallback((item: BattlegroundLightboxItem) => {
    const gallery = lightboxGallery(view.displayedTiers, activeList);
    const found = gallery.findIndex(entry => entry.key === item.key);
    // Key miss (stale UI / schema drift): still open the clicked card, not gallery[0].
    setLightbox(found >= 0 ? { items: gallery, index: found } : { items: [item, ...gallery.filter(entry => entry.key !== item.key)], index: 0 });
  }, [activeList, view.displayedTiers]);
  const setLightboxIndex = useCallback((index: number) => setLightbox(current => ({ ...current, index })), []);

  useEffect(() => {
    if (!hasStrategyHighlight || loading) return undefined;
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>('[data-bg-strategy-highlight="true"]');
      if (target) target.scrollIntoView({ block: 'center', behavior: preferredScrollBehavior() });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [view.displayedTiers, hasStrategyHighlight, loading]);

  const selectList = (list: BattlegroundTierListKey) => {
    if (locked && LOCKED_LISTS.includes(list)) return void setOffer(true);
    reset();
    setLightbox({ items: [], index: -1 });
    patch({ list, trinketSize: list === 'trinkets' ? 'LARGE' : 'ALL', ...(list === 'strategies' ? {} : { strategyKey: '', strategyTitle: '' }) });
    setMinionRace('ALL');
    setMinionTavern('ALL');
    setVisibleLimits({});
    const params = new URLSearchParams(window.location.search);
    params.set('list', list);
    if (list !== 'strategies') params.delete('source');
    for (const [key, value] of [['size', 'LARGE'], ['mmr', state.trinketMmr], ['timeRange', state.trinketTimeRange], ['view', state.trinketView]]) {
      if (list === 'trinkets') params.set(key, value);
      else params.delete(key);
    }
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
  };
  const ready = !loading && !error;
  // A server-rendered view writes the time in Moscow time: the server and the browser then print the same text.
  const meta = activeData?.count !== undefined
    ? battlegroundTierListMetaLine({ shown: view.displayedCount, total: Number(activeData.count), source: activeData.source,
      fetchedAt: activeData.fetchedAt, timeZone: serverRendered ? 'Europe/Moscow' : undefined })
    : '';
  // Race and tavern choices come from the loaded minions; the other lists' filters do not depend on the data.
  let filters: TierListFilters = {};
  if (activeList === 'minions' && ready) {
    filters = minionFilters({ ...view.minionOptions, race: minionRace, onRace: setMinionRace, tavern: minionTavern, onTavern: setMinionTavern });
  } else if (activeList === 'strategies') {
    filters = strategyFilters({ source: state.source, onSource: value => patch({ source: value }) });
  } else if (activeList === 'trinkets') {
    filters = trinketFilters({
      sizes: view.trinketSizes, size: state.trinketSize, onSize: value => patch({ trinketSize: value }),
      view: state.trinketView, onView: value => patch({ trinketView: value }),
      mmr: state.trinketMmr, onMmr: value => { patch({ trinketMmr: value }); setVisibleLimits({}); },
      timeRange: state.trinketTimeRange, onTimeRange: value => { patch({ trinketTimeRange: value }); setVisibleLimits({}); },
    });
  }

  return (
    <div className="bg-tier-list-page">
      <BattlegroundsTierListSearchIntro />
      <section key={`bg-tier-list-${activeList}`} className="bg-tierlist" aria-labelledby="bg-tierlist-title">
        <h2 id="bg-tierlist-title" className="sr-only">{listTitle}</h2>
        <TierListToolbar list={activeList} onList={selectList} meta={meta} primary={filters.primary} secondary={filters.secondary}
          locked={locked ? LOCKED_LISTS : undefined} lockedClassName="paywalled-builds" offerOpen={offer} />
        {paywall && offer && (
          <PaywallGate active presentation="inline" headingLevel="h2"
            title="Тир-листы существ, заклинаний и аксессуаров доступны подписчикам" {...paywall} />
        )}
        {loading && <BattlegroundTierListSkeleton list={activeList} />}
        {error && !loading && <div className="bg-tierlist__error"><BattlegroundLoadError message={error} onRetry={() => setAttempt(value => value + 1)} /></div>}
        {ready && BG_TIER_ORDER.map(tier => {
          const items = Array.isArray(view.displayedTiers[tier]) ? view.displayedTiers[tier] : [];
          if (!items.length) return null;
          const key = bgVisibleLimitKey(activeList, tier);
          const limit = visibleLimits[key] ?? bgTierInitialVisible(activeList, tier);
          return <TierSection key={`${activeList}-${tier}`} tier={tier} items={items} list={activeList} limit={limit}
            onMore={() => setVisibleLimits(current => ({ ...current, [key]: Math.min(items.length, limit + BG_TIER_VISIBLE_STEP[activeList]) }))}
            highlight={highlight} onOpen={openLightbox} trinketView={state.trinketView} firstResult={tier === view.firstResultTier} />;
        })}
      </section>
      <BattlegroundTierListLightbox items={lightbox.items} index={lightbox.index} onIndex={setLightboxIndex} trinkets={activeList === 'trinkets'} />
    </div>
  );
}
