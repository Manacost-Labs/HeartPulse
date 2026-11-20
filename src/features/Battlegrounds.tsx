import '../shared/ui/analytics/Analytics.css';
import '../modules/battlegrounds/public.css';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BattlegroundsStrategyBuilderSearchIntro,
} from '../modules/searchLanding/public';
import {
  battlegroundHeroCardImage,
  createBattlegroundHeroTierResource,
  type BattlegroundHeroTierData,
  battlegroundHeroRosterBridgeV1,
  battlegroundBuilderWorkbenchV1,
  preferredBattlegroundHeroImage,
  type BattlegroundHeroMmr,
  type BattlegroundHeroMode,
  type BattlegroundHeroRelatedCard,
  type BattlegroundHeroSortDirection,
  type BattlegroundHeroSortKey,
  type BattlegroundHeroTierEntry,
  type BattlegroundHeroTierSection,
} from '../modules/battlegrounds/public';
import { TierBadge } from '../modules/arenaTierList/public';
import { applyDocumentPageMeta } from '../shared/seo/publicUrlPolicy';
import { publicResourceUrl } from '../publicResourceUrl';
import { preferredBattlegroundGoldenBuddyImage } from '../modules/battlegrounds/public';
import { BattlegroundHeroDetailView } from './BattlegroundHeroDetailView';
import { BattlegroundHeroDetailAnalytics } from './BattlegroundHeroDetailAnalytics';
import { BG_FALLBACK_ICON, bgHeroDetailPortrait } from './battlegroundHeroDetailMedia';
import { BattlegroundHeroDetailSkeleton, BattlegroundLoadError, type BattlegroundHeroTeaser } from './BattlegroundsSkeletons';
import { BattlegroundTierList } from './BattlegroundTierList';
import { useBattlegroundHeroDetail } from './useBattlegroundHeroDetail';
import { BattlegroundHeroTierList, BG_HERO_MMR_OPTIONS } from './BattlegroundHeroTierList';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import { SERVER_RENDER_TIME_ZONE } from '../shared/ui/serverRenderTimeZone';
import '../route-parchment.css';
import './Battlegrounds.css';
import '../battlegrounds-shell.css';
import '../battlegrounds-parchment.css';
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ChevronLeft,
  LayoutGrid,
  List,
} from 'lucide-react';

const BG_MOSCOW_DATE = new Intl.DateTimeFormat('ru-RU', {
  timeZone: SERVER_RENDER_TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** « · обновлено 20 ноября 2026, 09:01 МСК», as the open hero ranking writes it; empty without a valid date. */
function bgMoscowDateLabel(iso: unknown): string {
  const date = new Date(String(iso || ''));
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(BG_MOSCOW_DATE.formatToParts(date).map(part => [part.type, part.value]));
  return ` · обновлено ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} МСК`;
}

interface BattlegroundHeroDetailPayload {
  ok?: boolean;
  stats?: any;
  libraryHero?: any;
  cards?: Record<string, any>;
  fetched_at?: string;
}

const BG_HERO_DETAIL_CLIENT_CACHE = new Map<string, BattlegroundHeroDetailPayload>();
const BG_HERO_COMPOSITION_CLIENT_CACHE = new Map<string, string>();
const BG_HERO_COMPOSITION_REQUESTS = new Map<string, Promise<string>>();
const BG_DUO_FALLBACK_DETAIL_IDS = new Set(['107183', '104981', '104982']);
let bgHeroLibraryClientCache: Map<number, any> | null = null;
let bgHeroLibraryRequest: Promise<Map<number, any>> | null = null;
let bgHeroImageMapClientCache: Record<string, string> | null = null;

function bgHeroApiUrl(mode: BattlegroundHeroMode, mmr: BattlegroundHeroMmr): string {
  const params = new URLSearchParams({ mode, mmr });
  return `/api/bg/heroes?${params.toString()}`;
}

async function bgLoadHeroLibrary(): Promise<Map<number, any>> {
  if (bgHeroLibraryClientCache) return bgHeroLibraryClientCache;
  if (bgHeroLibraryRequest) return bgHeroLibraryRequest;

  bgHeroLibraryRequest = fetchWithDeadline('/api/bg/library/extra/heroes?per_page=200')
    .then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Русская библиотека героев недоступна');
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const index = new Map<number, any>();
      rows.forEach((hero: any) => {
        const dbfId = Number(hero?.dbf ?? hero?.dbfId);
        if (Number.isFinite(dbfId)) index.set(dbfId, hero);
      });
      if (!index.size) throw new Error('Русская библиотека героев вернула пустой список');
      bgHeroLibraryClientCache = index;
      return index;
    })
    .finally(() => {
      bgHeroLibraryRequest = null;
    });
  return bgHeroLibraryRequest;
}

