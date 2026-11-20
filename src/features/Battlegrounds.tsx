import '../shared/ui/analytics/Analytics.css';
import { HeroCompositionAnalytics, HeroOverview, HeroPowerAnalytics, HeroTavernAnalytics } from '../modules/battlegrounds/public';
import '../modules/battlegrounds/public.css';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePageScrollLock } from '../hooks/usePageScrollLock';
import { useOverlayFade } from '../hooks/useOverlayFade';
import {
  BattlegroundsStrategyBuilderSearchIntro,
} from '../modules/searchLanding/public';
import {
  battlegroundHeroCardImage,
  createBattlegroundHeroTierResource,
  useBattlegroundHeroTierData,
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
import { battlegroundFullCardImage, preferredBattlegroundGoldenBuddyImage } from '../modules/battlegrounds/public';
import { BattlegroundHeroCard as MemoBattlegroundHeroCard } from './BattlegroundHeroCard';
import { BattlegroundHeroStatistics } from './BattlegroundHeroStatistics';
import { CardPatchTimeline } from './CardPatchTimeline';
import { battlegroundHeroPatchEntries } from './battlegroundHeroPatchChanges';
import { BattlegroundHeroDetailSkeleton, BattlegroundHeroListSkeleton, BattlegroundLoadError, type BattlegroundHeroTeaser } from './BattlegroundsSkeletons';
import { BattlegroundTierList } from './BattlegroundTierList';
import { bgDetailCardTooltipText } from './battlegroundTierListItems';
import { useBattlegroundHeroDetail } from './useBattlegroundHeroDetail';
import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';
import '../route-parchment.css';
import './Battlegrounds.css';
import '../battlegrounds-shell.css';
import '../battlegrounds-parchment.css';
import { useViewEntrance } from '../components/transitions/useViewEntrance';
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  List,
  Maximize2,
  Pause,
  Play,
  Search,
  Volume2,
  X,
} from 'lucide-react';

const BG_FALLBACK_ICON = '/arena-logo-icon.webp?v=mana-swirl-20260624';

function uniqueSources(sources: Array<string | null | undefined>): string[] {
  return [...new Set(sources.filter(Boolean) as string[])];
}