async function bgLoadHeroImageMap(): Promise<Record<string, string>> {
  if (bgHeroImageMapClientCache) return bgHeroImageMapClientCache;
  try {
    const response = await fetchWithDeadline('/bg-legacy/hero-tiers-data.js?v=heroes-20260626');
    if (!response.ok) return {};
    const parsed = parseLegacyHeroStatic(await response.text());
    bgHeroImageMapClientCache = parsed.imageByDbfId || {};
    return bgHeroImageMapClientCache;
  } catch {
    return {};
  }
}

function parseLegacyHeroTierData(source: string): BattlegroundHeroTierSection[] {
  const match = source.match(/window\.tierData\s*=\s*([\s\S]*?);\s*$/);
  if (!match) return [];
  try {
    const payload = match[1].replace(/;+\s*$/, '');
    return Function(`"use strict"; return (${payload});`)() as BattlegroundHeroTierSection[];
  } catch {
    return [];
  }
}

function parseLegacyHeroStatic(source: string): { imageByDbfId?: Record<string, string> } {
  const match = source.match(/window\.heroTierStatic\s*=\s*([\s\S]*?);\s*$/);
  if (!match) return {};
  try {
    const payload = match[1].replace(/;+\s*$/, '');
    return Function(`"use strict"; return (${payload});`)() as { imageByDbfId?: Record<string, string> };
  } catch {
    return {};
  }
}

function bgHeroImageFromMap(dbfId: unknown, imageByDbfId: Record<string, string>): string {
  const raw = imageByDbfId[String(dbfId)] || '';
  if (!raw) return '';
  if (raw.startsWith('/')) return raw;
  return `/bg-legacy/${raw.replace(/^\.\//, '')}`;
}

function bgHeroRelatedCard(value: any): BattlegroundHeroRelatedCard | null {
  const card = value?.card || value;
  const image = card?.image || card?.imageGold || card?.image_gold || card?.crop_image || '';
  if (!card || !image) return null;
  return {
    dbf: Number.isFinite(Number(card.dbf)) ? Number(card.dbf) : null,
    name: String(card.name || 'Карта героя'),
    text: card.text ? String(card.text) : '',
    image,
    imageGold: card.image_gold || card.imageGold || null,
    cropImage: card.crop_image || card.cropImage || null,
  };
}

function bgHeroCompositionName(value: any): string {
  if (typeof value === 'string') return value.trim();
  return String(value?.name || value?.composition || '').trim();
}

async function bgLoadHeroComposition(
  dbfId: number,
  mode: BattlegroundHeroMode,
  mmr: BattlegroundHeroMmr,
): Promise<string> {
  const cacheKey = `${mode}:${mmr}:${dbfId}`;
  if (BG_HERO_COMPOSITION_CLIENT_CACHE.has(cacheKey)) return BG_HERO_COMPOSITION_CLIENT_CACHE.get(cacheKey) || '';
  const pending = BG_HERO_COMPOSITION_REQUESTS.get(cacheKey);
  if (pending) return pending;
  const params = new URLSearchParams({ mode, mmr });
  const request = fetch(`/api/bg/heroes/${dbfId}/details?${params.toString()}`)
    .then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'Статистика состава недоступна');
      const result = bgHeroCompositionName(payload?.stats?.hero?.best_composition || payload?.stats?.best_composition);
      BG_HERO_COMPOSITION_CLIENT_CACHE.set(cacheKey, result);
      return result;
    })
    .finally(() => BG_HERO_COMPOSITION_REQUESTS.delete(cacheKey));
  BG_HERO_COMPOSITION_REQUESTS.set(cacheKey, request);
  return request;
}

function groupBgHeroesFromApi(
  payload: any,
  imageByDbfId: Record<string, string>,
  libraryByDbfId: Map<number, any> = new Map(),
): BattlegroundHeroTierSection[] {
  const heroes = Array.isArray(payload?.heroes)
    ? payload.heroes
    : (Array.isArray(payload?.view?.heroes) ? payload.view.heroes : []);
  const grouped = new Map<string, BattlegroundHeroTierEntry[]>();
  heroes.forEach((hero: any) => {
    const tier = String(hero?.tier || 'D').trim().toUpperCase();
    const dbfId = Number(hero?.dbfId ?? hero?.dbf ?? hero?.dbf_id);
    const libraryHero = Number.isFinite(dbfId) ? libraryByDbfId.get(dbfId) : null;
    const originalName = String(hero?.hero || hero?.name || libraryHero?.name?.en || '').trim();
    const localizedName = String(libraryHero?.name?.ru || '').trim();
    if (!grouped.has(tier)) grouped.set(tier, []);
    grouped.get(tier)!.push({
      name: localizedName || originalName || 'Без имени',
      originalName: originalName && originalName !== localizedName ? originalName : undefined,
      popularity: hero?.pick_rate ? String(hero.pick_rate) : undefined,
      averagePlace: hero?.avg_placement ? String(hero.avg_placement).replace('.', ',') : undefined,
      image: preferredBattlegroundHeroImage({
        cardId: libraryHero?.card_id,
        dbfId,
        apiImage: hero?.image,
        apiNestedImage: hero?.images?.hero,
        legacyImage: bgHeroImageFromMap(dbfId, imageByDbfId),
        libraryImage: libraryHero?.images?.hero,
        fallback: BG_FALLBACK_ICON,
      }),
      dbfId: Number.isFinite(dbfId) ? dbfId : undefined,
      placementDistribution: Array.isArray(hero?.placement_distribution) ? hero.placement_distribution.map(String) : undefined,
      bestComposition: bgHeroCompositionName(hero?.best_composition),
      bestCompositionId: Number.isFinite(Number(hero?.best_composition?.composition_id ?? hero?.best_composition?.id ?? hero?.best_composition_id))
        ? Number(hero?.best_composition?.composition_id ?? hero?.best_composition?.id ?? hero?.best_composition_id)
        : undefined,
      sourceId: payload?.source_id ? String(payload.source_id) : String(payload?.source?.backend || ''),
      heroPower: bgHeroRelatedCard(hero?.hero_power) || bgHeroRelatedCard(libraryHero?.hero_power),
    });
  });

  return ['S', 'A', 'B', 'C', 'D', 'E', 'F'].flatMap(tier => {
    const entries = grouped.get(tier) || [];
    entries.sort((a, b) => Number(String(a.averagePlace || '99').replace(',', '.')) - Number(String(b.averagePlace || '99').replace(',', '.')));
    return entries.length ? [{ tier, title: `${tier} Тир`, heroes: entries }] : [];
  });
}

async function bgFetchLiveHeroSlice(
  mode: BattlegroundHeroMode,
  mmr: BattlegroundHeroMmr,
): Promise<BattlegroundHeroTierData> {
  const [apiPayload, libraryByDbfId, imageByDbfId] = await Promise.all([
    fetchWithDeadline(bgHeroApiUrl(mode, mmr)).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'API героев временно недоступен');
      return payload;
    }),
    bgLoadHeroLibrary().catch(() => new Map()),
    bgLoadHeroImageMap(),
  ]);
  const sections = groupBgHeroesFromApi(apiPayload, imageByDbfId, libraryByDbfId);
  if (!sections.length) throw new Error('API героев вернул пустой список');
  const modeLabel = mode === 'duos' ? 'Дуо' : 'Соло';
  const mmrLabel = BG_HERO_MMR_OPTIONS.find(option => option.id === mmr)?.label || '';
  return { sections,
    sourceLabel: `HSReplay · ${modeLabel} · ${mmrLabel}${bgMoscowDateLabel(apiPayload.fetched_at)}`,
  };
}

async function bgLoadHeroSnapshot(): Promise<BattlegroundHeroTierData> {
  const response = await fetchWithDeadline('/bg-legacy/tier-data.js?v=heroes-20260626', { cache: 'no-store' });
  if (!response.ok) throw new Error('Не удалось загрузить резервный тир-лист героев');
  const sections = parseLegacyHeroTierData(await response.text());
  if (!sections.length) throw new Error('В резервном тир-листе героев нет данных');
  return { sections, sourceLabel: 'Резервный локальный снапшот' };
}

const bgHeroTierResource = createBattlegroundHeroTierResource({
  loadLive: bgFetchLiveHeroSlice,
  loadSnapshot: bgLoadHeroSnapshot,
});

function bgHeroLibraryForDetail(libraryHero: any, dbfId: number): any {
  const skinGroups = Array.isArray(libraryHero?.wiki?.hero_skins) ? libraryHero.wiki.hero_skins : [];
  const skins = skinGroups.flatMap((group: any) => Array.isArray(group?.cards) ? group.cards : [])
    .flatMap((skin: any) => {
      const image = String(skin?.image_url || skin?.image || '').trim();
      if (!image) return [];
      return [{
        card_id: skin?.card_id || '',
        title: skin?.title || 'Скин героя',
        image: battlegroundHeroCardImage(skin?.card_id) || image,
        url: skin?.url || '',
      }];
    });
  const buddyCard = libraryHero?.buddy?.card;
  const goldenBuddy = libraryHero?.buddy?.golden || buddyCard?.golden || null;
  const goldenBuddyImage = preferredBattlegroundGoldenBuddyImage(buddyCard, goldenBuddy);
  const heroImage = battlegroundHeroCardImage(libraryHero?.card_id) || preferredBattlegroundHeroImage({
    cardId: libraryHero?.card_id,
    dbfId,
    libraryImage: libraryHero?.images?.hero,
    fallback: BG_FALLBACK_ICON,
  });
  return {
    ...libraryHero,
    images: {
      ...libraryHero?.images,
      hero: heroImage,
      full_art: heroImage,
    },
    skins,
    buddy: libraryHero?.buddy
      ? {
          ...libraryHero.buddy,
          card: buddyCard
            ? {
                ...buddyCard,
                image_gold: goldenBuddyImage || buddyCard?.image_gold || null,
              }
            : null,
          golden: goldenBuddy
            ? {
                ...goldenBuddy,
                image: goldenBuddyImage || goldenBuddy?.image || null,
                image_gold: goldenBuddyImage || goldenBuddy?.image_gold || null,
              }
            : null,
        }
      : null,
  };
}