function formatDate(iso: string | null): string {
  if (!iso) return 'нет данных';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type BattlegroundHeroView = 'grid' | 'table';

const BG_HERO_MODES: Array<{ id: BattlegroundHeroMode; label: string; hint: string }> = [
  { id: 'solo', label: 'Соло', hint: 'Обычные матчи' },
  { id: 'duos', label: 'Дуо', hint: 'Командные матчи' },
];
const BG_HERO_MMR_OPTIONS: Array<{ id: BattlegroundHeroMmr; label: string }> = [
  { id: 'TOP_50_PERCENT', label: 'Топ 50%' },
  { id: 'TOP_20_PERCENT', label: 'Топ 20%' },
  { id: 'TOP_5_PERCENT', label: 'Топ 5%' },
  { id: 'TOP_1_PERCENT', label: 'Топ 1%' },
];
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
const BattlegroundHeroLedger = React.lazy(() => import('./BattlegroundHeroLedger'));

function bgHeroModeFromValue(value: unknown): BattlegroundHeroMode {
  return String(value || '').toLowerCase() === 'duos' ? 'duos' : 'solo';
}

function bgHeroMmrFromValue(value: unknown): BattlegroundHeroMmr {
  const normalized = String(value || '').toUpperCase();
  return BG_HERO_MMR_OPTIONS.some(option => option.id === normalized)
    ? normalized as BattlegroundHeroMmr
    : 'TOP_50_PERCENT';
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

function bgHeroListUrlState(): {
  mode: BattlegroundHeroMode;
  mmr: BattlegroundHeroMmr;
  view: BattlegroundHeroView;
  search: string;
  sortKey: BattlegroundHeroSortKey;
  sortDirection: BattlegroundHeroSortDirection;
} {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
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

function bgHeroSearchText(hero: BattlegroundHeroTierEntry, tier: string): string {
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

function bgNormalizeHeroSearch(value: any): string {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9%.,\s-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  return ['S', 'A', 'B', 'C', 'D'].flatMap(tier => {
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
    sourceLabel: `HSReplay · ${modeLabel} · ${mmrLabel} · обновлено ${formatDate(apiPayload.fetched_at)}`,
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
function bgFormatDecimal(value: any, digits = 2): string {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits).replace('.', ',');
}

function bgFormatCount(value: any): string {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('ru-RU');
}

// Keys are lower case without spaces or hyphens: the wiki writes "Night elf", "Blood elf", "Titan-forged".
const BG_HERO_RACE_NAMES: Record<string, string> = {
  aberration: 'Аберрация', abomination: 'Поганище', ancient: 'Древний', arakkoa: 'Араккоа', beast: 'Зверь',
  bloodelf: 'Эльф крови', broken: 'Сломленный', cat: 'Кошка', djinn: 'Джинн', draenei: 'Дреней', dragon: 'Дракон',
  dwarf: 'Дворф', elemental: 'Элементаль', eredar: 'Эредар', eternalone: 'Вечный', ethereal: 'Эфириал',
  forsaken: 'Отрекшийся', gnoll: 'Гнолл', gnome: 'Гном', goblin: 'Гоблин', golem: 'Голем', halforc: 'Полуорк',
  highelf: 'Высший эльф', human: 'Человек', infernal: 'Инфернал', kobold: 'Кобольд', lich: 'Лич', mechagnome: 'Механогном',
  mechanical: 'Механизм', murloc: 'Мурлок', naga: 'Нага', nightborne: 'Ночнорождённый',
  nightelf: 'Ночной эльф', nraqi: 'Н\'раки', observer: 'Наблюдатель', ogre: 'Огр', oldgod: 'Древний бог', ooze: 'Слизень',
  orc: 'Орк', pandaren: 'Пандарен', plant: 'Растение', primate: 'Примат', protodragon: 'Протодракон', protoss: 'Протосс',
  quilboar: 'Свинобраз', rat: 'Крыса', satyr: 'Сатир', tauren: 'Таурен', titanforged: 'Созданный титанами',
  tortollan: 'Тортолланец', troll: 'Тролль', undead: 'Нежить', undeaddragon: 'Дракон-нежить', vulpera: 'Вульпера',
  wildgod: 'Дикий бог', worgen: 'Ворген', zerg: 'Зерг',
};

function bgHeroRaceLabel(value: any): string {
  const race = String(value || '').trim();
  if (!race) return '—';
  return BG_HERO_RACE_NAMES[race.toLowerCase().replace(/[\s'’-]+/g, '')] || race;
}

const BG_HERO_PATCH_KIND_LABELS = { added: 'Добавлен', removed: 'Убран' };
const BG_HERO_STAT_MODES: Record<string, string> = { solo: 'Соло', duos: 'Дуо' };
const BG_HERO_STAT_TIME_RANGES: Record<string, string> = {
  CURRENT_BATTLEGROUNDS_PATCH: 'текущий патч', CURRENT_PATCH: 'текущий патч', LAST_7_DAYS: 'последние 7 дней',
  LAST_14_DAYS: 'последние 14 дней', LAST_30_DAYS: 'последние 30 дней',
};

/** One line under the statistics heading: which games the numbers come from. */
function bgHeroStatisticsScope(stats: any): string {
  const mode = BG_HERO_STAT_MODES[String(stats?.mode || '')];
  const percentile = String(stats?.filters?.mmr_percentile || '').match(/^TOP_(\d+)_PERCENT$/);
  const range = BG_HERO_STAT_TIME_RANGES[String(stats?.filters?.time_range || '')];
  const scope = [mode, percentile ? `топ-${percentile[1]}% по рейтингу` : '', range].filter(Boolean).join(' · ');
  return scope ? `${scope}. Данные HSReplay.` : 'Данные HSReplay.';
}

function bgHeroArmorValue(armor: any, key: 'normal' | 'duos'): string {
  const value = armor && typeof armor === 'object' ? armor[key] : null;
  return Number.isFinite(Number(value)) ? String(value) : '—';
}

function bgHeroDescriptionRu(heroName: string, description: any): string {
  const text = String(description || '').trim();
  const key = `${heroName} ${text}`;
  if (/Millificent|Миллифисент/i.test(key)) {
    return 'Миллифисент Манашторм — гениальная инженерка и признанная изобретательница. После побега из Аметистовой крепости она снова охотится за своим главным противником — собственным мужем.';
  }
  return text;
}

function bgHeroWikiSlug(heroName: string): string {
  return String(heroName || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

function bgHeroExternalLinks(libraryHero: any, heroName: string): Array<{ label: string; url: string }> {
  const dbf = libraryHero?.dbf;
  const links = new Map<string, string>();
  const wikiUrl = libraryHero?.wiki?.page?.url;
  if (wikiUrl) links.set('Hearthstone Wiki', String(wikiUrl));
  const sourceLinks = Array.isArray(libraryHero?.wiki?.external_links) ? libraryHero.wiki.external_links : [];
  sourceLinks.forEach((link: any) => {
    const label = String(link?.label || '').trim();
    const url = String(link?.url || '').trim();
    if (label && url) links.set(label, url);
  });
  if (Number.isFinite(Number(dbf)) && !links.has('HSReplay.net')) links.set('HSReplay.net', `https://hsreplay.net/cards/${dbf}`);
  if (!links.has('Hearthstone Wiki')) links.set('Hearthstone Wiki', `https://hearthstone.wiki.gg/wiki/Battlegrounds/${bgHeroWikiSlug(heroName)}`);
  return Array.from(links, ([label, url]) => ({ label, url }));
}

function bgHeroSoundLabel(value: any): string {
  const text = String(value || '').trim();
  const key = text.toLowerCase();
  if (key === 'play' || key.includes('summon')) return 'Призыв';
  if (key === 'attack' || key.includes('attack')) return 'Атака';
  if (key === 'death' || key.includes('death')) return 'Смерть';
  if (key === 'trigger') return 'Срабатывание';
  if (key === 'emote') return 'Реплика';
  return text || 'Голос';
}

function bgHeroSoundDescription(value: any, fallback: any): string {
  const text = String(value || '').trim();
  if (/^<summon sound>$/i.test(text)) return 'Звук призыва';
  if (/^<attack sound>$/i.test(text)) return 'Звук атаки';
  if (/^<death sound>$/i.test(text)) return 'Звук смерти';
  if (/^<.*sound>$/i.test(text)) return bgHeroSoundLabel(fallback);
  return text || bgHeroSoundLabel(fallback);
}

function bgHeroBuddySoundGroups(...sources: any[]): BattlegroundHeroSoundGroup[] {
  const seen = new Set<string>();
  const groups = new Map<string, BattlegroundHeroSoundClip[]>();
  sources.forEach(source => {
    const entries = Array.isArray(source?.sounds) ? source.sounds : [];
    entries.forEach((group: BattlegroundHeroSoundGroup) => {
      const heading = group.heading || group.clips?.[0]?.group || 'Voice';
      const label = bgHeroSoundLabel(heading);
      (group.clips || []).forEach(clip => {
        const url = String(clip.file_url || '').trim();
        if (!url || seen.has(url)) return;
        seen.add(url);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push({
          ...clip,
          description: bgHeroSoundDescription(clip.description, heading),
          group: label,
        });
      });
    });
  });
  return Array.from(groups, ([heading, clips]) => ({ heading, clips }));
}


function bgHeroDetailPathFromPath(path: string): string {
  const match = path.match(/^\/heroes\/(\d+)\/?$/);
  return match?.[1] || '';
}


function bgHeroMetricNumber(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value || '').replace(',', '.').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function bgHeroCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun = mod10 === 1 && mod100 !== 11
    ? 'герой'
    : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'героя' : 'героев');
  return `${count} ${noun}`;
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

type BattlegroundHeroMediaItem = {
  key: string;
  title: string;
  image: string;
  kicker?: string;
  meta?: string;
  text?: string;
  link?: string;
};

type BattlegroundHeroSoundClip = {
  description?: string | null;
  file_title?: string | null;
  file_url?: string | null;
  group?: string | null;
};

type BattlegroundHeroSoundGroup = {
  heading?: string | null;
  clips?: BattlegroundHeroSoundClip[];
};

function bgDetailCardImage(card: any): string {
  return card?.image || card?.image_gold || card?.crop_image || '';
}

function bgDetailCardText(card: any, tone: 'normal' | 'gold' = 'normal'): string {
  if (!card) return '';
  const value = tone === 'gold'
    ? card?.text_gold || card?.textGold || card?.golden?.text || card?.text
    : card?.text;
  return bgDetailCardTooltipText(value);
}

function bgDetailImageSources(...sources: Array<string | null | undefined>): string[] {
  return uniqueSources(sources.reduce<string[]>((acc, source) => {
    const value = String(source || '').trim();
    if (value) acc.push(value);
    return acc;
  }, []));
}

function bgDetailCardSources(card: any, tone: 'normal' | 'gold' = 'normal'): string[] {
  if (!card) return [];
  const primaryImage = tone === 'gold' ? card?.image_gold || card?.image : card?.image;
  return bgDetailImageSources(
    battlegroundFullCardImage(card?.card_id, primaryImage),
    tone === 'gold' ? card?.image_gold : null,
    card?.image,
    card?.image_gold,
  );
}

function bgDetailArtSources(card: any): string[] {
  if (!card) return [];
  return bgDetailImageSources(
    card?.crop_image,
    card?.cropImage,
    card?.art,
  );
}

const BG_HERO_POWER_FULL_ART_OVERRIDES: Record<string, string> = {
  '117426': 'https://hearthstone.wiki.gg/images/Final_Frontier_full.jpg?39a766',
  'Тайное знание': 'https://hearthstone.wiki.gg/images/Final_Frontier_full.jpg?39a766',
};

function bgHeroPowerFullArtSources(card: any): string[] {
  if (!card) return [];
  return bgDetailImageSources(
    BG_HERO_POWER_FULL_ART_OVERRIDES[String(card?.dbf || '')],
    BG_HERO_POWER_FULL_ART_OVERRIDES[String(card?.card_id || '')],
    BG_HERO_POWER_FULL_ART_OVERRIDES[String(card?.name || '')],
    card?.full_art,
    card?.fullArt,
    card?.full_image,
    card?.fullImage,
  );
}

function bgHeroSkinLargeImage(image: any): string {
  const raw = String(image || '');
  if (!raw) return '';
  return raw.replace(/\/\d+px-/, '/720px-');
}

function BattlegroundHeroImage({
  sources,
  alt,
  className = '',
  imgClassName = '',
  fallback,
}: {
  sources: string[];
  alt: string;
  className?: string;
  imgClassName?: string;
  fallback?: React.ReactNode;
}) {
  const sourceKey = sources.join('|');
  const [imageState, setImageState] = useState(() => ({ sourceKey, srcIdx: 0 }));

  if (imageState.sourceKey !== sourceKey) {
    setImageState({ sourceKey, srcIdx: 0 });
  }

  const src = sources[imageState.srcIdx] || '';

  if (!src) return fallback ? <div className={className}>{fallback}</div> : null;

  return (
    <div className={className}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setImageState(current => ({ ...current, srcIdx: current.srcIdx + 1 }))}
        className={imgClassName}
      />
    </div>
  );
}

function BattlegroundHeroMediaLightbox({
  items,
  index,
  onClose,
  onIndexChange,
}: {
  items: BattlegroundHeroMediaItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
}) {
  const { ref: fadeRef, shown: visible, close } = useOverlayFade<HTMLDivElement>(onClose, 600);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const item = items[index] || null;
  usePageScrollLock(Boolean(item));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft' && items.length > 1) onIndexChange((index - 1 + items.length) % items.length);
      if (event.key === 'ArrowRight' && items.length > 1) onIndexChange((index + 1) % items.length);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [index, items.length, close, onIndexChange]);

  if (!item) return null;

  return createPortal(
    <div
      ref={fadeRef}
      className="bg-hero-media-lightbox"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
      onClick={close}
      onTouchStart={event => {
        const touch = event.touches[0];
        touchOrigin.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={event => {
        if (!touchOrigin.current) return;
        const touch = event.changedTouches[0];
        const moved = Math.hypot(touch.clientX - touchOrigin.current.x, touch.clientY - touchOrigin.current.y);
        touchOrigin.current = null;
        if (moved < 12) {
          event.preventDefault();
          close();
        }
      }}
    >
      <div
        className="bg-hero-media-lightbox-backdrop"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(8,16,32,0.84)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />

      <div
        className="bg-hero-media-lightbox-panel grid gap-5 rounded-[28px] border border-[#d7b66a]/55 bg-[linear-gradient(180deg,#fffdf8,#f4ead4)] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.42)] lg:grid-cols-[minmax(260px,360px)_minmax(280px,420px)] lg:p-5"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(96vw, 900px)',
          maxHeight: '90dvh',
          overflowY: 'auto',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.86) translateY(20px)',
          transition: 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={event => event.stopPropagation()}
        onTouchStart={event => event.stopPropagation()}
        onTouchEnd={event => event.stopPropagation()}
      >
        <div className="bg-hero-media-lightbox-art flex items-center justify-center rounded-[24px] border border-[#e2cf99] bg-[radial-gradient(circle_at_top,#fff8de,transparent_58%),linear-gradient(180deg,#fff9ef,#f0e0bf)] p-3">
          <BattlegroundHeroImage
            sources={bgDetailImageSources(item.image)}
            alt={item.title}
            className="w-full max-w-[320px]"
            imgClassName="w-full h-auto object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.28)]"
            fallback={
              <div className="flex h-[360px] items-center justify-center rounded-2xl bg-[#f3ead3] px-4 text-center font-hs text-[#6b4c2a]">
                {item.title}
              </div>
            }
          />
        </div>

        <div className="bg-hero-media-lightbox-copy flex min-w-0 flex-col justify-center">
          {item.kicker && <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8b6c42]">{item.kicker}</p>}
          <h3 className="mt-2 font-hs text-2xl leading-tight text-[#3d2a1e] sm:text-3xl">{item.title}</h3>
          {item.meta && <p className="mt-3 text-sm font-semibold text-[#6b4c2a]">{item.meta}</p>}
          {item.text && <p className="mt-4 text-sm leading-relaxed text-[#4a3018]">{item.text}</p>}
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center justify-center rounded-xl border border-[#d7b66a] bg-[#fff5d2] px-4 py-2 text-sm font-bold text-[#3d2a1e] transition-colors hover:bg-[#fff0bf]"
            >
              Открыть источник
            </a>
          )}
          {items.length > 1 && (
            <div className="mt-6 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onIndexChange((index - 1 + items.length) % items.length)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7b66a] bg-[#fff8ea] text-[#3d2a1e] transition-colors hover:bg-[#fff1c8]"
                aria-label="Предыдущий объект"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex gap-1.5">
                {items.map((entry, entryIndex) => (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => onIndexChange(entryIndex)}
                    className="h-2.5 rounded-full transition-[width,background-color]"
                    style={{
                      width: entryIndex === index ? 28 : 10,
                      background: entryIndex === index ? '#8b4513' : '#d7b66a',
                    }}
                    aria-label={`Перейти к объекту ${entryIndex + 1}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => onIndexChange((index + 1) % items.length)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d7b66a] bg-[#fff8ea] text-[#3d2a1e] transition-colors hover:bg-[#fff1c8]"
                aria-label="Следующий объект"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={event => {
          event.stopPropagation();
          close();
        }}
        className="hs-lightbox-close absolute right-4 top-4 z-[2] flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/20 text-white transition-colors hover:bg-black/35"
        aria-label="Закрыть"
      >
        <X className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  );
}

function BattlegroundHeroMediaCard({
  title,
  card,
  tone = 'normal',
  onOpen,
}: {
  title: string;
  card: any;
  tone?: 'normal' | 'gold';
  onOpen: () => void;
}) {
  const sources = bgDetailCardSources(card, tone);
  const text = bgDetailCardText(card, tone);
  if (!card || sources.length === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`bg-hero-action-card group rounded-2xl border p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f] ${
        tone === 'gold'
          ? 'bg-hero-action-card--gold border-[#d6a74c] bg-[linear-gradient(135deg,#fff2cf,#eed19c)]'
          : 'border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffdf8,#f8eed9)]'
      }`}
    >
      <div className="bg-hero-action-card__body grid items-start gap-3">
        <BattlegroundHeroImage
          sources={sources}
          alt={card.name || title}
          className="bg-hero-action-card__media"
          imgClassName="bg-hero-action-card__image"
        />
        <div className="min-w-0">
          <p className="bg-hero-action-card__kicker font-hs text-xs uppercase tracking-[0.16em]">{title}</p>
          <h3 className="bg-hero-action-card__title mt-1 font-hs text-lg leading-tight text-[#3d2a1e]">{card.name || title}</h3>
          {text && (
            <p className="bg-hero-action-card__text mt-1.5 text-sm leading-relaxed">
              {text}
            </p>
          )}
        </div>
      </div>
      <Maximize2 aria-hidden="true" className="bg-hero-action-card__zoom" />
    </button>
  );
}

/** Who the hero is, when the library knows it. Armor and links live in the header. */
function BattlegroundHeroProfileInfo({ heroName, libraryHero }: { heroName: string; libraryHero: any }) {
  const description = bgHeroDescriptionRu(heroName, libraryHero?.character?.description);
  const race = bgHeroRaceLabel(libraryHero?.race);
  const artist = String(libraryHero?.artist || '').trim();
  // A missing fact is left out instead of shown as «—»: an empty tile reads as a broken page.
  const facts = [
    { label: 'Раса', value: race },
    { label: 'Художник', value: artist },
  ].filter(fact => fact.value && fact.value !== '—');
  if (!description && facts.length === 0) return null;
  return (
    <section className="bg-hero-ledger-panel bg-hero-profile rounded-2xl border border-[#d7b66a]/65 p-4">
      <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Профиль героя</p>
      <h2 className="font-hs text-2xl text-[#3d2a1e]">Кто это</h2>
      {description && <p className="bg-hero-profile__text mt-2 text-sm leading-7 text-[#5f4730]">{description}</p>}
      {facts.length > 0 && (
        <dl className="bg-hero-profile__facts mt-3">
          {facts.map(fact => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** Armor, the patch state and the reference links: one line of facts under the hero name. */
function BattlegroundHeroFacts({ libraryHero, latestPatch, links }: {
  libraryHero: any;
  latestPatch: string | null;
  links: Array<{ label: string; url: string }>;
}) {
  const solo = bgHeroArmorValue(libraryHero?.armor, 'normal');
  const duos = bgHeroArmorValue(libraryHero?.armor, 'duos');
  const armor = [solo !== '—' ? `${solo}` : '', duos !== '—' ? `дуо ${duos}` : ''].filter(Boolean).join(' · ');
  return (
    <ul className="bg-hero-facts" aria-label="Факты о герое">
      {armor && <li className="bg-hero-facts__item"><span>Броня</span> {armor}</li>}
      <li className="bg-hero-facts__item">
        {latestPatch
          ? <a href="#hero-patches">Последнее изменение: {latestPatch.replace(/^Патч/, 'патч')}</a>
          : 'Изменений баланса не было'}
      </li>
      {links.map(link => (
        <li key={link.url} className="bg-hero-facts__item bg-hero-facts__item--link">
          <a href={link.url} target="_blank" rel="noreferrer">
            {link.label} <ExternalLink aria-hidden="true" className="inline h-3.5 w-3.5" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function BattlegroundHeroFullArt({
  heroName,
  fullArt,
  heroImage,
  onOpen,
}: {
  heroName: string;
  fullArt: string;
  heroImage: string;
  onOpen: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#d7b66a]/65 bg-[#fff8ea] shadow-[0_12px_24px_rgba(61,42,30,0.08)]">
      <button
        type="button"
        onClick={onOpen}
        className="group block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f]"
      >
        <div className="relative h-[220px] bg-[#eadfbe] sm:h-[260px] lg:h-[320px]">
          <BattlegroundHeroImage
            sources={bgDetailImageSources(fullArt, heroImage)}
            alt={`Иллюстрация героя ${heroName}`}
            className="absolute inset-0"
            imgClassName="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.015]"
          />
          <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(61,42,30,0.82))] p-4 pt-16">
            <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#f6ce68]">Иллюстрация героя</p>
            <h3 className="mt-1 font-hs text-xl text-white sm:text-2xl">{heroName}</h3>
          </div>
        </div>
      </button>
    </section>
  );
}

function BattlegroundHeroSoundBoard({ soundGroups }: { soundGroups: BattlegroundHeroSoundGroup[] }) {
  const clips = useMemo(() => soundGroups.reduce<Array<BattlegroundHeroSoundClip & { heading: string; url: string }>>((acc, group) => {
    (group.clips || []).forEach(clip => {
      const url = String(clip.file_url || '').trim();
      if (!url) return;
      acc.push({
        ...clip,
        heading: group.heading || clip.group || 'Голос',
        url,
      });
    });
    return acc;
  }, []), [soundGroups]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeUrl, setActiveUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const toggleClip = useCallback((clip: BattlegroundHeroSoundClip & { heading: string; url: string }) => {
    if (!clip.url) return;
    const currentAudio = audioRef.current;
    if (currentAudio && activeUrl === clip.url && isPlaying) {
      currentAudio.pause();
      setIsPlaying(false);
      return;
    }

    const audio = currentAudio || new Audio();
    audioRef.current = audio;
    if (audio.src !== clip.url) {
      audio.src = clip.url;
      audio.currentTime = 0;
    }
    audio.onended = () => setIsPlaying(false);
    audio.onpause = () => setIsPlaying(false);
    audio.onplay = () => setIsPlaying(true);
    setActiveUrl(clip.url);
    void audio.play().catch(() => setIsPlaying(false));
  }, [activeUrl, isPlaying]);

  if (!clips.length) return null;

  return (
    <div className="mt-5 rounded-2xl border border-[#e2cf99] bg-[#fff8ea]/78 p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Голоса компаньона</p>
          <h4 className="font-hs text-lg text-[#3d2a1e]">Реплики и звуки</h4>
        </div>
        <p className="text-xs font-bold text-[#6b4c2a]">{clips.length} клипов</p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {clips.map(clip => {
          const active = activeUrl === clip.url;
          const playing = active && isPlaying;
          return (
            <div
              key={clip.url}
              className={`rounded-2xl border p-3 transition-colors ${
                active
                  ? 'border-[#b58a2f] bg-[linear-gradient(180deg,#fff4c8,#fffdf7)] shadow-[0_10px_22px_rgba(61,42,30,0.08)]'
                  : 'border-[#d7b66a]/70 bg-[#fffdf7]'
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleClip(clip)}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-[#3d2a1e] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f] ${
                    playing
                      ? 'border-[#8b4513] bg-[#f6ce68]'
                      : 'border-[#d7b66a] bg-[#fff8ea] hover:bg-[#fff1c8]'
                  }`}
                  aria-label={`${playing ? 'Пауза' : 'Воспроизвести'}: ${clip.heading}`}
                >
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 shrink-0 text-[#8b6c42]" />
                    <p className="font-hs text-sm text-[#3d2a1e]">{clip.heading}</p>
                  </div>
                  <p className="mt-1 text-xs font-bold leading-snug text-[#6b4c2a]">{clip.description || clip.file_title || 'Звук'}</p>
                  {clip.file_title && (
                    <p className="mt-1 truncate text-[11px] font-semibold text-[#8b6c42]">{clip.file_title}</p>
                  )}
                </div>
              </div>
              <a
                href={clip.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#bfdbfe] bg-[#dbeafe] px-3 py-1.5 text-xs font-black text-[#1e3a8a] transition-colors hover:bg-[#c7dfff]"
              >
                Открыть WAV
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BattlegroundHeroGallery({
  heroName,
  items,
  soundGroups,
  onOpen,
  tourId,
}: {
  heroName: string;
  items: BattlegroundHeroMediaItem[];
  soundGroups: BattlegroundHeroSoundGroup[];
  onOpen: (index: number) => void;
  tourId?: string;
}) {
  if (!items.length && !soundGroups.length) return null;
  return (
    <section className="bg-hero-ledger-panel rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
      <div
        className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"
        data-tour-id={tourId}
      >
        <div>
          <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Галерея</p>
          <h3 className="font-hs text-xl text-[#3d2a1e]">{heroName}</h3>
        </div>
        <p className="text-xs font-bold text-[#6b4c2a]">{items.length} арта</p>
      </div>

      {items.length > 0 && (
        <div className="bg-hero-gallery mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onOpen(index)}
              className="group rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3 text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_24px_rgba(61,42,30,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f]"
            >
              <div className="aspect-[4/3] overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,#fff5d2,transparent_60%),linear-gradient(180deg,#fffdf8,#f2e1bc)]">
                <BattlegroundHeroImage
                  sources={bgDetailImageSources(item.image)}
                  alt={item.title}
                  className="h-full w-full"
                  imgClassName="h-full w-full object-cover drop-shadow-[0_10px_14px_rgba(61,42,30,0.16)] transition-transform duration-200 group-hover:scale-[1.025]"
                />
              </div>
              <p className="mt-2 font-hs text-xs uppercase tracking-[0.14em] text-[#8b6c42]">{item.kicker || 'Арт'}</p>
              <h4 className="mt-1 text-sm font-bold leading-tight text-[#3d2a1e]">{item.title}</h4>
            </button>
          ))}
        </div>
      )}

      <BattlegroundHeroSoundBoard soundGroups={soundGroups} />
    </section>
  );
}

function bgHeroDetailPortrait(
  libraryHero: { card_id?: unknown; images?: { hero?: unknown } } | null | undefined,
  dbfId: string,
): string {
  return preferredBattlegroundHeroImage({
    cardId: libraryHero?.card_id,
    dbfId,
    libraryImage: libraryHero?.images?.hero === BG_FALLBACK_ICON ? '' : libraryHero?.images?.hero,
    fallback: BG_FALLBACK_ICON,
  });
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
  const [lightboxItems, setLightboxItems] = useState<BattlegroundHeroMediaItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const openMediaGallery = useCallback((items: BattlegroundHeroMediaItem[], index: number) => {
    if (!items.length) return;
    setLightboxItems(items);
    setLightboxIndex(index);
  }, []);
  const closeLightbox = useCallback(() => setLightboxIndex(-1), []);

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

  const stats = payload.stats;
  const hero = stats.hero || {};
  const libraryHero = payload.libraryHero || {};
  const cards = payload.cards || {};
  const heroName = libraryHero?.name?.ru || hero.hero || 'Герой';
  const heroImage = bgHeroDetailPortrait(libraryHero, dbfId);
  const fullArt = libraryHero?.images?.full_art === BG_FALLBACK_ICON ? heroImage : libraryHero?.images?.full_art || heroImage;
  const heroPower = libraryHero?.hero_power?.card;
  const buddy = libraryHero?.buddy?.card;
  const goldenBuddy = libraryHero?.buddy?.golden;
  const goldenBuddyCard = goldenBuddy
    ? {
        ...goldenBuddy,
        image_gold: goldenBuddy.image_gold || buddy?.image_gold || null,
      }
    : null;
  const skins = Array.isArray(libraryHero?.skins) ? libraryHero.skins : [];
  const externalLinks = bgHeroExternalLinks(libraryHero, heroName);
  const patchEntries = battlegroundHeroPatchEntries(libraryHero?.wiki?.card_changes);
  const heroMediaItems = [
    heroPower && {
      key: `hero-power-${dbfId}`,
      title: heroPower.name || 'Сила героя',
      image: bgDetailCardSources(heroPower)[0] || '',
      kicker: 'Сила героя',
      meta: hero.tier ? `Тир ${hero.tier} · выбор ${hero.pick_rate || '—'}` : undefined,
      text: bgDetailCardText(heroPower),
    },
    buddy && {
      key: `hero-buddy-${dbfId}`,
      title: buddy.name || 'Компаньон',
      image: bgDetailCardSources(buddy)[0] || '',
      kicker: 'Компаньон',
      meta: hero.best_composition ? `Лучший состав: ${hero.best_composition}` : undefined,
      text: bgDetailCardText(buddy),
    },
    goldenBuddyCard && {
      key: `hero-golden-buddy-${dbfId}`,
      title: goldenBuddyCard.name || 'Золотой компаньон',
      image: bgDetailCardSources(goldenBuddyCard, 'gold')[0] || '',
      kicker: 'Золотой компаньон',
      meta: hero.best_composition ? `Лучший состав: ${hero.best_composition}` : undefined,
      text: bgDetailCardText(goldenBuddyCard, 'gold'),
    },
  ].flatMap(item => item ? [item] : []);
  const galleryMediaItems: BattlegroundHeroMediaItem[] = [
    {
      key: `gallery-hero-art-${dbfId}`,
      title: heroName,
      image: fullArt,
      kicker: 'Арт героя',
      meta: libraryHero?.artist ? `Художник: ${libraryHero.artist}` : undefined,
      text: bgHeroDescriptionRu(heroName, libraryHero?.description),
    },
    heroPower && {
      key: `gallery-hero-power-art-${dbfId}`,
      title: heroPower.name || 'Сила героя',
      image: bgHeroPowerFullArtSources(heroPower)[0] || bgDetailCardSources(heroPower)[0] || '',
      kicker: 'Арт силы героя',
      text: bgDetailCardText(heroPower),
    },
    buddy && {
      key: `gallery-buddy-art-${dbfId}`,
      title: buddy.name || 'Компаньон',
      image: bgDetailArtSources(buddy)[0] || bgDetailCardSources(buddy)[0] || '',
      kicker: 'Арт компаньона',
      text: bgDetailCardText(buddy),
    },
  ].flatMap(item => item && item.image ? [item] : []);
  const buddySoundGroups = bgHeroBuddySoundGroups(buddy, goldenBuddyCard);
  const skinMediaItems = skins.flatMap((skin: any) => {
    const image = bgHeroSkinLargeImage(skin.image);
    return image ? [{
      key: `skin-${skin.card_id || skin.title}`,
      title: skin.title || 'Скин героя',
      image,
      kicker: 'Скин героя',
      meta: heroName,
      link: skin.url || '',
    }] : [];
  });
  // Card texts carry the English original and the mechanics list; the hover titles show only the Russian text.
  const analyticsCards = Object.fromEntries(Object.entries(cards).map(([dbf, card]: [string, any]) => [dbf, { ...card, text: bgDetailCardTooltipText(card?.text) }]));

  return (
    <div className="bg-hero-detail-page space-y-6 text-[#3d2a1e]">
      <button type="button" onClick={() => onNavigate('/heroes')} className="inline-flex items-center gap-2 rounded-md border border-[#d7b66a]/70 bg-[#fff7e6]/80 px-3 py-2 text-sm font-bold text-[#3d2a1e] transition-colors hover:bg-[#fff3c4]">
        <ChevronLeft className="h-4 w-4" /> Все герои
      </button>
      <section className="bg-hero-reliquary relative overflow-hidden rounded-[28px] border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_18px_42px_rgba(61,42,30,0.1)] sm:p-5">
        <div
          className="bg-hero-reliquary__art absolute inset-y-0 right-0 hidden w-[58%] opacity-[0.1] lg:block"
          style={{
            backgroundImage: `url(${fullArt})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center right',
            maskImage: 'linear-gradient(90deg, transparent, rgba(0,0,0,1) 30%)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent, rgba(0,0,0,1) 30%)',
          }}
        />
        <div className="bg-hero-reliquary__layout relative grid gap-5 lg:grid-cols-[220px_1fr]">
          <div className="flex justify-center lg:block">
            <div className="bg-hero-reliquary__portrait rounded-[26px] border border-[#d7b66a]/75 bg-[radial-gradient(circle_at_top,#fff7dc,transparent_55%),linear-gradient(180deg,#fffaf0,#eedcba)] p-3 shadow-[0_18px_34px_rgba(61,42,30,0.12)]">
              <BattlegroundHeroImage
                sources={bgDetailImageSources(heroImage)}
                alt={heroName}
                className="w-full max-w-[210px]"
                imgClassName="w-full object-contain drop-shadow-[0_20px_22px_rgba(61,42,30,0.22)]"
              />
            </div>
          </div>
          <div className="bg-hero-reliquary__identity min-w-0">
            <p className="bg-hero-reliquary__kicker font-hs text-xs uppercase tracking-[0.18em]">Поля сражений · герой</p>
            <h1 className="bg-hero-reliquary__title mt-2 font-hs text-4xl leading-tight text-[#3d2a1e] sm:text-5xl">{heroName}</h1>
            <BattlegroundHeroFacts libraryHero={libraryHero} latestPatch={patchEntries.find(entry => entry.changes.some(change => !change.minor))?.version ?? null} links={externalLinks} />
            <div
              className="bg-hero-stat-grid mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4"
              data-tour-id="bg-hero-detail-summary"
            >
              <div className="bg-hero-stat-plaque rounded-2xl border border-[#d7b66a]/65 bg-[#fff8ea]/92 p-3">
                <p className="text-[11px] uppercase">Тир</p>
                <p className="font-hs text-2xl">{hero.tier ? <TierBadge tier={hero.tier} small /> : '—'}</p>
              </div>
              <div className="bg-hero-stat-plaque rounded-2xl border border-[#d7b66a]/65 bg-[#fff8ea]/92 p-3">
                <p className="text-[11px] uppercase">Среднее место</p>
                <p className="font-hs text-2xl">{bgFormatDecimal(hero.avg_placement, 2)}</p>
              </div>
              <div className="bg-hero-stat-plaque rounded-2xl border border-[#bfdbfe] bg-[#dbeafe]/88 p-3">
                <p className="text-[11px] uppercase">Выбор героя</p>
                <p className="font-hs text-2xl">{hero.pick_rate || '—'}</p>
              </div>
              <div className="bg-hero-stat-plaque rounded-2xl border border-[#d7b66a]/65 bg-[#fff8ea]/92 p-3">
                <p className="text-[11px] uppercase">Лучший состав</p>
                <p className="font-hs text-xl">{hero.best_composition || '—'}</p>
              </div>
            </div>
            {heroMediaItems.length > 0 && (
              <div
                className="bg-hero-media-grid mt-4"
                data-tour-id="bg-hero-detail-media"
              >
                {heroPower && <BattlegroundHeroMediaCard title="Сила героя" card={heroPower} onOpen={() => openMediaGallery(heroMediaItems, 0)} />}
                {buddy && <BattlegroundHeroMediaCard title="Компаньон" card={buddy} onOpen={() => openMediaGallery(heroMediaItems, heroPower ? 1 : 0)} />}
                {goldenBuddyCard && (
                  <BattlegroundHeroMediaCard
                    title="Золотой компаньон"
                    card={goldenBuddyCard}
                    tone="gold"
                    onOpen={() => openMediaGallery(heroMediaItems, heroPower && buddy ? 2 : heroPower || buddy ? 1 : 0)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <BattlegroundHeroProfileInfo heroName={heroName} libraryHero={libraryHero} />

      <BattlegroundHeroStatistics
        description={bgHeroStatisticsScope(stats)}
        overview={hero.placement_distribution?.length || stats.combat_winrate?.length
          ? <HeroOverview placement={hero.placement_distribution} combat={stats.combat_winrate} /> : null}
        power={stats.hero_power_by_turn?.length || stats.hero_power?.length
          ? <HeroPowerAnalytics byTurn={stats.hero_power_by_turn} byTier={stats.hero_power} /> : null}
        tavern={stats.tavern_up_by_turn?.length || stats.tavern_up?.length
          ? <HeroTavernAnalytics byTurn={stats.tavern_up_by_turn} distribution={stats.tavern_up} /> : null}
        compositions={stats.compositions?.length || stats.best_composition?.lineup?.length || stats.best_composition?.final_form_minions?.length
          ? <HeroCompositionAnalytics best={stats.best_composition} compositions={stats.compositions} cards={analyticsCards} /> : null}
      />

      {patchEntries.length > 0 && (
        <section id="hero-patches" className="bg-hero-ledger-panel bg-hero-section" aria-labelledby="hero-patches-title">
          <header className="bg-hero-section__heading" data-tour-id="bg-hero-detail-patches">
            <p className="bg-hero-section__eyebrow">История баланса</p>
            <h2 id="hero-patches-title">Изменения по патчам</h2>
          </header>
          <CardPatchTimeline entries={patchEntries} kindLabels={BG_HERO_PATCH_KIND_LABELS} limit={5} />
        </section>
      )}

      {skins.length > 0 && (
        <section className="bg-hero-ledger-panel bg-hero-section" aria-labelledby="hero-skins-title">
          <header className="bg-hero-section__heading">
            <p className="bg-hero-section__eyebrow">Коллекция</p>
            <h2 id="hero-skins-title">Скины героя</h2>
          </header>
          <div className="bg-hero-skins grid grid-cols-2 gap-3 lg:grid-cols-4">
            {skins.map((skin: any, index: number) => (
              <button
                key={skin.card_id || skin.image}
                type="button"
                onClick={() => openMediaGallery(skinMediaItems, index)}
                className="group rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_rgba(61,42,30,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f]"
              >
                <BattlegroundHeroImage
                  sources={bgDetailImageSources(skin.image, bgHeroSkinLargeImage(skin.image))}
                  alt={skin.title || 'Скин героя'}
                  className="mx-auto w-full"
                  imgClassName="mx-auto h-40 w-full object-contain drop-shadow-[0_12px_16px_rgba(61,42,30,0.16)] transition-transform duration-200 group-hover:scale-[1.02]"
                />
                <p className="mt-2 min-h-[2.4rem] text-sm font-bold leading-tight text-[#3d2a1e]">{skin.title || skin.card_id || 'Скин героя'}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <BattlegroundHeroGallery
        heroName={heroName}
        items={galleryMediaItems}
        soundGroups={buddySoundGroups}
        onOpen={index => openMediaGallery(galleryMediaItems, index)}
        tourId="bg-hero-detail-gallery"
      />

      {lightboxIndex >= 0 && (
        <BattlegroundHeroMediaLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onClose={closeLightbox}
          onIndexChange={setLightboxIndex}
        />
      )}
    </div>
  );
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
  return <BattlegroundHeroTierList key={listAttempt} onNavigate={onNavigate} onRetry={() => setListAttempt(value => value + 1)} />;
}

function BattlegroundHeroTierList({ onNavigate, onRetry }: { onNavigate: (path: string) => void; onRetry: () => void }) {
  const initialUrlState = useMemo(bgHeroListUrlState, []);
  const [mode, setMode] = useState<BattlegroundHeroMode>(initialUrlState.mode);
  const [mmr, setMmr] = useState<BattlegroundHeroMmr>(initialUrlState.mmr);
  const [view, setView] = useState<BattlegroundHeroView>(initialUrlState.view);
  const viewRef = useViewEntrance<HTMLDivElement>(view);
  const [searchTerm, setSearchTerm] = useState(initialUrlState.search);
  const [sortKey, setSortKey] = useState<BattlegroundHeroSortKey>(initialUrlState.sortKey);
  const [sortDirection, setSortDirection] = useState<BattlegroundHeroSortDirection>(initialUrlState.sortDirection);
  const { sections, loading, error } = useBattlegroundHeroTierData(bgHeroTierResource, mode, mmr);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (mode !== 'solo') params.set('mode', mode);
    if (mmr !== 'TOP_50_PERCENT') params.set('mmr', mmr);
    if (view !== 'grid') params.set('view', view);
    if (sortKey !== 'tier') params.set('sort', sortKey);
    const defaultSortDirection = sortKey === 'pickRate' ? 'desc' : 'asc';
    if (sortDirection !== defaultSortDirection) params.set('dir', sortDirection);
    const normalizedQuery = searchTerm.trim();
    if (normalizedQuery) params.set('q', normalizedQuery);
    const nextUrl = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [mmr, mode, searchTerm, sortDirection, sortKey, view]);

  const handleHeroSort = useCallback((field: BattlegroundHeroSortKey) => {
    if (field === sortKey) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(field);
    setSortDirection(field === 'pickRate' ? 'desc' : 'asc');
  }, [sortKey]);

  const normalizedSearch = bgNormalizeHeroSearch(deferredSearchTerm);
  const filteredSections = useMemo(() => {
    if (!normalizedSearch) return sections;
    return sections.flatMap(section => {
      const heroes = section.heroes.filter(hero => bgNormalizeHeroSearch(bgHeroSearchText(hero, section.tier)).includes(normalizedSearch));
      return heroes.length ? [{ ...section, heroes }] : [];
    });
  }, [normalizedSearch, sections]);
  const totalHeroes = useMemo(() => sections.reduce((sum, section) => sum + section.heroes.length, 0), [sections]);
  const visibleHeroes = useMemo(() => filteredSections.reduce((sum, section) => sum + section.heroes.length, 0), [filteredSections]);

  return (
    <div className="bg-heroes-page space-y-5">
      <section className="bg-heroes-tools">
        <div className="bg-heroes-controls">
          <fieldset className="bg-heroes-control-group">
            <legend>Тип игры</legend>
            <div className="bg-heroes-segmented">
              {BG_HERO_MODES.map(option => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={mode === option.id}
                  title={option.hint}
                  onPointerEnter={() => { void bgHeroTierResource.load(option.id, mmr).catch(() => undefined); }}
                  onFocus={() => { void bgHeroTierResource.load(option.id, mmr).catch(() => undefined); }}
                  onClick={() => setMode(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="bg-heroes-control-group bg-heroes-control-group--mmr">
            <legend>Рейтинг игроков</legend>
            <div className="bg-heroes-segmented">
              {BG_HERO_MMR_OPTIONS.map(option => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={mmr === option.id}
                  onPointerEnter={() => { void bgHeroTierResource.load(mode, option.id).catch(() => undefined); }}
                  onFocus={() => { void bgHeroTierResource.load(mode, option.id).catch(() => undefined); }}
                  onClick={() => setMmr(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="bg-heroes-control-group bg-heroes-control-group--view">
            <legend>Вид списка</legend>
            <div className="bg-heroes-segmented bg-heroes-view-toggle">
              <button
                type="button"
                aria-pressed={view === 'grid'}
                aria-label="Показать карточками"
                title="Карточки"
                onClick={() => setView('grid')}
              >
                <LayoutGrid aria-hidden="true" />
                <span>Карточки</span>
              </button>
              <button
                type="button"
                aria-pressed={view === 'table'}
                aria-label="Показать таблицей"
                title="Таблица"
                onClick={() => setView('table')}
              >
                <List aria-hidden="true" />
                <span>Таблица</span>
              </button>
            </div>
          </fieldset>
        </div>

        <div className="bg-heroes-tools__legend">
          <div className="bg-heroes-tools__explanation">
            <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">
              {mode === 'duos' ? 'Командный рейтинг' : 'Одиночный рейтинг'}
            </p>
            <p className="mt-1 text-sm font-semibold text-[#6b4c2a]">
              {view === 'table'
                ? 'Таблица объединяет силу героя, состав и распределение мест в одной строке.'
                : 'На карточках указаны среднее место и частота выбора героя.'}
            </p>
          </div>
          <div
            className="bg-heroes-tools__metrics"
            aria-label="Обозначения показателей"
            data-tour-id="bg-heroes-metrics"
          >
            <span className="bg-heroes-metric bg-heroes-metric--placement"><strong>4,06</strong>Среднее место</span>
            <span className="bg-heroes-metric bg-heroes-metric--pickrate"><strong>23.05%</strong>Выбор героя</span>
          </div>
        </div>

        <label className="bg-heroes-search" data-tour-id="bg-heroes-search">
          <span className="sr-only">Поиск по героям</span>
          <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Герой, сила героя или состав — на русском и английском"
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          />
          {searchTerm && <button type="button" onClick={() => setSearchTerm('')} className="bg-heroes-search__reset">Сбросить</button>}
          <span className="bg-heroes-search__count">
            {normalizedSearch ? `${visibleHeroes} / ${bgHeroCountLabel(totalHeroes)}` : bgHeroCountLabel(totalHeroes)}
          </span>
        </label>
      </section>

      {loading && sections.length === 0 && <BattlegroundHeroListSkeleton />}
      {loading && sections.length > 0 && (
        <div className="bg-heroes-refresh-status" role="status" aria-live="polite">
          Обновляем рейтинг…
        </div>
      )}
      {error && !loading && <BattlegroundLoadError message={error} onRetry={onRetry} />}
      {sections.length > 0 && !error && (
        <div className={view === 'grid' ? 'space-y-5' : ''} aria-busy={loading} ref={viewRef}>
          {filteredSections.length === 0 && (
            <div className="rounded-2xl border border-[#d7b66a]/65 bg-[#fff9ed] p-6 text-center font-hs text-[#6b4c2a]">
              Герои не найдены
            </div>
          )}
          {view === 'table' && filteredSections.length > 0
            ? (
                <React.Suspense fallback={<div className="py-10 text-center font-hs text-[#6b4c2a]" role="status">Подготавливаем таблицу…</div>}>
                  <BattlegroundHeroLedger
                    sections={filteredSections}
                    mode={mode}
                    mmr={mmr}
                    sortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleHeroSort}
                    onNavigate={onNavigate}
                  />
                </React.Suspense>
              )
            : filteredSections.map((section, sectionIndex) => {
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
                        <MemoBattlegroundHeroCard
                          key={`${section.tier}-${hero.dbfId || hero.name}`}
                          hero={hero}
                          tier={section.tier}
                          onNavigate={onNavigate}
                          tourId={sectionIndex === 0 && heroIndex === 0 ? 'bg-heroes-results' : undefined}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
        </div>
      )}
    </div>
  );
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