async function bgHeroDetailFallback(dbfId: string): Promise<BattlegroundHeroDetailPayload> {
  const libraryByDbfId = await bgLoadHeroLibrary();
  const libraryHeroRaw = libraryByDbfId.get(Number(dbfId)) || {};

  const cardId = String(libraryHeroRaw?.card_id || '');
  const mode: BattlegroundHeroMode = cardId.startsWith('BGDUO_') ? 'duos' : 'solo';
  const response = await fetchWithDeadline(bgHeroApiUrl(mode, 'TOP_50_PERCENT'));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Статистика героя временно недоступна');
  }
  const heroes = Array.isArray(payload?.heroes)
    ? payload.heroes
    : (Array.isArray(payload?.view?.heroes) ? payload.view.heroes : []);
  const sourceHero = heroes.find((hero: any) => Number(hero?.dbfId ?? hero?.dbf ?? hero?.dbf_id) === Number(dbfId));
  if (!sourceHero) throw new Error('Для героя пока нет статистики в выбранном режиме');

  const bestComposition = typeof sourceHero?.best_composition === 'object'
    ? sourceHero.best_composition
    : null;
  const hero = {
    ...sourceHero,
    best_composition: bgHeroCompositionName(sourceHero?.best_composition),
  };
  return {
    ok: true,
    stats: {
      hero,
      as_of: { heroes: payload?.fetched_at || null },
      source_url: '',
      best_composition: bestComposition,
      compositions: bestComposition ? [bestComposition] : [],
      tavern_up_by_turn: [],
      hero_power_by_turn: [],
      tavern_up: [],
      hero_power: [],
    },
    libraryHero: bgHeroLibraryForDetail(libraryHeroRaw, Number(dbfId)),
    cards: {},
    fetched_at: payload?.fetched_at || '',
  };
}
function bgFormatCount(value: any): string {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('ru-RU');
}

function bgHeroDetailPathFromPath(path: string): string {
  const match = path.match(/^\/heroes\/(\d+)\/?$/);
  return match?.[1] || '';
}


function bgHeroMetricNumber(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value || '').replace(',', '.').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function bgHeroPlainText(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function BattlegroundHeroBestComposition({
  dbfId,
  initialName,
  mode,
  mmr,
}: {
  dbfId?: number;
  initialName?: string;
  mode: BattlegroundHeroMode;
  mmr: BattlegroundHeroMmr;
}) {
  const cacheKey = dbfId ? `${mode}:${mmr}:${dbfId}` : '';
  const cachedName = cacheKey ? BG_HERO_COMPOSITION_CLIENT_CACHE.get(cacheKey) : '';
  const [composition, setComposition] = useState(initialName || cachedName || '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'empty'>(
    initialName || cachedName ? 'ready' : 'idle',
  );
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const knownName = initialName || (cacheKey ? BG_HERO_COMPOSITION_CLIENT_CACHE.get(cacheKey) : '') || '';
    setComposition(knownName);
    setStatus(knownName ? 'ready' : 'idle');
    if (knownName || !dbfId || mode !== 'solo' || mmr !== 'TOP_50_PERCENT') {
      if (!knownName) setStatus('empty');
      return;
    }

    let alive = true;
    let observer: IntersectionObserver | null = null;
    const load = () => {
      setStatus('loading');
      void bgLoadHeroComposition(dbfId, mode, mmr)
        .then(name => {
          if (!alive) return;
          setComposition(name);
          setStatus(name ? 'ready' : 'empty');
        })
        .catch(() => {
          if (alive) setStatus('empty');
        });
    };

    if (typeof IntersectionObserver === 'undefined' || !rootRef.current) {
      load();
    } else {
      observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer?.disconnect();
        load();
      }, { rootMargin: '260px 0px' });
      observer.observe(rootRef.current);
    }

    return () => {
      alive = false;
      observer?.disconnect();
    };
  }, [cacheKey, dbfId, initialName, mmr, mode]);

  return (
    <span
      ref={rootRef}
      className={`bg-hero-ledger__composition-value bg-hero-ledger__composition-value--${status}`}
      aria-live="polite"
    >
      {composition || (status === 'loading' ? 'Загружаем…' : 'Нет данных')}
    </span>
  );
}

function BattlegroundHeroDistribution({ values }: { values?: string[] }) {
  const points = useMemo(
    () => (values || []).map(value => bgHeroMetricNumber(value) || 0),
    [values],
  );
  const maximum = Math.max(...points, 1);
  const strongestIndex = Math.max(0, points.indexOf(Math.max(...points)));
  const [activeIndex, setActiveIndex] = useState(strongestIndex);

  useEffect(() => {
    setActiveIndex(strongestIndex);
  }, [strongestIndex, values]);

  if (!points.length) return <span className="bg-hero-ledger__empty">—</span>;
  const activeValue = values?.[activeIndex] || '—';
  return (
    <div className="bg-hero-distribution" aria-label={`Распределение мест: ${values?.join(', ')}`}>
      <div className="bg-hero-distribution__plot">
        {points.map((value, index) => (
          <button
            key={`${index}-${value}`}
            type="button"
            className="bg-hero-distribution__place"
            aria-label={`${index + 1} место: ${values?.[index] || '—'}`}
            aria-pressed={activeIndex === index}
            onPointerEnter={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
            onClick={() => setActiveIndex(index)}
          >
            <span style={{ height: `${Math.max(0, (value / maximum) * 100)}%`, minHeight: 0 }} />
            <small>{index + 1}</small>
          </button>
        ))}
      </div>
      <output className="bg-hero-distribution__value" aria-live="polite">
        <strong>{activeIndex + 1}</strong> место · {activeValue}
      </output>
    </div>
  );
}

function BattlegroundHeroSortButton({
  field,
  label,
  sortKey,
  sortDirection,
  onSort,
}: {
  field: BattlegroundHeroSortKey;
  label: string;
  sortKey: BattlegroundHeroSortKey;
  sortDirection: BattlegroundHeroSortDirection;
  onSort: (field: BattlegroundHeroSortKey) => void;
}) {
  const active = sortKey === field;
  const SortIcon = active ? (sortDirection === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      className="bg-hero-ledger__sort-button"
      data-active={active ? 'true' : 'false'}
      onClick={() => onSort(field)}
      title={`${label}: изменить сортировку`}
    >
      <span>{label}</span>
      <SortIcon aria-hidden="true" />
    </button>
  );
}

function BattlegroundHeroLedgerRow({
  hero,
  tier,
  mode,
  mmr,
  onNavigate,
  flat = false,
}: {
  hero: BattlegroundHeroTierEntry;
  tier: string;
  mode: BattlegroundHeroMode;
  mmr: BattlegroundHeroMmr;
  onNavigate: (path: string) => void;
  flat?: boolean;
}) {
  const href = hero.dbfId ? `/heroes/${hero.dbfId}/` : '/heroes/';
  const pickRate = bgHeroMetricNumber(hero.popularity);
  const averagePlace = bgHeroMetricNumber(hero.averagePlace);
  const heroPowerText = bgHeroPlainText(hero.heroPower?.text);
  return (
    <div className={`bg-hero-ledger__row${flat ? ' bg-hero-ledger__row--flat' : ''}`} role="row">
      {flat && (
        <div className="bg-hero-ledger__tier-cell" role="cell">
          <TierBadge tier={tier} />
        </div>
      )}
      <div className="bg-hero-ledger__hero" role="cell">
        <a
          href={href}
          onClick={(event) => {
            if (!hero.dbfId) return;
            event.preventDefault();
            onNavigate(href);
          }}
        >
          <img src={publicResourceUrl(hero.image)} alt="" loading="lazy" decoding="async" />
          <span>
            <strong>{hero.name}</strong>
            {hero.originalName && <small>{hero.originalName}</small>}
            {hero.heroPower && (
              <span className="bg-hero-ledger__power">
                <b>{hero.heroPower.name}</b>
                {heroPowerText && <small>{heroPowerText}</small>}
              </span>
            )}
          </span>
        </a>
      </div>
      <div className="bg-hero-ledger__metric bg-hero-ledger__metric--pick" role="cell">
        <small>Частота выбора</small>
        <strong>{hero.popularity || '—'}</strong>
        <span aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, pickRate || 0))}%` }} /></span>
      </div>
      <div className="bg-hero-ledger__composition" role="cell">
        <small>Лучший состав</small>
        <strong>
          <BattlegroundHeroBestComposition
            dbfId={hero.dbfId}
            initialName={hero.bestComposition}
            mode={mode}
            mmr={mmr}
          />
        </strong>
      </div>
      <div className="bg-hero-ledger__metric bg-hero-ledger__metric--placement" role="cell">
        <small>Среднее место</small>
        <strong>{hero.averagePlace || '—'}</strong>
        <span aria-hidden="true"><i style={{ width: `${averagePlace ? Math.max(8, 100 - ((averagePlace - 1) / 7) * 100) : 0}%` }} /></span>
      </div>
      <div className="bg-hero-ledger__distribution" role="cell">
        <small>Распределение мест</small>
        <BattlegroundHeroDistribution values={hero.placementDistribution} />
      </div>
    </div>
  );
}

function bgLoadHeroDetail(dbfId: string): Promise<BattlegroundHeroDetailPayload> {
  return BG_DUO_FALLBACK_DETAIL_IDS.has(dbfId) ? bgHeroDetailFallback(dbfId) : fetchWithDeadline(`/api/bg/heroes/${dbfId}/details`)
    .then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Не удалось загрузить героя');
      return data as BattlegroundHeroDetailPayload;
    })
    .catch(() => bgHeroDetailFallback(dbfId));
}

function BattlegroundHeroDetailPage({ dbfId, onNavigate, teaser }: { dbfId: string; onNavigate: (path: string) => void; teaser?: BattlegroundHeroTeaser }) {
  const { payload, loading, error, retry } = useBattlegroundHeroDetail(dbfId, BG_HERO_DETAIL_CLIENT_CACHE, bgLoadHeroDetail);

  useEffect(() => {
    const hero = payload?.stats?.hero;
    if (!hero) return;
    const libraryHero = payload?.libraryHero || {};
    const heroName = libraryHero?.name?.ru || hero.hero || 'Герой';
    const heroImage = bgHeroDetailPortrait(libraryHero, dbfId);
    const heroPower = libraryHero?.hero_power?.card;
    const heroPowerName = heroPower?.name?.ru || heroPower?.name_ru || '';
    const rawDescription = heroPower?.text?.ru || heroPower?.text_ru || libraryHero?.character?.description || '';
    const publicDescription = String(rawDescription).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const description = heroPowerName
      ? `${heroName}: сила героя «${heroPowerName}»${publicDescription ? ` — ${publicDescription}` : '.'}`
      : `${heroName} — герой Полей сражений Hearthstone в библиотеке HearthPulse.`;
    void applyDocumentPageMeta({
      title: `${heroName} — герой Полей сражений | HearthPulse`,
      description: description.slice(0, 300),
      pathname: `/heroes/${dbfId}`,
      search: '',
      image: heroImage,
    });
  }, [dbfId, payload]);

  if (loading) return <BattlegroundHeroDetailSkeleton teaser={teaser} />;
  if (error || !payload?.stats?.hero) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => onNavigate('/heroes')} className="inline-flex items-center gap-2 rounded-md border border-[#d7b66a] px-3 py-2 text-sm font-bold text-[#3d2a1e]">
          <ChevronLeft className="h-4 w-4" /> Все герои
        </button>
        {error ? <BattlegroundLoadError message={error} onRetry={retry} /> : <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700">Герой не найден</div>}
      </div>
    );
  }

  return <BattlegroundHeroDetailView dbfId={dbfId} stats={payload.stats} libraryHero={payload.libraryHero} cards={payload.cards}
    onNavigate={onNavigate} statistics={input => <BattlegroundHeroDetailAnalytics {...input} />} />;
}

/** `teaser` is the public identity the server page already rendered; it seeds the detail while statistics load. */
function BattlegroundHeroesRoute({ path, onNavigate, teaser }: { path: string; onNavigate: (path: string) => void; teaser?: BattlegroundHeroTeaser }) {
  const detailId = bgHeroDetailPathFromPath(path);
  const [listAttempt, setListAttempt] = useState(0);
  if (detailId) {
    return (
      <React.Fragment key={detailId}>
        <BattlegroundHeroDetailPage dbfId={detailId} onNavigate={onNavigate} teaser={teaser && String(teaser.dbfId) === detailId ? teaser : undefined} />
      </React.Fragment>
    );
  }
  // A retry remounts the list: its observer then requests the failed slice again.
  return <BattlegroundHeroTierList key={listAttempt} resource={bgHeroTierResource} onNavigate={onNavigate} onRetry={() => setListAttempt(value => value + 1)} />;
}


const BG_STRATEGY_BUILDER_HTML = String.raw`
<div class="builder-layout bg-strategy-builder-legacy">
  <section class="builder-sidebar builder-sidebar-wide">
    <div class="builder-controls">
      <div class="filter-block comp-import-block" data-tour-id="bg-strategy-builder-presets">
        <div class="filter-heading-row">
          <h3 class="filter-heading">Готовые сборки</h3>
        </div>
        <label class="control-field">
          <span class="control-label">Мета-сборки HSReplay и Firestone</span>
          <select id="builder-comp-select" class="select-input">
            <option value="">Загружаю сборки...</option>
          </select>
        </label>
        <p id="builder-comp-info" class="comp-import-info" hidden></p>
        <div id="builder-comp-cards" class="comp-import-cards" hidden></div>
        <button id="builder-comp-apply" class="download-button" type="button" disabled>Собрать на полотне</button>
      </div>

      <label class="control-field" data-tour-id="bg-strategy-builder-search">
        <span class="control-label">Поиск по картам (RU / EN)</span>
        <input id="builder-search" class="text-input" type="search" placeholder="Например, Морхи, murloc, deathrattle, tavern">
      </label>

      <details class="filter-block collapsible-filter" open>
        <summary class="filter-heading-row" data-tour-id="bg-strategy-builder-filters">
          <h3 class="filter-heading">Источник</h3>
          <span class="filter-toggle-marker" aria-hidden="true"></span>
        </summary>
        <div id="builder-source-filters" class="chip-row" aria-label="Фильтр по источнику"></div>
      </details>

      <details class="filter-block collapsible-filter" id="builder-race-block">
        <summary class="filter-heading-row">
          <h3 class="filter-heading">Тип существа</h3>
          <span class="filter-toggle-marker" aria-hidden="true"></span>
        </summary>
        <div id="builder-race-filters" class="chip-row" aria-label="Фильтр по типу существа"></div>
      </details>

      <details class="filter-block collapsible-filter" id="builder-level-block">
        <summary class="filter-heading-row">
          <h3 class="filter-heading">Уровень таверны</h3>
          <span class="filter-toggle-marker" aria-hidden="true"></span>
        </summary>
        <div id="builder-level-filters" class="chip-row" aria-label="Фильтр по уровню таверны"></div>
      </details>

      <details class="filter-block collapsible-filter" id="builder-accessory-block" hidden open>
        <summary class="filter-heading-row">
          <h3 class="filter-heading">Размер аксессуара</h3>
          <span class="filter-toggle-marker" aria-hidden="true"></span>
        </summary>
        <div id="builder-accessory-filters" class="chip-row" aria-label="Фильтр по размеру аксессуара"></div>
      </details>
    </div>

    <div class="library-toolbar-row" data-tour-id="bg-strategy-builder-library">
      <div id="builder-status" class="library-status">Загружаю карты...</div>
      <label class="columns-control" for="builder-library-columns" title="Сколько карт в ряду в библиотеке">
        <span class="columns-control-label">В ряду: <b id="builder-library-columns-value">3</b></span>
        <input id="builder-library-columns" class="columns-range" type="range" min="2" max="5" step="1">
      </label>
    </div>
    <div id="builder-library" class="builder-library builder-library-dense" aria-live="polite"></div>
  </section>

  <section class="builder-canvas-panel builder-canvas-panel-compact">
    <div class="builder-canvas-head" data-tour-id="bg-strategy-builder-canvas">
      <div class="builder-canvas-title">
        <p class="eyebrow">Рабочая область</p>
        <h2 class="panel-title">Полотно стратегии</h2>
      </div>
      <div id="builder-counter" class="filter-caption">0 карт на полотне</div>
    </div>

    <div class="board-with-annotations">
      <div id="strategy-board" class="strategy-board strategy-board-compact">
        <div class="strategy-board-grid" aria-hidden="true"></div>
        <div class="strategy-board-hint">
          Перетащи сюда героев, существ и заклинания из библиотеки слева
        </div>
      </div>

      <aside id="annotation-panel" class="annotation-toolbar annotation-toolbar-vertical" aria-label="Аннотации">
        <span class="annotation-toolbar-label" data-tour-id="bg-strategy-builder-annotations">Аннотации</span>
        <button class="annotation-tool" data-ann-tool="arrow" type="button" aria-pressed="false"><span class="annotation-tool-glyph">→</span><span>Стрелка</span></button>
        <button class="annotation-tool" data-ann-tool="plus" type="button" aria-pressed="false"><span class="annotation-tool-glyph">+</span><span>Плюс</span></button>
        <button class="annotation-tool" data-ann-tool="equals" type="button" aria-pressed="false"><span class="annotation-tool-glyph">=</span><span>Равно</span></button>
        <button class="annotation-tool" data-ann-tool="double-arrow" type="button" aria-pressed="false"><span class="annotation-tool-glyph">⇄</span><span>Связка</span></button>
        <button class="annotation-tool" data-ann-tool="question" type="button" aria-pressed="false"><span class="annotation-tool-glyph">?</span><span>Вопрос</span></button>
        <button class="annotation-tool" data-ann-tool="strike" type="button" aria-pressed="false"><span class="annotation-tool-glyph">⊘</span><span>Зачеркнуть</span></button>
        <button class="annotation-tool" data-ann-tool="label-prokrutka" type="button" aria-pressed="false"><span class="annotation-tool-glyph">A</span><span>Прокрутка</span></button>
        <button class="annotation-tool" data-ann-tool="label-key" type="button" aria-pressed="false"><span class="annotation-tool-glyph">A</span><span>Ключевая</span></button>
        <button class="annotation-tool" data-ann-tool="erase" type="button" aria-pressed="false"><span class="annotation-tool-glyph">×</span><span>Удалить</span></button>
        <button id="builder-clear-annotations" class="annotation-tool annotation-tool-clear" type="button">Очистить все</button>
        <span id="builder-annotation-hint" class="annotation-hint"></span>
      </aside>
    </div>

    <div class="board-toolbar" data-tour-id="bg-strategy-builder-tools">
      <button id="builder-clear" class="secondary-button" type="button">Очистить полотно</button>
      <button id="builder-export-png" class="download-button" type="button">Скачать PNG</button>
      <button id="builder-export-webp" class="secondary-button" type="button">Скачать WebP</button>
      <button id="builder-toggle-grid" class="secondary-button" type="button" aria-pressed="false">Показать сетку</button>
      <div id="builder-background-picker" class="background-picker" aria-label="Фон полотна"></div>
    </div>

    <div class="builder-view-options" aria-label="Настройки полотна">
      <label class="builder-checkbox"><input id="builder-hide-quick-slots" type="checkbox"> <span>Скрыть быстрые слоты</span></label>
      <label class="builder-checkbox"><input id="builder-hide-community-slots" type="checkbox"> <span>Скрыть слоты сообщества</span></label>
      <label class="builder-checkbox"><input id="builder-hide-annotations" type="checkbox"> <span>Скрыть аннотации</span></label>
    </div>

    <div id="community-slots-panel" class="community-slots-panel" aria-label="Слоты сообщества" data-community-empty="false">
      <div class="quick-slots-header">
        <span class="eyebrow">Слоты сообщества</span>
        <span class="quick-slots-hint">10 карт, которые чаще всего встречаются в мета-сборках</span>
      </div>
      <div id="community-slots" class="community-slots-list"></div>
    </div>

    <div id="quick-slots-panel" class="quick-slots-panel" aria-label="Быстрые слоты">
      <div class="quick-slots-header">
        <span class="eyebrow">Быстрые слоты</span>
        <span class="quick-slots-hint">Перетащи сюда до 10 часто используемых карт</span>
      </div>
      <div id="quick-slots" class="quick-slots-list"></div>
    </div>


  </section>
</div>`;

const BG_STRATEGY_BUILDER_VERSION = '20261011-pool-3661-workspace-v2';
const BG_STRATEGY_BUILDER_CSS = `/bg-legacy/strategy-builder.gridfix2.css?v=${BG_STRATEGY_BUILDER_VERSION}`;
const BG_STRATEGY_BUILDER_JS = `/bg-legacy/strategy-builder.gridfix2.js?v=${BG_STRATEGY_BUILDER_VERSION}`;

type LegacyScriptOwner = 'strategy-builder';

function loadLegacyScript(src: string, owner: LegacyScriptOwner, loadedScripts: HTMLScriptElement[], rootId: string): Promise<HTMLScriptElement> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.bgLegacyOwner = owner;
    script.dataset.bgBuilderRoot = rootId;
    loadedScripts.push(script);
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.body.appendChild(script);
  });
}

function loadLegacyScripts(
  sources: string[],
  owner: LegacyScriptOwner,
  loadedScripts: HTMLScriptElement[],
  cancelled: () => boolean,
  rootId: string,
): Promise<void> {
  return sources.reduce<Promise<void>>(
    (chain, source) => chain.then(async () => {
      if (cancelled()) return;
      await loadLegacyScript(source, owner, loadedScripts, rootId);
    }),
    Promise.resolve(),
  );
}

function BattlegroundStrategyBuilderEmbed() {
  const mountId = useRef(`bg-strategy-builder-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    battlegroundHeroRosterBridgeV1.install(window, { publicResourceUrl });
    battlegroundBuilderWorkbenchV1.install(window);
    const builderRoot = document.getElementById(mountId.current);
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = BG_STRATEGY_BUILDER_CSS;
    css.dataset.bgStrategyBuilder = 'true';
    document.head.appendChild(css);

    let cancelled = false;
    const loadedScripts: HTMLScriptElement[] = [];
    const version = BG_STRATEGY_BUILDER_VERSION;
    const scripts = [
      `/bg-legacy/shared.js?v=${version}`,
      `/bg-legacy/tier-data.js?v=${version}`,
      `/bg-legacy/accessories-data.js?v=${version}`,
      `/bg-legacy/comps-data.js?v=${version}`,
      BG_STRATEGY_BUILDER_JS,
    ];

    void loadLegacyScripts(scripts, 'strategy-builder', loadedScripts, () => cancelled, mountId.current)
      .catch(error => {
      if (cancelled) return;
      console.error('Не удалось запустить конструктор стратегий.', error);
    });

    return () => {
      cancelled = true;
      battlegroundBuilderWorkbenchV1.dispose(builderRoot);
      css.remove();
      loadedScripts.forEach(script => script.remove());
    };
  }, []);

  return (
    <div className="bg-builder-page">
      <BattlegroundsStrategyBuilderSearchIntro />
      <div
        id={mountId.current}
        className="strategy-builder-page overflow-visible rounded-lg bg-[#07101f]/95"
        dangerouslySetInnerHTML={{ __html: BG_STRATEGY_BUILDER_HTML }}
      />
      </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────



export { BattlegroundHeroesRoute, BattlegroundTierList, BattlegroundStrategyBuilderEmbed };
