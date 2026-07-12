import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePageScrollLock } from '../hooks/usePageScrollLock';
import './Battlegrounds.css';
import '../battlegrounds-parchment.css';
import { ChevronLeft, ChevronRight, ExternalLink, Pause, Play, Search, Volume2, X } from 'lucide-react';

const BG_FALLBACK_ICON = '/arena-logo-icon.webp?v=mana-swirl-20260624';

function uniqueSources(sources: Array<string | null | undefined>): string[] {
  return [...new Set(sources.filter(Boolean) as string[])];
}

function formatDate(iso: string | null): string {
  if (!iso) return 'нет данных';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type BattlegroundTierListKey = 'minions' | 'strategies' | 'spells' | 'trinkets';
type BattlegroundStrategySource = 'hsreplay' | 'firestone';
type BattlegroundTierCache = Record<string, any>;

type BattlegroundLightboxItem = {
  key: string;
  title: string;
  image: string;
  kicker: string;
  meta: string;
  text?: string;
  detailHref?: string;
};

const BG_TIER_LISTS: Array<{ id: BattlegroundTierListKey; label: string; shortLabel: string; description: string }> = [
  { id: 'minions', label: 'Тир-лист существ', shortLabel: 'Существа', description: 'Рейтинг существ по влиянию на бой и статистике HSReplay.' },
  { id: 'strategies', label: 'Тир-лист стратегий', shortLabel: 'Стратегии', description: 'Готовые архетипы и ключевые карты композиций из Firestone.' },
  { id: 'spells', label: 'Тир-лист заклинаний', shortLabel: 'Заклинания', description: 'Заклинания таверны по среднему месту и силе в партиях.' },
  { id: 'trinkets', label: 'Тир-лист аксессуаров', shortLabel: 'Аксессуары', description: 'Большие и малые аксессуары, разложенные по актуальным тирам.' },
];

function bgNormalizeDeepLinkValue(value: unknown): string {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function bgTierListKeyFromValue(value: unknown): BattlegroundTierListKey {
  const raw = String(value || '').toLowerCase();
  return BG_TIER_LISTS.some(item => item.id === raw) ? raw as BattlegroundTierListKey : 'minions';
}

function bgVisibleLimitKey(list: BattlegroundTierListKey, tier: string): string {
  return `${list}:${tier}`;
}

function bgMinionDetailHref(item: any): string {
  const dbfId = Number(item?.dbfId || item?.dbf || item?.dbf_id);
  if (!Number.isFinite(dbfId)) return '';
  const slug = bgNormalizeDeepLinkValue(bgItemTitle(item));
  return `/library/minions/${slug || 'minion'}-${dbfId}`;
}

function bgStrategySourceFromValue(value: unknown): BattlegroundStrategySource {
  return String(value || '').toLowerCase() === 'hsreplay' ? 'hsreplay' : 'firestone';
}

function bgTierListUrlState(): {
  list: BattlegroundTierListKey;
  source: BattlegroundStrategySource;
  strategyKey: string;
  strategyTitle: string;
} {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  return {
    list: bgTierListKeyFromValue(params.get('list')),
    source: bgStrategySourceFromValue(params.get('source')),
    strategyKey: params.get('strategy') || '',
    strategyTitle: params.get('q') || '',
  };
}

function bgStrategyMatchesDeepLink(item: any, key: string, title: string): boolean {
  if (!key && !title) return false;
  const itemKey = String(item?.key || '');
  if (key && itemKey === key) return true;
  if (key && bgNormalizeDeepLinkValue(itemKey) === bgNormalizeDeepLinkValue(key)) return true;
  return Boolean(title && bgNormalizeDeepLinkValue(bgItemTitle(item)) === bgNormalizeDeepLinkValue(title));
}

const BG_TIER_ORDER = ['S', 'A', 'B', 'C', 'D'];
const BG_TIER_INITIAL_VISIBLE: Record<BattlegroundTierListKey, number> = {
  minions: 18,
  strategies: 6,
  spells: 12,
  trinkets: 12,
};
const BG_TIER_VISIBLE_STEP: Record<BattlegroundTierListKey, number> = {
  minions: 24,
  strategies: 12,
  spells: 18,
  trinkets: 24,
};
const BG_TIER_BADGES: Record<string, string> = {
  S: 'bg-gradient-to-br from-[#f8e7ad] to-[#b58a2f] text-[#3d2a1e] border-[#fff3c4]',
  A: 'bg-gradient-to-br from-[#d9c287] to-[#8a6830] text-[#2b2116] border-[#f3dfaa]',
  B: 'bg-gradient-to-br from-[#b8d4f4] to-[#4f78a8] text-[#15263a] border-[#dcecff]',
  C: 'bg-gradient-to-br from-[#9ed5b4] to-[#4e8d67] text-[#173322] border-[#caefd7]',
  D: 'bg-gradient-to-br from-[#d9ad91] to-[#965a3c] text-[#2e1c14] border-[#f4cfb8]',
};

interface BattlegroundHeroTierEntry {
  name: string;
  popularity?: string;
  averagePlace?: string;
  image: string;
  dbfId?: number;
  placementDistribution?: string[];
  sourceId?: string;
  heroPower?: BattlegroundHeroRelatedCard | null;
}

interface BattlegroundHeroRelatedCard {
  dbf?: number | null;
  name: string;
  text?: string;
  image?: string | null;
  imageGold?: string | null;
  cropImage?: string | null;
}

interface BattlegroundHeroDetailPayload {
  ok?: boolean;
  stats?: any;
  libraryHero?: any;
  cards?: Record<string, any>;
  fetched_at?: string;
}

interface BattlegroundHeroTierSection {
  tier: string;
  title?: string;
  heroes: BattlegroundHeroTierEntry[];
}

const BG_HEROES_CLIENT_CACHE = new Map<string, { sections: BattlegroundHeroTierSection[]; sourceLabel: string }>();
const BG_HERO_DETAIL_CLIENT_CACHE = new Map<string, BattlegroundHeroDetailPayload>();

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
  if (!raw) return BG_FALLBACK_ICON;
  if (raw.startsWith('/')) return raw;
  return `/bg-legacy/${raw.replace(/^\.\//, '')}`;
}

function bgHeroTierTitle(tier: string): string {
  return `${tier} Тир`;
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
    tier,
    hero.averagePlace,
    hero.popularity,
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

function groupBgHeroesFromApi(payload: any, imageByDbfId: Record<string, string>): BattlegroundHeroTierSection[] {
  const heroes = Array.isArray(payload?.view?.heroes) ? payload.view.heroes : [];
  const grouped = new Map<string, BattlegroundHeroTierEntry[]>();
  heroes.forEach((hero: any) => {
    const tier = String(hero?.tier || 'D').trim().toUpperCase();
    if (!grouped.has(tier)) grouped.set(tier, []);
    grouped.get(tier)!.push({
      name: String(hero?.hero || hero?.name || 'Без имени'),
      popularity: hero?.pick_rate ? String(hero.pick_rate) : undefined,
      averagePlace: hero?.avg_placement ? String(hero.avg_placement).replace('.', ',') : undefined,
      image: hero?.image || hero?.images?.hero || bgHeroImageFromMap(hero?.dbfId, imageByDbfId),
      dbfId: Number.isFinite(Number(hero?.dbfId)) ? Number(hero.dbfId) : undefined,
      placementDistribution: Array.isArray(hero?.placement_distribution) ? hero.placement_distribution.map(String) : undefined,
      sourceId: payload?.source_id ? String(payload.source_id) : undefined,
      heroPower: bgHeroRelatedCard(hero?.hero_power),
    });
  });

  return ['S', 'A', 'B', 'C', 'D'].flatMap(tier => {
    const entries = grouped.get(tier) || [];
    entries.sort((a, b) => Number(String(a.averagePlace || '99').replace(',', '.')) - Number(String(b.averagePlace || '99').replace(',', '.')));
    return entries.length ? [{ tier, title: bgHeroTierTitle(tier), heroes: entries }] : [];
  });
}
const BG_RACE_NAMES: Record<string, string> = {
  ALL: 'Все типы',
  NONE: 'Без типа',
  BEAST: 'Звери',
  DEMON: 'Демоны',
  DRAGON: 'Драконы',
  ELEMENTAL: 'Элементали',
  MECHANICAL: 'Механизмы',
  MURLOC: 'Мурлоки',
  NAGA: 'Наги',
  PIRATE: 'Пираты',
  QUILBOAR: 'Свинобразы',
  UNDEAD: 'Нежить',
};

const BG_RACE_ICON: Record<string, string> = {
  ALL: 'https://bg.kolodahearthstone.ru/assset/%D0%BE%D0%B1%D1%89%D0%B5%D0%B5.webp',
  NONE: 'https://bg.kolodahearthstone.ru/assset/%D0%BE%D0%B1%D1%89%D0%B5%D0%B5.webp',
  BEAST: 'https://bg.kolodahearthstone.ru/assset/%D0%B7%D0%B2%D0%B5%D1%80%D1%8C.webp',
  DEMON: 'https://bg.kolodahearthstone.ru/assset/%D0%B4%D0%B5%D0%BC%D0%BE%D0%BD%D1%8B.webp',
  DRAGON: 'https://bg.kolodahearthstone.ru/assset/%D0%B4%D1%80%D0%B0%D0%BA%D0%BE%D0%BD%D1%8B.webp',
  ELEMENTAL: 'https://bg.kolodahearthstone.ru/assset/%D1%8D%D0%BB%D0%B5%D0%BC%D0%B5%D0%BD%D1%82%D0%B0%D0%BB%D0%B8.webp',
  MECHANICAL: 'https://bg.kolodahearthstone.ru/assset/%D0%BC%D0%B5%D1%85%D0%B0%D0%BD%D0%B8%D0%B7%D0%BC%D1%8B.webp',
  MURLOC: 'https://bg.kolodahearthstone.ru/assset/%D0%BC%D1%83%D1%80%D0%BB%D0%BE%D0%BA%D0%B8.webp',
  NAGA: 'https://bg.kolodahearthstone.ru/assset/%D0%BD%D0%B0%D0%B3%D0%B8.webp',
  PIRATE: 'https://bg.kolodahearthstone.ru/assset/%D0%BF%D0%B8%D1%80%D0%B0%D1%82%D1%8B.webp',
  QUILBOAR: 'https://bg.kolodahearthstone.ru/assset/%D1%81%D0%B2%D0%B8%D0%BD%D0%BE%D0%B1%D1%80%D0%B0%D0%B7%D1%8B.webp',
  UNDEAD: 'https://bg.kolodahearthstone.ru/assset/%D0%BD%D0%B5%D0%B6%D0%B8%D1%82%D1%8C.webp',
};

const BG_RACE_ORDER = ['ALL', 'NONE', 'BEAST', 'DEMON', 'DRAGON', 'ELEMENTAL', 'MECHANICAL', 'MURLOC', 'NAGA', 'PIRATE', 'QUILBOAR', 'UNDEAD'];
const BG_TAVERN_ICON_BASE = 'https://bg.kolodahearthstone.ru/assset';

function bgItemTitle(item: any): string {
  return String(item?.ruName || item?.localizedName || item?.title || item?.name || item?.hero || item?.key || 'Без названия');
}

function bgTavernIcon(tavern: string): string {
  return `${BG_TAVERN_ICON_BASE}/tier${encodeURIComponent(tavern)}.png`;
}

const BG_FILTER_ACTIVE_CLASS = 'bg-filter-chip bg-filter-chip--active';
const BG_FILTER_IDLE_CLASS = 'bg-filter-chip';

function bgItemRaces(item: any): string[] {
  if (Array.isArray(item?.races) && item.races.length) {
    return item.races.map((race: any) => String(race || 'NONE'));
  }
  const race = String(item?.race || '').trim().toUpperCase();
  if (race) return [race];
  const raceRu = String(item?.raceRu || '').trim();
  if (raceRu) {
    const found = Object.entries(BG_RACE_NAMES).find(([, label]) => label.toLowerCase() === raceRu.toLowerCase());
    return [found?.[0] || raceRu];
  }
  return ['NONE'];
}

function bgRaceLabelForItem(item: any): string {
  const raceRu = String(item?.raceRu || '').trim();
  if (raceRu) return raceRu;
  const race = bgItemRaces(item).find(entry => entry && entry !== 'ALL' && entry !== 'NONE') || '';
  return BG_RACE_NAMES[race] || race;
}

function bgFormatDecimal(value: any, digits = 2): string {
  if (value === null || value === undefined || value === '' || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits).replace('.', ',');
}

function bgFormatCount(value: any): string {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('ru-RU');
}

const BG_HERO_RACE_NAMES: Record<string, string> = {
  BloodElf: 'Эльф крови',
  Draenei: 'Дреней',
  Dwarf: 'Дворф',
  Gnome: 'Гном',
  Goblin: 'Гоблин',
  HalfOrc: 'Полуорк',
  HighElf: 'Высший эльф',
  Human: 'Человек',
  Murloc: 'Мурлок',
  Naga: 'Нага',
  NightElf: 'Ночной эльф',
  Orc: 'Орк',
  Pandaren: 'Пандарен',
  Tauren: 'Таурен',
  Troll: 'Тролль',
  Undead: 'Нежить',
  Worgen: 'Ворген',
};

function bgHeroRaceLabel(value: any): string {
  const race = String(value || '').trim();
  if (!race) return '—';
  return BG_HERO_RACE_NAMES[race] || BG_HERO_RACE_NAMES[race.replace(/\s+/g, '')] || race;
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
  if (!text) return 'Описание героя пока не найдено в библиотеке.';
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

function bgHeroPatchEntries(libraryHero: any): BattlegroundHeroPatchEntry[] {
  const groups = Array.isArray(libraryHero?.wiki?.card_changes) ? libraryHero.wiki.card_changes : [];
  return groups
    .flatMap((group: any) => Array.isArray(group?.entries) ? group.entries : [])
    .filter((entry: any) => entry && (entry.patch || entry.date || Array.isArray(entry.items)))
    .slice(0, 4);
}

function bgHeroPatchTextRu(text: string): string {
  const value = String(text || '').trim();
  let match = value.match(/^Now has (\d+) armor in Duos \(previously: ([^)]+)\)\.?$/i);
  if (match) return `Броня в дуо: ${match[1]} (было: ${match[2]}).`;
  match = value.match(/^Now has (\d+) armor at lower levels \(previously: ([^)]+)\)\.?$/i);
  if (match) return `Броня на низком рейтинге: ${match[1]} (было: ${match[2]}).`;
  match = value.match(/^Now has (\d+) armor \(previously: ([^)]+)\)\.?$/i);
  if (match) return `Броня: ${match[1]} (было: ${match[2]}).`;
  match = value.match(/^Now has (\d+) Health \(previously: ([^)]+)\)\.?$/i);
  if (match) return `Здоровье: ${match[1]} (было: ${match[2]}).`;
  if (/^Added\.?$/i.test(value)) return 'Герой добавлен.';
  if (/^Removed\.?$/i.test(value)) return 'Герой удален из доступного пула.';
  return value;
}

function bgDetailCardTooltipText(value: any): string {
  return String(value || '')
    .replace(/\s+EN:\s*[\s\S]*$/i, '')
    .replace(/\s+Механики:\s*[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
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

function bgFormatPatchDate(value: any): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('ru-RU');
  return text;
}

function bgStatChips(item: any, list: BattlegroundTierListKey): Array<{ label: string; value: string }> {
  if (list === 'minions') {
    return [
      item?.tavernTier ? { label: 'Таверна', value: String(item.tavernTier) } : null,
      item?.impact !== undefined ? { label: 'Impact', value: bgFormatDecimal(item.impact) } : null,
      item?.combatWinrate ? { label: 'Винрейт боёв', value: String(item.combatWinrate) } : null,
      item?.popularity ? { label: 'Популярность', value: String(item.popularity) } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
  }
  if (list === 'spells') {
    return [
      item?.tavernTier ? { label: 'Таверна', value: String(item.tavernTier) } : null,
      item?.avgPlacement ? { label: 'Среднее место', value: bgFormatDecimal(item.avgPlacement) } : null,
      item?.impact !== undefined ? { label: 'Impact', value: bgFormatDecimal(item.impact) } : null,
      item?.totalPlayed || item?.games ? { label: 'Сыграно', value: bgFormatCount(item.totalPlayed || item.games) } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
  }
  if (list === 'trinkets') {
    return [
      item?.typeLabel ? { label: 'Тип', value: String(item.typeLabel).replace(' аксессуар', '') } : null,
      item?.avgPlacement ? { label: 'Среднее место', value: bgFormatDecimal(item.avgPlacement) } : null,
      item?.pickRate ? { label: 'Пикрейт', value: String(item.pickRate) } : null,
      item?.firstPlace ? { label: 'Топ-1', value: String(item.firstPlace) } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
  }
  return [
    item?.archetype ? { label: 'Архетип', value: String(item.archetype) } : null,
    item?.avgPlacement ? { label: 'Среднее место', value: bgFormatDecimal(item.avgPlacement) } : null,
    item?.games ? { label: 'Игр', value: bgFormatCount(item.games) } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
}

function bgMetricLine(item: any, list: BattlegroundTierListKey): string {
  if (list === 'strategies') {
    const parts = [
      item?.archetype ? String(item.archetype) : '',
      item?.avgPlacement ? `ср. место ${item.avgPlacement}` : '',
      item?.games ? `${Number(item.games).toLocaleString('ru-RU')} игр` : '',
    ].filter(Boolean);
    return parts.join(' · ');
  }
  if (list === 'minions') {
    return [
      item?.tavernTier ? `Таверна ${item.tavernTier}` : '',
      item?.impact !== undefined ? `влияние ${item.impact}` : '',
      item?.combatWinrate ? `бой ${item.combatWinrate}` : '',
    ].filter(Boolean).join(' · ');
  }
  if (list === 'spells') {
    return [
      item?.tavernTier ? `Таверна ${item.tavernTier}` : '',
      item?.avgPlacement ? `ср. место ${Number(item.avgPlacement).toFixed(2).replace('.', ',')}` : '',
      item?.games ? `${Number(item.games).toLocaleString('ru-RU')} игр` : '',
      item?.impact !== undefined ? `impact ${Number(item.impact).toFixed(2).replace('.', ',')}` : '',
    ].filter(Boolean).join(' · ');
  }
  return [
    item?.type ? String(item.type) : '',
    item?.typeLabel ? String(item.typeLabel) : '',
    item?.avgPlacement ? `ср. место ${Number(item.avgPlacement).toFixed(2).replace('.', ',')}` : '',
    item?.games ? `${Number(item.games).toLocaleString('ru-RU')} игр` : '',
  ].filter(Boolean).join(' · ');
}

function bgImageForItem(item: any, list: BattlegroundTierListKey): string {
  if (list === 'strategies') return '';
  return String(item?.image256 || item?.image || item?.imageFallback || '');
}

function bgLightboxItem(item: any, list: BattlegroundTierListKey, tier: string, index = 0): BattlegroundLightboxItem | null {
  const image = bgImageForItem(item, list);
  if (!image) return null;
  const title = bgItemTitle(item);
  const metric = bgMetricLine(item, list);
  const key = `${list}-${tier}-${item?.id || item?.dbfId || item?.key || title}-${index}`;
  const rawText = String(item?.ruText || item?.text || item?.description || '').trim();
  const text = /[А-Яа-яЁё]/.test(rawText)
    ? rawText
    : (list === 'trinkets' ? 'Описание доступно на изображении аксессуара.' : '');
  return {
    key,
    title,
    image,
    kicker: `${tier}-тир · ${list === 'trinkets' ? 'Аксессуар' : list === 'spells' ? 'Заклинание' : 'Существо'}`,
    meta: metric,
    text,
    detailHref: list === 'minions' ? bgMinionDetailHref(item) : undefined,
  };
}

function BattlegroundHeroHoverCard({ card, label, className = '' }: { card: BattlegroundHeroRelatedCard; label: string; className?: string }) {
  const image = card.image || card.imageGold || card.cropImage || '';
  if (!image) return null;
  return (
    <div className={`battleground-hero-related-card pointer-events-none absolute top-0 z-20 w-[136px] translate-y-2 opacity-0 drop-shadow-[0_18px_22px_rgba(36,24,10,0.35)] transition duration-200 sm:w-[156px] xl:w-[174px] ${className}`}>
      <img
        src={image}
        alt={`${label}: ${card.name}`}
        loading="lazy"
        decoding="async"
        className="w-full object-contain"
      />
      <span className="sr-only">{label}: {card.name}</span>
    </div>
  );
}

function bgHeroDetailPathFromPath(path: string): string {
  const match = path.match(/^\/heroes\/(\d+)\/?$/);
  return match?.[1] || '';
}

function BattlegroundHeroCard({ hero, tier, onNavigate }: { hero: BattlegroundHeroTierEntry; tier: string; onNavigate: (path: string) => void }) {
  const hasHoverCards = Boolean(hero.heroPower);
  const href = hero.dbfId ? `/heroes/${hero.dbfId}` : '/heroes';
  return (
    <a
      href={href}
      onClick={(event) => {
        if (!hero.dbfId) return;
        event.preventDefault();
        onNavigate(href);
      }}
      data-has-related={hasHoverCards ? 'true' : 'false'}
      className="battleground-hero-card relative flex min-h-[252px] flex-col items-center overflow-hidden rounded-lg p-3 text-center transition-all duration-200 hover:z-30 focus:z-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d7b66a]"
    >
      <div className="relative flex w-full justify-center overflow-visible">
        <img
          src={hero.image}
          alt={hero.name}
          loading="lazy"
          decoding="async"
          className="battleground-hero-main aspect-[3/4] w-full max-w-[184px] object-contain drop-shadow-[0_7px_14px_rgba(0,0,0,0.38)] transition duration-200"
        />
        {hero.heroPower && (
          <BattlegroundHeroHoverCard
            card={hero.heroPower}
            label="Сила героя"
            className="right-1 delay-75 sm:right-2"
          />
        )}
      </div>
      <h4 className="mt-2 min-h-[2.2rem] font-hs text-sm leading-tight text-[#3d2a1e]">{hero.name}</h4>
      <div className="mt-2 flex flex-wrap justify-center gap-1.5">
        <span className="rounded-md border border-[#d7b66a]/70 bg-[#fff3c4] px-2.5 py-1 font-hs text-sm leading-none text-[#3d2a1e] shadow-sm">
          {hero.averagePlace || '—'}
        </span>
        {hero.popularity && (
          <span className="rounded-md border border-[#bfdbfe] bg-[#dbeafe] px-2.5 py-1 text-xs font-bold leading-none text-[#1e3a8a] shadow-sm">
            {hero.popularity}
          </span>
        )}
      </div>
      {hero.heroPower && (
        <span className="sr-only">
          Сила героя: {hero.heroPower.name}.
          {tier ? ` Тир ${tier}.` : ''}
        </span>
      )}
    </a>
  );
}

const MemoBattlegroundHeroCard = memo(BattlegroundHeroCard);

const BG_DETAIL_RACE_ICON_BY_RU: Record<string, string> = {
  Механизмы: '/bg-legacy/assset/механизмы.webp',
  Механизм: '/bg-legacy/assset/механизмы.webp',
  Мурлоки: '/bg-legacy/assset/мурлоки.webp',
  Мурлок: '/bg-legacy/assset/мурлоки.webp',
  Звери: '/bg-legacy/assset/зверь.webp',
  Зверь: '/bg-legacy/assset/зверь.webp',
  Демоны: '/bg-legacy/assset/демоны.webp',
  Демон: '/bg-legacy/assset/демоны.webp',
  Драконы: '/bg-legacy/assset/драконы.webp',
  Дракон: '/bg-legacy/assset/драконы.webp',
  Нежить: '/bg-legacy/assset/нежить.webp',
  Нага: '/bg-legacy/assset/наги.webp',
  Наги: '/bg-legacy/assset/наги.webp',
  Элементали: '/bg-legacy/assset/элементали.webp',
  Элементаль: '/bg-legacy/assset/элементали.webp',
  Пираты: '/bg-legacy/assset/пираты.webp',
  Пират: '/bg-legacy/assset/пираты.webp',
  Свинобраз: '/bg-legacy/assset/свинобразы.webp',
  Свинобразы: '/bg-legacy/assset/свинобразы.webp',
};

const BG_DETAIL_RACE_ICON_BY_SLUG: Record<string, string> = {
  mech: '/bg-legacy/assset/механизмы.webp',
  mechanical: '/bg-legacy/assset/механизмы.webp',
  murloc: '/bg-legacy/assset/мурлоки.webp',
  beast: '/bg-legacy/assset/зверь.webp',
  demon: '/bg-legacy/assset/демоны.webp',
  dragon: '/bg-legacy/assset/драконы.webp',
  undead: '/bg-legacy/assset/нежить.webp',
  naga: '/bg-legacy/assset/наги.webp',
  elemental: '/bg-legacy/assset/элементали.webp',
  pirate: '/bg-legacy/assset/пираты.webp',
  quilboar: '/bg-legacy/assset/свинобразы.webp',
};

const BG_TAVERN_BAR_COLORS = ['#e7c45d', '#74b3dc', '#7cc687', '#d98b54', '#b785d8', '#5fb7b0', '#f0d17a'];
const BG_DETAIL_DATE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function bgDetailPercent(value: any): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value || '').replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function bgDetailRaceIcon(nameOrSlug: any): string {
  const raw = String(nameOrSlug || '').trim();
  return BG_DETAIL_RACE_ICON_BY_RU[raw] || BG_DETAIL_RACE_ICON_BY_SLUG[raw.toLowerCase()] || '/bg-legacy/assset/общее.webp';
}

function bgDetailTavernIcon(tier: any): string {
  const safe = Number.isFinite(Number(tier)) ? Number(tier) : 1;
  return `/bg-legacy/assset/tier${safe}.png`;
}

function bgDetailFormatPercent(value: any): string {
  const num = bgDetailPercent(value);
  return `${num.toFixed(num >= 10 ? 1 : 2).replace('.', ',')}%`;
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

type BattlegroundHeroTableColumn = {
  key: string;
  label: string;
  render?: (row: any) => React.ReactNode;
};

type BattlegroundHeroPatchNote = {
  label: string;
  value: string;
  tone?: 'blue' | 'gold';
};

type BattlegroundHeroPatchEntry = {
  date?: string | null;
  patch?: string | null;
  patch_url?: string | null;
  items?: string[];
};

const EMPTY_HERO_PATCH_ENTRIES: BattlegroundHeroPatchEntry[] = [];

function bgHeroTableRowKey(row: any, columns: BattlegroundHeroTableColumn[]): string {
  const parts: string[] = [];
  for (const column of columns) {
    const value = row?.[column.key];
    if (value !== null && value !== undefined && value !== '') parts.push(String(value));
  }
  return parts.join('|') || JSON.stringify(row);
}

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
  return bgDetailImageSources(
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

function bgDetailFormatDate(value: any): string {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return BG_DETAIL_DATE_FORMATTER.format(date);
}

function bgDetailLatestDate(...values: any[]): string {
  let latest = 0;
  for (const value of values) {
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      const time = new Date(String(entry || '').replace(' ', 'T')).getTime();
      if (Number.isFinite(time)) latest = Math.max(latest, time);
    }
  }
  return latest ? bgDetailFormatDate(new Date(latest).toISOString()) : '—';
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
  const [visible, setVisible] = useState(false);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const item = items[index] || null;
  usePageScrollLock(Boolean(item));

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && items.length > 1) onIndexChange((index - 1 + items.length) % items.length);
      if (event.key === 'ArrowRight' && items.length > 1) onIndexChange((index + 1) % items.length);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [index, items.length, onClose, onIndexChange]);

  if (!item) return null;

  return createPortal(
    <div
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
      onClick={onClose}
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
          onClose();
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
                    className="h-2.5 rounded-full transition-all"
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
          onClose();
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
      className={`bg-hero-action-card group rounded-2xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(61,42,30,0.1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f] ${
        tone === 'gold'
          ? 'bg-hero-action-card--gold border-[#d6a74c] bg-[linear-gradient(135deg,#fff2cf,#eed19c)]'
          : 'border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffdf8,#f8eed9)]'
      }`}
    >
      <p className="bg-hero-action-card__kicker font-hs text-xs uppercase tracking-[0.16em]">{title}</p>
      <div className="mt-2 grid items-start gap-3 sm:grid-cols-[96px_1fr]">
        <BattlegroundHeroImage
          sources={sources}
          alt={card.name || title}
          className="mx-auto w-[86px] sm:mx-0 sm:w-[96px]"
          imgClassName="w-full object-contain drop-shadow-[0_12px_18px_rgba(61,42,30,0.18)] transition-transform duration-200 group-hover:scale-[1.03]"
        />
        <div className="min-w-0">
          <h3 className="bg-hero-action-card__title font-hs text-lg leading-tight text-[#3d2a1e]">{card.name || title}</h3>
          {text && (
            <p className="bg-hero-action-card__text mt-2 text-sm leading-relaxed">
              {text}
            </p>
          )}
          <span className="mt-3 inline-flex items-center rounded-full border border-[#d7b66a] bg-white/55 px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
            Открыть
          </span>
        </div>
      </div>
    </button>
  );
}

function BattlegroundHeroBarChart({ rows, title, valueLabel = 'Доля' }: { rows: Array<{ label: string; value: number; sub?: string; icon?: string }>; title: string; valueLabel?: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const max = Math.max(1, ...rows.map(row => row.value));
  const activeRow = rows[activeIndex] || rows[0] || null;
  return (
    <section className="rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="font-hs text-xl text-[#3d2a1e]">{title}</h3>
        {activeRow && (
          <div className="rounded-full border border-[#d7b66a] bg-[#fff8ea] px-3 py-1 text-xs font-bold text-[#6b4c2a]">
            {activeRow.label}: {activeRow.sub || bgDetailFormatPercent(activeRow.value)} {valueLabel ? `· ${valueLabel}` : ''}
          </div>
        )}
      </div>
      <div className="mt-4 space-y-2.5">
        {rows.map((row, index) => (
          <button
            key={row.label}
            type="button"
            onMouseEnter={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
            onClick={() => setActiveIndex(index)}
            className={`bg-hero-bar-row grid w-full items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors sm:gap-3 ${
              activeIndex === index
                ? 'border-[#d7b66a] bg-[#fff8ea]'
                : 'border-transparent bg-white/30 hover:border-[#e2cf99] hover:bg-white/55'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-[#4a3018]">
              {row.icon && <img src={row.icon} alt="" className="h-7 w-7 object-contain" loading="lazy" />}
              <span>{row.label}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[#eadfbe]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#60a5fa] via-[#22d3ee] to-[#f6ce68]"
                style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }}
              />
            </div>
            <div className="col-span-2 text-left text-xs font-bold text-[#6b4c2a] sm:col-span-1 sm:text-right" title={valueLabel}>{row.sub || bgDetailFormatPercent(row.value)}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function BattlegroundHeroTavernStack({ rows }: { rows: any[] }) {
  const [activeLabel, setActiveLabel] = useState('');
  const byTurn = new Map<number, any[]>();
  rows.forEach(row => {
    const turn = Number(row.turn);
    if (!Number.isFinite(turn)) return;
    if (!byTurn.has(turn)) byTurn.set(turn, []);
    byTurn.get(turn)!.push(row);
  });
  const turns = Array.from(byTurn.keys()).sort((a, b) => a - b);
  return (
    <section className="rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-hs text-xl text-[#3d2a1e]">Таверна по ходам</h3>
          {activeLabel && <p className="mt-1 text-xs font-bold text-[#6b4c2a]">{activeLabel}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {[1,2,3,4,5,6,7].map(tier => (
            <span key={tier} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#6b4c2a]">
              <img src={bgDetailTavernIcon(tier)} alt="" className="h-5 w-5 object-contain" loading="lazy" />
              {tier}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {turns.map(turn => {
          const entries = (byTurn.get(turn) || []).slice().sort((a, b) => Number(a.tavern_tier) - Number(b.tavern_tier));
          return (
            <div key={turn} className="grid grid-cols-[46px_1fr] items-center gap-3">
              <span className="font-hs text-sm text-[#8b4513]">Х{turn}</span>
              <div className="flex h-8 overflow-hidden rounded-xl border border-[#e2cf99] bg-[#eadfbe]">
                {entries.map(entry => {
                  const tier = Number(entry.tavern_tier);
                  const pct = Math.max(0, bgDetailPercent(entry.pct_at_tier));
                  if (pct <= 0) return null;
                  return (
                    <button
                      type="button"
                      key={`${turn}-${tier}`}
                      onMouseEnter={() => setActiveLabel(`Ход ${turn} · таверна ${tier} · ${bgDetailFormatPercent(pct)}`)}
                      onFocus={() => setActiveLabel(`Ход ${turn} · таверна ${tier} · ${bgDetailFormatPercent(pct)}`)}
                      onClick={() => setActiveLabel(`Ход ${turn} · таверна ${tier} · ${bgDetailFormatPercent(pct)}`)}
                      className="flex min-w-[2px] items-center justify-center text-[10px] font-black text-[#3d2a1e] transition-[filter] hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f]"
                      style={{ width: `${pct}%`, background: BG_TAVERN_BAR_COLORS[(tier - 1) % BG_TAVERN_BAR_COLORS.length] }}
                      title={`Ход ${turn}, таверна ${tier}: ${bgDetailFormatPercent(pct)}`}
                    >
                      {pct >= 10 ? tier : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BattlegroundHeroLineChart({ rows }: { rows: any[] }) {
  const points = rows
    .map(row => ({ turn: Number(row.turn), value: bgDetailPercent(row.invoked_rate), points: Number(row.total_data_points || 0) }))
    .filter(row => Number.isFinite(row.turn))
    .sort((a, b) => a.turn - b.turn);
  const [activeTurn, setActiveTurn] = useState(points.findIndex(point => point.value >= 70) >= 0 ? points.findIndex(point => point.value >= 70) : Math.max(0, points.length - 1));
  const maxTurn = Math.max(1, ...points.map(row => row.turn));
  const maxValue = Math.max(100, ...points.map(row => row.value));
  const width = 720;
  const height = 178;
  const pad = 28;
  const xy = (row: { turn: number; value: number }) => {
    const x = pad + ((row.turn - 1) / Math.max(1, maxTurn - 1)) * (width - pad * 2);
    const y = height - pad - (row.value / maxValue) * (height - pad * 2);
    return [x, y] as const;
  };
  const activePoint = points[activeTurn] || null;
  const d = points.map((row, index) => {
    const [x, y] = xy(row);
    return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  return (
    <section className="rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="font-hs text-xl text-[#3d2a1e]">Когда прожимать силу героя</h3>
        {activePoint && (
          <div className="rounded-full border border-[#d7b66a] bg-[#fff8ea] px-3 py-1 text-xs font-bold text-[#6b4c2a]">
            Ход {activePoint.turn} · {bgDetailFormatPercent(activePoint.value)} · {bgFormatCount(activePoint.points)} точек
          </div>
        )}
      </div>
      <div className="mt-4 overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full touch-none" style={{ height: '11rem' }}>
          <defs>
            <linearGradient id="heroPowerLine" x1="0" x2="1">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="60%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#f6ce68" />
            </linearGradient>
          </defs>
          {[0,25,50,75,100].map(value => {
            const y = height - pad - (value / maxValue) * (height - pad * 2);
            return <line key={value} x1={pad} x2={width - pad} y1={y} y2={y} stroke="rgba(139,108,66,0.16)" />;
          })}
          <path d={d} fill="none" stroke="url(#heroPowerLine)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((row, index) => {
            const [x, y] = xy(row);
            return (
              <g
                key={row.turn}
                onMouseEnter={() => setActiveTurn(index)}
                onFocus={() => setActiveTurn(index)}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={activeTurn === index ? '7' : '5'}
                  fill="#f6ce68"
                  stroke="#8b4513"
                  strokeWidth="2"
                  style={{ cursor: 'pointer' }}
                />
                <text x={x} y={height - 8} textAnchor="middle" fill="#6b4c2a" fontSize="11" fontWeight="700">{row.turn}</text>
                {activeTurn === index && (
                  <text x={x} y={y - 12} textAnchor="middle" fill="#3d2a1e" fontSize="11" fontWeight="800">
                    {Math.round(row.value)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function BattlegroundHeroCompositionLineup({ composition, cards }: { composition: any; cards: Record<string, any> }) {
  const lineup = Array.isArray(composition?.lineup) ? composition.lineup : [];
  if (!lineup.length) return null;
  return (
    <section className="bg-hero-ledger-panel rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Лучший состав</p>
          <h3 className="font-hs text-2xl text-[#3d2a1e]">{composition?.name || 'Состав'}</h3>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold text-[#6b4c2a]">
          <span className="rounded-full border border-[#d7b66a] bg-[#fff8ea] px-3 py-1">Среднее {bgFormatDecimal(composition?.avg_placement, 2)}</span>
          <span className="rounded-full border border-[#bfdbfe] bg-[#dbeafe] px-3 py-1 text-[#1e3a8a]">{composition?.popularity || '—'} выбор</span>
          <span className="rounded-full border border-[#d7b66a] bg-[#fff8ea] px-3 py-1">{bgFormatCount(composition?.num_games)} игр</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        {lineup.map((minion: any) => {
          const dbf = String(minion.dbfId || minion.minion_dbf_id || '');
          const card = cards[dbf] || {};
          const isPremium = Boolean(minion.premium);
          const raceLabel = card.creature_type_name || minion.raceRu || '';
          const cardName = card.name || minion.name;
          const cardText = bgDetailCardText(card, 'normal');
          const sources = bgDetailImageSources(card.image, card.image_gold);
          return (
            <article
              key={`${dbf}-${minion.zone_position}`}
              title={cardText ? `${cardName}: ${cardText}` : cardName}
              className="group relative rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3 text-center shadow-sm transition-shadow duration-200 hover:shadow-[0_14px_30px_rgba(61,42,30,0.16)]"
            >
              <div className="relative mx-auto flex h-40 items-center justify-center rounded-xl bg-[radial-gradient(circle_at_top,#fff5d2,transparent_60%),linear-gradient(180deg,#fffdf8,#f2e1bc)] p-2">
                <BattlegroundHeroImage
                  sources={sources}
                  alt={cardName}
                  className="w-full"
                  imgClassName="mx-auto max-h-36 w-full object-contain drop-shadow-[0_10px_14px_rgba(61,42,30,0.18)]"
                  fallback={
                    <div className="flex h-36 w-24 items-center justify-center rounded-md bg-[#efe2bf] px-2 text-center text-xs font-bold text-[#6b4c2a]">
                      {minion.name}
                    </div>
                  }
                />
                {isPremium && <span className="absolute right-2 top-2 rounded-full bg-[#f6ce68] px-2 py-0.5 text-[10px] font-black text-[#3d2a1e]">G</span>}
              </div>
              {cardText && (
                <div className="pointer-events-none invisible absolute left-2 right-2 top-2 z-30 rounded-xl border border-[#d7b66a] bg-[#fffdf7]/98 p-3 text-left opacity-0 shadow-[0_16px_36px_rgba(61,42,30,0.2)] backdrop-blur transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
                  <p className="font-hs text-[10px] uppercase tracking-[0.14em] text-[#8b6c42]">Описание карты</p>
                  <p className="mt-1 text-xs font-bold leading-snug text-[#3d2a1e]">{cardText}</p>
                </div>
              )}
              <h4 className="mt-2 min-h-[2.4rem] text-sm font-bold leading-tight text-[#3d2a1e]">{cardName}</h4>
              <div className="mt-2 flex items-center justify-center gap-2">
                <img src={bgDetailTavernIcon(card.tavern_tier || minion.techLevel)} alt={`Таверна ${card.tavern_tier || minion.techLevel || ''}`} className="h-6 w-6 object-contain" loading="lazy" />
                <img src={bgDetailRaceIcon(raceLabel || card.creature_type)} alt={raceLabel || 'Тип существа'} className="h-6 w-6 object-contain" loading="lazy" />
              </div>
              <p className="mt-1 text-[11px] font-bold text-[#6b4c2a]">{minion.attack ?? '—'} / {minion.health ?? '—'}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BattlegroundHeroDataTable({ title, rows, columns }: { title: string; rows: any[]; columns: Array<{ key: string; label: string; render?: (row: any) => React.ReactNode }> }) {
  return (
    <section className="bg-hero-ledger-panel rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
      <h3 className="font-hs text-xl text-[#3d2a1e]">{title}</h3>
      <div className="mt-3 space-y-3 md:hidden">
        {rows.map(row => {
          const rowKey = bgHeroTableRowKey(row, columns);
          return (
          <div key={rowKey} className="rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3 shadow-sm">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {columns.map(column => (
                <div key={column.key}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8b6c42]">{column.label}</p>
                  <div className="mt-1 text-sm text-[#3d2a1e]">{column.render ? column.render(row) : row[column.key]}</div>
                </div>
              ))}
            </div>
          </div>
          );
        })}
      </div>
      <div className="mt-3 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              {columns.map(column => (
                <th key={column.key} className="border-b border-[#d7b66a]/65 px-3 py-2 text-xs uppercase tracking-wide text-[#8b6c42]">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const rowKey = bgHeroTableRowKey(row, columns);
              return (
              <tr key={rowKey} className="odd:bg-white/36">
                {columns.map(column => (
                  <td key={column.key} className="border-b border-[#e2cf99] px-3 py-2 text-[#3d2a1e]">
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BattlegroundHeroMinionNameTooltip({ name, card }: { name: string; card: any }) {
  const sources = bgDetailCardSources(card);
  if (!sources.length) {
    return <span className="truncate text-sm font-bold text-[#3d2a1e]">{name}</span>;
  }

  return (
    <span className="group relative inline-block max-w-full align-top">
      <button
        type="button"
        aria-label={`Показать карту: ${name}`}
        className="block max-w-full truncate rounded-sm text-left text-sm font-bold text-[#3d2a1e] outline-none transition-colors group-hover:text-[#8b4513] focus-visible:text-[#8b4513] focus-visible:ring-2 focus-visible:ring-[#b58a2f]"
      >
        {name}
      </button>
      <span className="pointer-events-none invisible absolute bottom-full left-0 z-50 mb-3 w-[170px] rounded-2xl border border-[#d7b66a] bg-[#fff9ed] p-2 opacity-0 shadow-[0_18px_42px_rgba(61,42,30,0.24)] transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <BattlegroundHeroImage
          sources={sources}
          alt={name}
          className="mx-auto w-full"
          imgClassName="mx-auto max-h-60 w-full object-contain drop-shadow-[0_12px_18px_rgba(61,42,30,0.2)]"
        />
      </span>
    </span>
  );
}

function BattlegroundHeroProfileInfo({
  heroName,
  libraryHero,
  externalLinks,
}: {
  heroName: string;
  libraryHero: any;
  externalLinks: Array<{ label: string; url: string }>;
}) {
  const description = bgHeroDescriptionRu(heroName, libraryHero?.character?.description);
  const race = bgHeroRaceLabel(libraryHero?.race);
  const artist = String(libraryHero?.artist || '').trim() || '—';
  const normalArmor = bgHeroArmorValue(libraryHero?.armor, 'normal');
  const duosArmor = bgHeroArmorValue(libraryHero?.armor, 'duos');
  const armorText = typeof libraryHero?.armor?.text === 'string' ? libraryHero.armor.text : '';

  return (
    <section className="bg-hero-ledger-panel grid gap-4 rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)] lg:grid-cols-[1fr_320px]">
      <div>
        <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Профиль героя</p>
        <h3 className="font-hs text-2xl text-[#3d2a1e]">Кто это и откуда данные</h3>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#5f4730]">{description}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8b6c42]">Раса</p>
            <p className="mt-1 text-base font-black text-[#3d2a1e]">{race}</p>
          </div>
          <div className="rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8b6c42]">Художник</p>
            <p className="mt-1 text-base font-black text-[#3d2a1e]">{artist}</p>
          </div>
          <div className="rounded-2xl border border-[#bfdbfe] bg-[#dbeafe]/80 p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1e3a8a]">Броня соло</p>
            <p className="mt-1 text-xl font-black text-[#1e3a8a]">{normalArmor}</p>
          </div>
          <div className="rounded-2xl border border-[#d6a74c] bg-[#fff2cf] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#70450e]">Броня дуо</p>
            <p className="mt-1 text-xl font-black text-[#70450e]">{duosArmor}</p>
          </div>
        </div>
        {armorText && (
          <p className="mt-3 text-xs font-semibold text-[#8b6c42]">Оригинальная строка брони: {armorText}</p>
        )}
      </div>
      <aside className="rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3">
        <p className="font-hs text-sm uppercase tracking-[0.14em] text-[#8b6c42]">External links</p>
        <div className="mt-3 grid gap-2">
          {externalLinks.map(link => (
            <a
              key={`${link.label}-${link.url}`}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[#d7b66a] bg-[#fff8ea] px-3 py-2 text-sm font-black text-[#3d2a1e] transition-colors hover:bg-[#fff1c8]"
            >
              <span>{link.label}</span>
              <span aria-hidden="true" className="text-[#8b6c42]">↗</span>
            </a>
          ))}
        </div>
      </aside>
    </section>
  );
}

function BattlegroundHeroPatchChange({
  notes,
  sourceUrl,
  changes,
}: {
  notes: BattlegroundHeroPatchNote[];
  sourceUrl?: string;
  changes?: BattlegroundHeroPatchEntry[];
}) {
  const patchEntries = changes || EMPTY_HERO_PATCH_ENTRIES;
  return (
    <section className="bg-hero-ledger-panel rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Текущий патч</p>
          <h3 className="font-hs text-xl text-[#3d2a1e]">Изменения патча</h3>
        </div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-[#d7b66a] bg-[#fff8ea] px-3 py-2 text-sm font-bold text-[#3d2a1e] transition-colors hover:bg-[#fff1c8]"
          >
            Источник данных
          </a>
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {notes.map(note => (
          <div
            key={note.label}
            className={`rounded-2xl border p-3 ${
              note.tone === 'blue'
                ? 'border-[#bfdbfe] bg-[#dbeafe]/75 text-[#1e3a8a]'
                : note.tone === 'gold'
                  ? 'border-[#d6a74c] bg-[#fff2cf] text-[#70450e]'
                  : 'border-[#e2cf99] bg-[#fff9ed] text-[#3d2a1e]'
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-75">{note.label}</p>
            <p className="mt-1 text-base font-black leading-tight">{note.value || '—'}</p>
          </div>
        ))}
      </div>
      {patchEntries.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3">
          <p className="font-hs text-sm uppercase tracking-[0.14em] text-[#8b6c42]">Последние изменения</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {patchEntries.map((entry, index) => {
              const patchLabel = [entry.patch ? `Патч ${entry.patch}` : '', bgFormatPatchDate(entry.date)].filter(Boolean).join(' · ');
              const body = Array.isArray(entry.items) && entry.items.length ? entry.items : ['Подробности изменения не указаны.'];
              const entryKey = [entry.patch, entry.date, entry.patch_url, body.join('|')].filter(Boolean).join('|');
              const content = (
                <article className="h-full rounded-xl border border-[#ead9a7] bg-[#fffdfa] p-3 text-sm text-[#3d2a1e] transition-colors hover:bg-[#fff8ea]">
                  <p className="font-black text-[#70450e]">{patchLabel || `Изменение ${index + 1}`}</p>
                  <ul className="mt-2 space-y-1.5">
                    {body.map(item => (
                      <li key={item} className="leading-6">{bgHeroPatchTextRu(item)}</li>
                    ))}
                  </ul>
                </article>
              );
              return entry.patch_url ? (
                <a key={entryKey} href={entry.patch_url} target="_blank" rel="noreferrer" className="block">
                  {content}
                </a>
              ) : (
                <div key={entryKey}>{content}</div>
              );
            })}
          </div>
        </div>
      )}
    </section>
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
}: {
  heroName: string;
  items: BattlegroundHeroMediaItem[];
  soundGroups: BattlegroundHeroSoundGroup[];
  onOpen: (index: number) => void;
}) {
  if (!items.length && !soundGroups.length) return null;
  return (
    <section className="bg-hero-ledger-panel rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Галерея</p>
          <h3 className="font-hs text-xl text-[#3d2a1e]">{heroName}</h3>
        </div>
        <p className="text-xs font-bold text-[#6b4c2a]">{items.length} арта</p>
      </div>

      {items.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onOpen(index)}
              className="group rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3 text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_24px_rgba(61,42,30,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f]"
            >
              <div className="aspect-square overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,#fff5d2,transparent_60%),linear-gradient(180deg,#fffdf8,#f2e1bc)]">
                <BattlegroundHeroImage
                  sources={bgDetailImageSources(item.image)}
                  alt={item.title}
                  className="h-full w-full"
                  imgClassName="h-full w-full object-cover drop-shadow-[0_10px_14px_rgba(61,42,30,0.16)] transition-transform duration-200 group-hover:scale-[1.025]"
                />
              </div>
              <p className="mt-2 font-hs text-xs uppercase tracking-[0.14em] text-[#8b6c42]">{item.kicker || 'Арт'}</p>
              <h4 className="mt-1 text-sm font-bold leading-tight text-[#3d2a1e]">{item.title}</h4>
              {item.text && <p className="mt-1 line-clamp-2 text-xs font-semibold leading-snug text-[#6b4c2a]">{bgDetailCardTooltipText(item.text)}</p>}
            </button>
          ))}
        </div>
      )}

      <BattlegroundHeroSoundBoard soundGroups={soundGroups} />
    </section>
  );
}

function BattlegroundHeroTopCompositions({ rows }: { rows: any[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  if (!rows.length) return null;
  const currentIndex = Math.min(activeIndex, rows.length - 1);
  const maxGames = Math.max(1, ...rows.map(row => Number(row.num_games || 0)));
  const active = rows[currentIndex] || rows[0];
  return (
    <section className="rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-hs text-xl text-[#3d2a1e]">Топ составы героя</h3>
          <p className="mt-1 text-xs font-bold text-[#6b4c2a]">
            {active?.name || 'Состав'} · среднее {bgFormatDecimal(active?.avg_placement, 2)} · {active?.popularity || '—'} выбор
          </p>
        </div>
        <span className="rounded-full border border-[#d7b66a] bg-[#fff8ea] px-3 py-1 text-xs font-bold text-[#6b4c2a]">
          {rows.length} вариантов
        </span>
      </div>
      <div className="mt-4 grid gap-2.5">
        {rows.map((row, index) => {
          const games = Number(row.num_games || 0);
          const width = Math.max(4, (games / maxGames) * 100);
          return (
            <button
              key={`${row.name}-${row.num_games || 0}-${row.avg_placement || 0}`}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
              className={`rounded-2xl border px-3 py-3 text-left transition-all ${
                currentIndex === index
                  ? 'border-[#d7b66a] bg-[#fff8ea] shadow-[0_10px_22px_rgba(61,42,30,0.08)]'
                  : 'border-[#e2cf99] bg-white/35 hover:bg-white/55'
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <img src={bgDetailRaceIcon(row.name)} alt="" className="h-7 w-7 object-contain" loading="lazy" />
                    <span className="font-hs text-lg text-[#3d2a1e]">{row.name}</span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-[#6b4c2a]">
                    Среднее {bgFormatDecimal(row.avg_placement, 2)} · топ-4 {row.popularity_top_4 || '—'}
                  </p>
                </div>
                <div className="sm:w-[240px]">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#6b4c2a]">
                    <span>{row.popularity || '—'} выбор</span>
                    <span>{bgFormatCount(row.num_games)} игр</span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-[#eadfbe]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#60a5fa] via-[#22d3ee] to-[#f6ce68]"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BattlegroundHeroDetailPage({ dbfId, onNavigate }: { dbfId: string; onNavigate: (path: string) => void }) {
  const [state, setState] = useState<{ payload: BattlegroundHeroDetailPayload | null; loading: boolean; error: string }>({
    payload: null,
    loading: true,
    error: '',
  });
  const [lightboxItems, setLightboxItems] = useState<BattlegroundHeroMediaItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const openMediaGallery = useCallback((items: BattlegroundHeroMediaItem[], index: number) => {
    if (!items.length) return;
    setLightboxItems(items);
    setLightboxIndex(index);
  }, []);
  const closeLightbox = useCallback(() => setLightboxIndex(-1), []);

  useEffect(() => {
    let alive = true;
    const cached = BG_HERO_DETAIL_CLIENT_CACHE.get(dbfId);
    if (cached) {
      setState({ payload: cached, loading: false, error: '' });
      return () => { alive = false; };
    }

    setState(current => current.loading && !current.payload ? current : { payload: null, loading: true, error: '' });
    fetch(`/api/bg/heroes/${dbfId}/details`)
      .then(async response => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) throw new Error(data?.error || 'Не удалось загрузить героя');
        BG_HERO_DETAIL_CLIENT_CACHE.set(dbfId, data);
        if (alive) setState({ payload: data, loading: false, error: '' });
      })
      .catch((err: any) => {
        if (alive) setState({ payload: null, loading: false, error: err?.message || 'Не удалось загрузить героя' });
      });
    return () => { alive = false; };
  }, [dbfId]);

  const { payload, loading, error } = state;

  if (loading) return <div className="py-16 text-center font-hs text-[#6b4c2a]">Загружаем страницу героя...</div>;
  if (error || !payload?.stats?.hero) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => onNavigate('/heroes')} className="inline-flex items-center gap-2 rounded-md border border-[#d7b66a] px-3 py-2 text-sm font-bold text-[#3d2a1e]">
          <ChevronLeft className="h-4 w-4" /> Все герои
        </button>
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700">{error || 'Герой не найден'}</div>
      </div>
    );
  }

  const stats = payload.stats;
  const hero = stats.hero || {};
  const libraryHero = payload.libraryHero || {};
  const cards = payload.cards || {};
  const heroName = libraryHero?.name?.ru || hero.hero || 'Герой';
  const heroImage = libraryHero?.images?.hero || bgHeroImageFromMap(hero.dbfId, {});
  const fullArt = libraryHero?.images?.full_art || heroImage;
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
  const patchChanges = bgHeroPatchEntries(libraryHero);
  const asOfValues = stats.as_of && typeof stats.as_of === 'object' ? Object.values(stats.as_of) : [];
  const patchNotes: BattlegroundHeroPatchNote[] = [
    { label: 'Обновлено', value: bgDetailLatestDate(asOfValues, libraryHero?.updated_at, payload.fetched_at), tone: 'gold' },
    { label: 'Тир героя', value: hero.tier || '—' },
    { label: 'Среднее место', value: bgFormatDecimal(hero.avg_placement, 2) },
    { label: 'Выбор героя', value: hero.pick_rate || '—', tone: 'blue' },
    { label: 'Броня соло', value: bgHeroArmorValue(libraryHero?.armor, 'normal') },
    { label: 'Броня дуо', value: bgHeroArmorValue(libraryHero?.armor, 'duos') },
  ];
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
  const placementRows = (hero.placement_distribution || []).map((value: any, index: number) => ({
    label: `${index + 1} место`,
    value: bgDetailPercent(value),
  }));
  const tavernByTurnRows = (stats.tavern_up_by_turn || []).map((row: any) => ({
    label: `Ход ${row.turn}`,
    value: bgDetailPercent(row.pct_at_tier),
    sub: `T${row.recommended_tavern_tier} · ${bgDetailFormatPercent(row.pct_at_tier)}`,
    icon: bgDetailTavernIcon(row.recommended_tavern_tier),
  }));
  const topComps = Array.isArray(stats.compositions) ? stats.compositions.slice(0, 10) : [];
  const finalForm = Array.isArray(stats.best_composition?.final_form_minions) ? stats.best_composition.final_form_minions.slice(0, 12) : [];

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
            <div className="bg-hero-stat-grid mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
              <div className="bg-hero-stat-plaque rounded-2xl border border-[#d7b66a]/65 bg-[#fff8ea]/92 p-3">
                <p className="text-[11px] uppercase">Тир</p>
                <p className="font-hs text-2xl">{hero.tier || '—'}</p>
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
            <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
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
          </div>
        </div>
      </section>

      <BattlegroundHeroProfileInfo heroName={heroName} libraryHero={libraryHero} externalLinks={externalLinks} />

      <BattlegroundHeroPatchChange notes={patchNotes} sourceUrl={stats.source_url} changes={patchChanges} />

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="grid gap-5">
          <BattlegroundHeroBarChart title="Распределение по местам" rows={placementRows} />
          <BattlegroundHeroLineChart rows={stats.hero_power_by_turn || []} />
        </div>
        <BattlegroundHeroBarChart title="Когда улучшать таверну" rows={tavernByTurnRows} />
      </div>

      <BattlegroundHeroCompositionLineup composition={stats.best_composition} cards={cards} />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <BattlegroundHeroTopCompositions rows={topComps} />
        <BattlegroundHeroTavernStack rows={stats.tavern_up || []} />
      </div>

      <BattlegroundHeroDataTable
        title="Сила героя по таверне"
        rows={(stats.hero_power || []).slice(0, 24)}
        columns={[
          { key: 'turn', label: 'Ход' },
          { key: 'tavern_tier', label: 'Таверна', render: row => <span className="inline-flex items-center gap-2"><img src={bgDetailTavernIcon(row.tavern_tier)} alt="" className="h-6 w-6" />{row.tavern_tier}</span> },
          { key: 'gold', label: 'Золото' },
          { key: 'invoked_rate', label: 'Сила героя', render: row => bgDetailFormatPercent(row.invoked_rate) },
          { key: 'times_invoked', label: 'Прожато', render: row => bgFormatCount(row.times_invoked) },
          { key: 'total_data_points', label: 'Точек', render: row => bgFormatCount(row.total_data_points) },
        ]}
      />

      {finalForm.length > 0 && (
        <section className="bg-hero-ledger-panel rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
          <h3 className="font-hs text-xl text-[#3d2a1e]">Ключевые существа финального стола</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {finalForm.map((item: any, index: number) => {
              const card = cards[String(item.dbfId || item.minion_dbf_id)] || {};
              const minionName = card.name || item.name || 'Существо';
              return (
                <div key={`${item.dbfId}-${item.tavern_tier}-${index}`} className="flex items-center gap-3 rounded-2xl border border-[#e2cf99] bg-[#fff9ed] p-3 shadow-sm">
                  <img src={bgDetailTavernIcon(item.tavern_tier || card.tavern_tier)} alt="" className="h-9 w-9 object-contain" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <BattlegroundHeroMinionNameTooltip name={minionName} card={card} />
                    <p className="text-xs text-[#6b4c2a]">{item.at_least_one || '—'} игр · золотые {item.at_least_one_premium || '—'}</p>
                  </div>
                  <img src={bgDetailRaceIcon(card.creature_type_name || card.creature_type)} alt="" className="h-8 w-8 object-contain" loading="lazy" />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {skins.length > 0 && (
        <section className="bg-hero-ledger-panel rounded-2xl border border-[#d7b66a]/65 bg-[linear-gradient(180deg,#fffef9,#f4ead4)] p-4 shadow-[0_12px_28px_rgba(61,42,30,0.08)]">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Коллекция</p>
              <h3 className="font-hs text-xl text-[#3d2a1e]">Скины героя</h3>
            </div>
            <p className="text-xs font-bold text-[#6b4c2a]">{skins.length} вариантов</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
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

function BattlegroundHeroesRoute({ path, onNavigate }: { path: string; onNavigate: (path: string) => void }) {
  const detailId = bgHeroDetailPathFromPath(path);
  if (detailId) {
    return (
      <React.Fragment key={detailId}>
        <BattlegroundHeroDetailPage dbfId={detailId} onNavigate={onNavigate} />
      </React.Fragment>
    );
  }
  return <BattlegroundHeroTierList onNavigate={onNavigate} />;
}

function BattlegroundTierCard({ item, list, tier, index, highlighted, onOpen }: {
  item: any;
  list: BattlegroundTierListKey;
  tier: string;
  index: number;
  highlighted?: boolean;
  onOpen: (item: BattlegroundLightboxItem) => void;
}) {
  const title = bgItemTitle(item);
  const metric = bgMetricLine(item, list);
  const chips = bgStatChips(item, list);
  if (list === 'strategies') {
    const cards = Array.isArray(item?.cards) ? item.cards.slice(0, 4) : [];
    return (
      <article
        data-bg-strategy-highlight={highlighted ? 'true' : undefined}
        data-bg-strategy-key={item?.key || undefined}
        className={`bg-tier-strategy-card rounded-lg border p-3 shadow-sm transition-all duration-300 hover:shadow-[0_8px_24px_rgba(61,42,30,0.16)] ${
          highlighted
            ? 'bg-tier-strategy-card--highlighted'
            : ''
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-hs text-[15px] leading-tight text-[#3d2a1e]">{title}</h4>
            {metric && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#74552f]">{metric}</p>}
          </div>
          {item?.difficulty && (
            <span className="rounded-md border border-[#c4a46a]/50 bg-[#f4e4bc] px-2 py-1 text-xs font-bold text-[#5a3000]">
              {item.difficulty}
            </span>
          )}
        </div>
        {cards.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
            {cards.map((card: any, idx: number) => {
              const cardThumb = card.frame || card.card || card.fallback;
              const cardImage = card.card || card.frame || card.fallback;
              const cardTitle = bgItemTitle(card);
              const lightboxItem: BattlegroundLightboxItem = {
                key: `strategy-${tier}-${item.key || item.title}-${card.id || card.name}-${idx}`,
                title: cardTitle,
                image: cardImage,
                kicker: `${tier}-тир · ${title}`,
                meta: [card.role ? `Роль: ${card.role}` : '', metric].filter(Boolean).join(' · '),
                text: /[А-Яа-яЁё]/.test(String(card.ruText || card.text || '')) ? String(card.ruText || card.text || '') : '',
              };
              return (
              <button
                key={`${card.id || card.name}-${idx}`}
                type="button"
                onClick={() => onOpen(lightboxItem)}
                className="group rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fff7e6]"
                title={cardTitle}
              >
                <img
                  src={cardThumb}
                  alt={cardTitle}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[3/4] w-full rounded-md object-cover shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-transform duration-200 group-hover:-translate-y-0.5"
                />
              </button>
              );
            })}
          </div>
        )}
      </article>
    );
  }

  const image = bgImageForItem(item, list);
  const lightboxItem = bgLightboxItem(item, list, tier, index);
  if (list === 'trinkets') {
    const raceLabel = bgRaceLabelForItem(item);
    return (
      <button
        type="button"
        onClick={() => lightboxItem && onOpen(lightboxItem)}
        className="bg-tier-entry-card bg-tier-entry-card--trinket group flex flex-col items-center rounded-lg border border-transparent bg-[#fff7e6]/28 p-2 text-center transition-all duration-200 hover:border-[#d7b66a]/70 hover:bg-[#fff7e6]/75 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f]"
      >
        {image && (
          <img
            src={image}
            alt={title}
            loading="lazy"
            decoding="async"
            className="aspect-[3/4] w-full max-w-[184px] object-contain drop-shadow-[0_7px_14px_rgba(0,0,0,0.4)] transition-transform duration-200 group-hover:-translate-y-1"
          />
        )}
        {raceLabel && (
          <span className="mt-1.5 rounded-md border border-[#bfdbfe] bg-[#dbeafe] px-2.5 py-1 text-xs font-bold leading-none text-[#1e3a8a] shadow-sm">
            {raceLabel}
          </span>
        )}
        <span className="mt-1 rounded-md border border-[#d7b66a]/70 bg-[#fff3c4] px-2.5 py-1 font-hs text-sm leading-none text-[#3d2a1e] shadow-sm">
          {item?.avgPlacement ? bgFormatDecimal(item.avgPlacement) : '—'}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => lightboxItem && onOpen(lightboxItem)}
      className="bg-tier-entry-card group flex min-h-[132px] gap-3 rounded-lg border border-[#c4a46a]/50 bg-[#fff8ea]/95 p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#fffaf0] hover:shadow-[0_8px_20px_rgba(61,42,30,0.18)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f]"
    >
      {image && (
        <img
          src={image}
          alt={title}
          loading="lazy"
          decoding="async"
          className="h-[108px] w-[80px] flex-shrink-0 rounded-md object-cover shadow-[0_2px_8px_rgba(0,0,0,0.28)] transition-transform duration-200 group-hover:scale-[1.02]"
        />
      )}
      <div className="min-w-0 py-1">
        <h4 className="font-hs text-[15px] leading-tight text-[#2f2118]">{title}</h4>
        {chips.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chips.map(chip => (
              <span key={`${chip.label}-${chip.value}`} className="rounded-md border border-[#d7b66a]/55 bg-[#fff3d8] px-2 py-1 text-xs font-semibold leading-none text-[#553819]">
                <span className="text-[#8b6c42]">{chip.label}: </span>{chip.value}
              </span>
            ))}
          </div>
        ) : metric ? (
          <p className="mt-1.5 text-xs leading-snug text-[#5d4225]">{metric}</p>
        ) : null}
      </div>
    </button>
  );
}

const MemoBattlegroundTierCard = memo(BattlegroundTierCard);

function BattlegroundTierList() {
  const initialUrlState = bgTierListUrlState();
  const [activeList, setActiveList] = useState<BattlegroundTierListKey>(initialUrlState.list);
  const [strategySource, setStrategySource] = useState<BattlegroundStrategySource>(initialUrlState.source);
  const [highlightStrategyKey, setHighlightStrategyKey] = useState(initialUrlState.strategyKey);
  const [highlightStrategyTitle, setHighlightStrategyTitle] = useState(initialUrlState.strategyTitle);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightboxItems, setLightboxItems] = useState<BattlegroundLightboxItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [minionRaceFilter, setMinionRaceFilter] = useState('ALL');
  const [minionTavernFilter, setMinionTavernFilter] = useState('ALL');
  const [trinketSizeFilter, setTrinketSizeFilter] = useState('ALL');
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>({});
  const dataCacheRef = useRef<BattlegroundTierCache>({});
  const tierListRequestKeyRef = useRef('');
  const activeMeta = BG_TIER_LISTS.find(item => item.id === activeList)!;

  useEffect(() => {
    const syncFromUrl = () => {
      const next = bgTierListUrlState();
      setActiveList(next.list);
      setStrategySource(next.source);
      setHighlightStrategyKey(next.strategyKey);
      setHighlightStrategyTitle(next.strategyTitle);
    };
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  useEffect(() => {
    let alive = true;
    setError('');
    const params = new URLSearchParams({ list: activeList });
    if (activeList === 'strategies') params.set('source', strategySource);
    const cacheKey = params.toString();
    tierListRequestKeyRef.current = cacheKey;
    const cached = dataCacheRef.current[cacheKey];
    if (cached && (!cached?.list || cached.list === activeList)) {
      setData(cached);
      setLoading(false);
    } else {
      setData(null);
      setLoading(true);
    }
    fetch(`/api/bg/tier-lists?${params.toString()}`)
      .then(async res => {
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Не удалось загрузить BG тир-лист');
        if (payload?.list && payload.list !== activeList) {
          throw new Error('API вернул данные другого раздела');
        }
        dataCacheRef.current[cacheKey] = payload;
        if (alive && tierListRequestKeyRef.current === cacheKey) setData(payload);
      })
      .catch(err => {
        if (alive && tierListRequestKeyRef.current === cacheKey) setError(err?.message || 'Не удалось загрузить BG тир-лист');
      })
      .finally(() => {
        if (alive && tierListRequestKeyRef.current === cacheKey) setLoading(false);
      });
    return () => { alive = false; };
  }, [activeList, strategySource]);

  const activeData = data?.list === activeList ? data : null;
  const tierCounts = useMemo(() => activeData?.tierCounts || {}, [activeData?.tierCounts]);
  const tiers = useMemo(() => activeData?.tiers || {}, [activeData?.tiers]);
  const minionFilterOptions = useMemo(() => {
    const raceSet = new Set<string>();
    const tavernSet = new Set<string>();
    BG_TIER_ORDER.forEach(tier => {
      const items = Array.isArray(tiers[tier]) ? tiers[tier] : [];
      items.forEach((item: any) => {
        const races = bgItemRaces(item);
        races.forEach((race: string) => raceSet.add(String(race || 'NONE')));
        if (item.tavernTier) tavernSet.add(String(item.tavernTier));
      });
    });
    return {
      races: BG_RACE_ORDER.filter(race => race === 'ALL' || raceSet.has(race)),
      taverns: ['ALL', ...Array.from(tavernSet).sort((a, b) => Number(a) - Number(b))],
    };
  }, [tiers]);
  const trinketFilterOptions = useMemo(() => {
    const sizeSet = new Set<string>();
    BG_TIER_ORDER.forEach(tier => {
      const items = Array.isArray(tiers[tier]) ? tiers[tier] : [];
      items.forEach((item: any) => {
        const size = String(item?.size || '').toUpperCase();
        if (size) sizeSet.add(size);
      });
    });
    return {
      sizes: ['ALL', ...(['SMALL', 'LARGE'].filter(size => sizeSet.has(size)))],
    };
  }, [tiers]);
  const displayedTiers = useMemo(() => {
    if (activeList !== 'minions' && activeList !== 'trinkets') return tiers;
    const next: Record<string, any[]> = {};
    BG_TIER_ORDER.forEach(tier => {
      const items = Array.isArray(tiers[tier]) ? tiers[tier] : [];
      next[tier] = items.filter((item: any) => {
        if (activeList === 'trinkets') {
          return trinketSizeFilter === 'ALL' || String(item?.size || '').toUpperCase() === trinketSizeFilter;
        }
        const races = bgItemRaces(item);
        const raceOk = minionRaceFilter === 'ALL' || races.includes(minionRaceFilter);
        const tavernOk = minionTavernFilter === 'ALL' || String(item.tavernTier || '') === minionTavernFilter;
        return raceOk && tavernOk;
      });
    });
    return next;
  }, [activeList, minionRaceFilter, minionTavernFilter, tiers, trinketSizeFilter]);
  const currentLightboxItem = lightboxIndex >= 0 ? lightboxItems[lightboxIndex] : null;
  usePageScrollLock(Boolean(currentLightboxItem));
  const hasStrategyHighlight = activeList === 'strategies' && Boolean(highlightStrategyKey || highlightStrategyTitle);

  const openLightbox = useCallback((item: BattlegroundLightboxItem) => {
    const gallery: BattlegroundLightboxItem[] = [];
    BG_TIER_ORDER.forEach(tier => {
      const items = Array.isArray(displayedTiers[tier]) ? displayedTiers[tier] : [];
      items.forEach((entry: any, idx: number) => {
        if (activeList === 'strategies') {
          (Array.isArray(entry.cards) ? entry.cards : []).forEach((card: any, cardIdx: number) => {
            const cardImage = card.card || card.frame || card.fallback;
            if (!cardImage) return;
            gallery.push({
              key: `strategy-${tier}-${entry.key || entry.title}-${card.id || card.name}-${cardIdx}`,
              title: bgItemTitle(card),
              image: cardImage,
              kicker: `${tier}-тир · ${bgItemTitle(entry)}`,
              meta: [card.role ? `Роль: ${card.role}` : '', bgMetricLine(entry, activeList)].filter(Boolean).join(' · '),
              text: card.ruText || card.text || '',
            });
          });
        } else {
          const lightboxEntry = bgLightboxItem(entry, activeList, tier, idx);
          if (lightboxEntry) gallery.push(lightboxEntry);
        }
      });
    });

    const nextItems = gallery.length ? gallery : [item];
    const foundIndex = nextItems.findIndex(entry => entry.key === item.key);
    setLightboxItems(nextItems);
    setLightboxIndex(foundIndex >= 0 ? foundIndex : 0);
  }, [activeList, displayedTiers]);

  useEffect(() => {
    if (!currentLightboxItem) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxIndex(-1);
      if (event.key === 'ArrowLeft') setLightboxIndex(index => Math.max(0, index - 1));
      if (event.key === 'ArrowRight') setLightboxIndex(index => Math.min(lightboxItems.length - 1, index + 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentLightboxItem, lightboxItems.length]);

  useEffect(() => {
    if (!hasStrategyHighlight || loading) return undefined;
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>('[data-bg-strategy-highlight="true"]');
      if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [displayedTiers, hasStrategyHighlight, loading]);

  return (
    <div className="bg-tier-list-page space-y-5">
      <div className="text-center">
        <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8b6c42]">Поля сражений</p>
        <h2 className="mt-2 font-hs text-3xl text-[#3d2a1e] sm:text-4xl">Тир-лист</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-[#6b4c2a]">
          Существа, стратегии, заклинания и аксессуары как отдельные карточки и объекты данных из BG-базы Манакоста.
        </p>
      </div>

      <div className="bg-tier-nav-grid grid grid-cols-2 gap-2 lg:grid-cols-4">
        {BG_TIER_LISTS.map(item => {
          const active = item.id === activeList;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setData(null);
                setLoading(true);
                setLightboxIndex(-1);
                setLightboxItems([]);
                setActiveList(item.id);
                setMinionRaceFilter('ALL');
                setMinionTavernFilter('ALL');
                setTrinketSizeFilter('ALL');
                setVisibleLimits({});
                if (item.id !== 'strategies') {
                  setHighlightStrategyKey('');
                  setHighlightStrategyTitle('');
                }
                const params = new URLSearchParams(window.location.search);
                params.set('list', item.id);
                if (item.id !== 'strategies') params.delete('source');
                window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
              }}
              className="bg-tier-nav-card rounded-lg border px-3 py-3 text-left transition-all"
              aria-pressed={active}
            >
              <span className="font-hs text-sm">{item.shortLabel}</span>
              <span className="mt-1 block text-[11px] leading-snug opacity-80">{item.description}</span>
            </button>
          );
        })}
      </div>

      <section key={`bg-tier-list-${activeList}`} className="bg-tier-index-panel rounded-lg border p-3 sm:p-4">
        <div className="flex flex-col gap-3 border-b border-[#bfdbfe]/70 pb-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="bg-tier-panel-heading">
            <h3 className="bg-tier-panel-title font-hs text-2xl">{activeMeta.label}</h3>
            <p className="bg-tier-panel-meta text-xs">
              {activeData?.source ? `Источник: ${activeData.source}` : 'Источник: BG Manacost'}
              {activeData?.fetchedAt ? ` · обновлено ${formatDate(activeData.fetchedAt)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeList === 'strategies' && (
              <div className="bg-tier-source-switch flex items-center gap-1 rounded-lg border p-1">
                {(['firestone', 'hsreplay'] as const).map(source => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => setStrategySource(source)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${strategySource === source ? BG_FILTER_ACTIVE_CLASS : BG_FILTER_IDLE_CLASS}`}
                  >
                    {source === 'firestone' ? 'Firestone' : 'HSReplay'}
                  </button>
                ))}
              </div>
            )}
            {activeData?.count !== undefined && (
              <div className="bg-tier-panel-count font-hs text-sm">Всего: {Number(activeData.count).toLocaleString('ru-RU')}</div>
            )}
          </div>
        </div>

        {loading && <div className="py-12 text-center font-hs text-[#6b4c2a]">Загружаем BG данные...</div>}
        {error && !loading && (
          <div className="my-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
        )}
        {!loading && !error && (
          <div className="mt-4 space-y-5">
            {activeList === 'minions' && (
              <div className="bg-tier-filter-panel rounded-lg border p-3 shadow-sm">
                <div className="flex flex-col gap-4">
                  <div className="min-w-0">
                    <h4 className="font-hs text-lg text-[#1e293b]">Фильтры существ</h4>
                    <p className="text-xs text-[#475569]">Тип существа и уровень таверны применяются без перезагрузки списка.</p>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
                    <div>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#334155]">Тип существа</p>
	                      <div className="bg-tier-filter-well flex max-w-full flex-wrap gap-1.5 rounded-lg border p-1.5">
                      {minionFilterOptions.races.map(race => (
                        <button
                          key={race}
                          type="button"
                          onClick={() => setMinionRaceFilter(race)}
	                          className={`flex h-12 min-w-12 items-center justify-center rounded-md border px-2 transition-colors ${minionRaceFilter === race ? BG_FILTER_ACTIVE_CLASS : BG_FILTER_IDLE_CLASS}`}
                          title={BG_RACE_NAMES[race] || race}
                        >
                          {BG_RACE_ICON[race] ? (
                            <img src={BG_RACE_ICON[race]} alt={BG_RACE_NAMES[race] || race} className="h-8 w-8 object-contain" loading="lazy" />
                          ) : (
                            <span className="text-xs font-bold">{race}</span>
                          )}
                        </button>
                      ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#334155]">Уровень таверны</p>
	                      <div className="bg-tier-filter-well flex flex-wrap gap-1.5 rounded-lg border p-1.5">
                      {minionFilterOptions.taverns.map(tavern => (
                        <button
                          key={tavern}
                          type="button"
                          onClick={() => setMinionTavernFilter(tavern)}
	                          className={`flex h-12 min-w-12 items-center justify-center rounded-md border px-2 text-xs font-bold transition-colors ${minionTavernFilter === tavern ? BG_FILTER_ACTIVE_CLASS : BG_FILTER_IDLE_CLASS}`}
                          title={tavern === 'ALL' ? 'Все уровни таверны' : `Уровень таверны ${tavern}`}
                        >
                          {tavern === 'ALL' ? 'Все' : (
                            <img src={bgTavernIcon(tavern)} alt={`Уровень таверны ${tavern}`} className="h-8 w-8 object-contain" loading="lazy" />
                          )}
                        </button>
                      ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeList === 'trinkets' && trinketFilterOptions.sizes.length > 1 && (
              <div className="bg-tier-filter-panel rounded-lg border p-3 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <h4 className="font-hs text-lg text-[#1e293b]">Фильтры аксессуаров</h4>
                    <p className="text-xs text-[#475569]">Переключение между малыми и большими аксессуарами без перезагрузки списка.</p>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#334155]">Размер аксессуара</p>
	                    <div className="bg-tier-filter-well flex max-w-full flex-wrap gap-1.5 rounded-lg border p-1.5">
                      {trinketFilterOptions.sizes.map(size => {
                        const label = size === 'ALL' ? 'Все' : size === 'SMALL' ? 'Малые' : 'Большие';
                        return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setTrinketSizeFilter(size)}
	                          className={`flex h-12 items-center justify-center rounded-md border px-4 text-sm font-bold transition-colors ${trinketSizeFilter === size ? BG_FILTER_ACTIVE_CLASS : BG_FILTER_IDLE_CLASS}`}
                          title={label}
                        >
                          {label}
                        </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {BG_TIER_ORDER.map(tier => {
              const items = Array.isArray(displayedTiers[tier]) ? displayedTiers[tier] : [];
              if (!items.length) return null;
              const visibleKey = bgVisibleLimitKey(activeList, tier);
              const visibleLimit = visibleLimits[visibleKey] ?? BG_TIER_INITIAL_VISIBLE[activeList];
              const visibleItems = items.slice(0, visibleLimit);
              const hiddenCount = Math.max(0, items.length - visibleItems.length);
              return (
                <section key={`${activeList}-${tier}`} className="bg-tier-rank-panel rounded-lg border p-3">
                  <div className="mb-3 flex items-center gap-3">
                    <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full border-2 text-lg font-hs shadow ${BG_TIER_BADGES[tier] || BG_TIER_BADGES.C}`}>{tier}</span>
                    <div>
                      <h4 className="font-hs text-lg text-[#3d2a1e]">Тир {tier}</h4>
                      <p className="text-xs text-[#8b6c42]">{tierCounts[tier] ?? items.length} позиций</p>
                    </div>
                  </div>
                  <div className={activeList === 'trinkets'
                    ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6'
                    : activeList === 'strategies'
                    ? 'grid gap-3 lg:grid-cols-2'
                    : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'}>
                    {visibleItems.map((item: any, idx: number) => (
                      <React.Fragment key={`${activeList}-${tier}-${item.id || item.key || item.name || idx}`}>
                        <MemoBattlegroundTierCard
                          item={item}
                          list={activeList}
                          tier={tier}
                          index={idx}
                          highlighted={activeList === 'strategies' && bgStrategyMatchesDeepLink(item, highlightStrategyKey, highlightStrategyTitle)}
                          onOpen={openLightbox}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                  {hiddenCount > 0 && (
                    <div className="mt-3 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setVisibleLimits(current => ({
                            ...current,
                            [visibleKey]: Math.min(items.length, visibleLimit + BG_TIER_VISIBLE_STEP[activeList]),
                          }));
                        }}
                        className="rounded-lg border border-[#d7b66a]/70 bg-[#fff3c4] px-4 py-2 text-sm font-black text-[#5a3a16] shadow-sm transition-colors hover:bg-[#ffe7a3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b58a2f]"
                      >
                        Показать еще {Math.min(hiddenCount, BG_TIER_VISIBLE_STEP[activeList]).toLocaleString('ru-RU')}
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </section>
      {currentLightboxItem && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="bg-lightbox-title">
          <button className="bg-tier-lightbox-backdrop absolute inset-0 bg-black/72 backdrop-blur-sm" type="button" aria-label="Закрыть" onClick={() => setLightboxIndex(-1)} />
          <div className="bg-tier-lightbox-frame relative grid max-h-[92vh] w-full max-w-4xl gap-4 overflow-y-auto rounded-lg border border-[#d7b66a]/70 bg-[#18100a] p-4 text-[#f8ead0] shadow-2xl md:grid-cols-[minmax(220px,340px)_1fr]">
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => setLightboxIndex(-1)}
              className="absolute right-3 top-3 z-10 rounded-full border border-[#d7b66a]/50 bg-[#2a1a0f] p-2 text-[#f8ead0] transition-colors hover:bg-[#4a2a13]"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="bg-tier-lightbox-art flex items-center justify-center">
              <img
                src={currentLightboxItem.image}
                alt={currentLightboxItem.title}
                className="max-h-[70vh] w-full max-w-[360px] object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)]"
              />
            </div>
            <div className="bg-tier-lightbox-copy flex min-w-0 flex-col justify-center pr-8">
              <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#d7b66a]">{currentLightboxItem.kicker}</p>
              <h3 id="bg-lightbox-title" className="mt-2 font-hs text-2xl leading-tight text-[#fff3c4] sm:text-3xl">{currentLightboxItem.title}</h3>
              {currentLightboxItem.meta && <p className="mt-3 text-sm font-semibold text-[#d9c287]">{currentLightboxItem.meta}</p>}
              {currentLightboxItem.text && <p className="mt-4 text-sm leading-relaxed text-[#f8ead0]/88">{currentLightboxItem.text}</p>}
              {currentLightboxItem.detailHref && (
                <a
                  href={currentLightboxItem.detailHref}
                  className="mt-5 inline-flex w-fit items-center justify-center rounded-lg border border-[#d7b66a]/70 bg-[#f2d27a] px-4 py-2.5 font-hs text-sm text-[#24160c] shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition-colors hover:bg-[#ffe29a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fff3c4]"
                >
                  Подробнее о существе
                </a>
              )}
              {lightboxItems.length > 1 && (
                <div className="mt-6 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(index => Math.max(0, index - 1))}
                    disabled={lightboxIndex <= 0}
                    className="rounded-md border border-[#d7b66a]/50 px-3 py-2 text-sm font-bold text-[#fff3c4] transition-colors hover:bg-[#3d2a1e] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Назад
                  </button>
                  <span className="text-xs text-[#d9c287]">{lightboxIndex + 1} / {lightboxItems.length}</span>
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(index => Math.min(lightboxItems.length - 1, index + 1))}
                    disabled={lightboxIndex >= lightboxItems.length - 1}
                    className="rounded-md border border-[#d7b66a]/50 px-3 py-2 text-sm font-bold text-[#fff3c4] transition-colors hover:bg-[#3d2a1e] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Вперед
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function BattlegroundHeroTierList({ onNavigate }: { onNavigate: (path: string) => void }) {
  const initialHeroesCache = BG_HEROES_CLIENT_CACHE.get('heroes');
  const [sections, setSections] = useState<BattlegroundHeroTierSection[]>(() => initialHeroesCache?.sections || []);
  const [sourceLabel, setSourceLabel] = useState(() => initialHeroesCache?.sourceLabel || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(() => !initialHeroesCache);
  const [error, setError] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    let alive = true;
    const cacheKey = 'heroes';
    const cached = BG_HEROES_CLIENT_CACHE.get(cacheKey);
    if (cached) {
      return () => { alive = false; };
    }

    setLoading(true);
    setError('');

    async function loadHeroes() {
      try {
        const apiPayload = await fetch('/api/bg/heroes')
          .then(async response => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload?.ok) throw new Error(payload?.error || 'API героев временно недоступен');
            return payload;
          });

        const apiSections = groupBgHeroesFromApi(apiPayload, {});
        if (!apiSections.length) throw new Error('API героев вернул пустой список');
        const nextSourceLabel = `HSReplay · обновлено ${formatDate(apiPayload.fetched_at)}`;
        BG_HEROES_CLIENT_CACHE.set(cacheKey, { sections: apiSections, sourceLabel: nextSourceLabel });
        if (!alive) return;
        setSections(apiSections);
        setSourceLabel(nextSourceLabel);
      } catch (apiError) {
        try {
          const response = await fetch('/bg-legacy/tier-data.js?v=heroes-20260626', { cache: 'no-store' });
          if (!response.ok) throw new Error('Не удалось загрузить резервный тир-лист героев');
          const text = await response.text();
          const parsed = parseLegacyHeroTierData(text);
          if (!parsed.length) throw new Error('В резервном тир-листе героев нет данных');
          BG_HEROES_CLIENT_CACHE.set(cacheKey, { sections: parsed, sourceLabel: 'Резервный локальный снапшот' });
          if (!alive) return;
          setSections(parsed);
          setSourceLabel('Резервный локальный снапшот');
        } catch (fallbackError: any) {
          if (alive) setError(fallbackError?.message || (apiError as Error)?.message || 'Не удалось загрузить тир-лист героев');
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadHeroes();
    return () => { alive = false; };
  }, []);

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
      <div className="text-center">
        <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8b6c42]">Поля сражений</p>
        <h2 className="mt-2 font-hs text-3xl text-[#3d2a1e] sm:text-4xl">Герои</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-[#6b4c2a]">
          Свежий тир-лист героев из HSReplay: портреты, среднее место и популярность без лишних окон.
        </p>
        {sourceLabel && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#8b6c42]">{sourceLabel}</p>}
      </div>

      <section className="bg-heroes-tools">
        <div className="bg-heroes-tools__legend">
          <div className="bg-heroes-tools__explanation">
            <p className="font-hs text-xs uppercase tracking-[0.16em] text-[#8b6c42]">Как читать рейтинг</p>
            <p className="mt-1 text-sm font-semibold text-[#6b4c2a]">Под портретом указаны среднее место и частота выбора героя.</p>
          </div>
          <div className="bg-heroes-tools__metrics" aria-label="Обозначения показателей">
            <span className="bg-heroes-metric bg-heroes-metric--placement"><strong>4,06</strong>Среднее место</span>
            <span className="bg-heroes-metric bg-heroes-metric--pickrate"><strong>23.05%</strong>Выбор героя</span>
          </div>
        </div>

        <label className="bg-heroes-search">
          <span className="sr-only">Поиск по героям</span>
          <Search className="h-5 w-5 shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={searchTerm}
            onChange={event => setSearchTerm(event.target.value)}
            placeholder="Найти героя, тир или силу героя"
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          />
          {searchTerm && <button type="button" onClick={() => setSearchTerm('')} className="bg-heroes-search__reset">Сбросить</button>}
          <span className="bg-heroes-search__count">
            {normalizedSearch ? `${visibleHeroes} / ${totalHeroes}` : `${totalHeroes}`} героев
          </span>
        </label>
      </section>

      {loading && <div className="py-12 text-center font-hs text-[#6b4c2a]">Загружаем героев...</div>}
      {error && !loading && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
      )}
      {!loading && !error && (
        <div className="space-y-5">
          {filteredSections.length === 0 && (
            <div className="rounded-2xl border border-[#d7b66a]/65 bg-[#fff9ed] p-6 text-center font-hs text-[#6b4c2a]">
              Герои не найдены
            </div>
          )}
          {filteredSections.map(section => {
            const heroes = Array.isArray(section.heroes) ? section.heroes : [];
            if (!heroes.length) return null;
            return (
              <section key={section.tier} className="rounded-lg border border-[#c4a46a]/35 bg-[#fff3d8]/65 p-3 sm:p-4">
                <div className="mb-3 flex items-center gap-3">
                  <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full border-2 text-lg font-hs shadow ${BG_TIER_BADGES[section.tier] || BG_TIER_BADGES.C}`}>
                    {section.tier}
                  </span>
                  <div>
                    <h3 className="font-hs text-lg text-[#3d2a1e]">{section.title || `Тир ${section.tier}`}</h3>
                    <p className="text-xs text-[#8b6c42]">{heroes.length} героев</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
                  {heroes.map(hero => (
                    <MemoBattlegroundHeroCard key={`${section.tier}-${hero.dbfId || hero.name}`} hero={hero} tier={section.tier} onNavigate={onNavigate} />
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
<main class="builder-layout bg-strategy-builder-legacy">
  <section class="builder-sidebar builder-sidebar-wide">
    <div class="builder-controls">
      <div class="filter-block comp-import-block">
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

      <label class="control-field">
        <span class="control-label">Поиск по картам (RU / EN)</span>
        <input id="builder-search" class="text-input" type="search" placeholder="Например, Морхи, murloc, deathrattle, tavern">
      </label>

      <details class="filter-block collapsible-filter" open>
        <summary class="filter-heading-row">
          <h3 class="filter-heading">Источник</h3>
          <span class="filter-toggle-marker" aria-hidden="true"></span>
        </summary>
        <div id="builder-source-filters" class="chip-row" aria-label="Фильтр по источнику"></div>
      </details>

      <details class="filter-block collapsible-filter" id="builder-race-block" open>
        <summary class="filter-heading-row">
          <h3 class="filter-heading">Тип существа</h3>
          <span class="filter-toggle-marker" aria-hidden="true"></span>
        </summary>
        <div id="builder-race-filters" class="chip-row" aria-label="Фильтр по типу существа"></div>
      </details>

      <details class="filter-block collapsible-filter" id="builder-level-block" open>
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

    <div class="library-toolbar-row">
      <div id="builder-status" class="library-status">Загружаю карты...</div>
      <label class="columns-control" for="builder-library-columns" title="Сколько карт в ряду в библиотеке">
        <span class="columns-control-label">В ряду: <b id="builder-library-columns-value">3</b></span>
        <input id="builder-library-columns" class="columns-range" type="range" min="2" max="5" step="1">
      </label>
    </div>
    <div id="builder-library" class="builder-library builder-library-dense" aria-live="polite"></div>
  </section>

  <section class="builder-canvas-panel builder-canvas-panel-compact">
    <div class="builder-canvas-head">
      <div class="builder-canvas-title">
        <p class="eyebrow">Board</p>
        <h2 class="panel-title">Полотно стратегии</h2>
      </div>
      <div id="builder-counter" class="filter-caption">0 карт на полотне</div>
    </div>

    <div class="board-toolbar">
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

    <div class="board-with-annotations">
      <div id="strategy-board" class="strategy-board strategy-board-compact">
        <div class="strategy-board-grid" aria-hidden="true"></div>
        <div class="strategy-board-hint">
          Перетащи сюда героев, существ и заклинания из библиотеки слева
        </div>
      </div>

      <aside id="annotation-panel" class="annotation-toolbar annotation-toolbar-vertical" aria-label="Аннотации">
        <span class="annotation-toolbar-label">Аннотации</span>
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
  </section>
</main>`;

const BG_STRATEGY_BUILDER_VERSION = '20260710-wide-workbench';
const BG_STRATEGY_BUILDER_CSS = `/bg-legacy/strategy-builder.gridfix2.css?v=${BG_STRATEGY_BUILDER_VERSION}`;
const BG_STRATEGY_BUILDER_JS = `/bg-legacy/strategy-builder.gridfix2.js?v=${BG_STRATEGY_BUILDER_VERSION}`;

type LegacyScriptOwner = 'strategy-builder' | 'tier-builder';

function loadLegacyScript(src: string, owner: LegacyScriptOwner): Promise<HTMLScriptElement> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.bgLegacyOwner = owner;
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    document.body.appendChild(script);
  });
}

function BattlegroundStrategyBuilderEmbed() {
  const mountId = useRef(`bg-strategy-builder-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = BG_STRATEGY_BUILDER_CSS;
    css.dataset.bgStrategyBuilder = 'true';
    document.head.appendChild(css);

    let cancelled = false;
    const loadedScripts: HTMLScriptElement[] = [];
    const version = BG_STRATEGY_BUILDER_VERSION;
    const scripts = [
      'https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.js',
      `/bg-legacy/shared.js?v=${version}`,
      `/bg-legacy/tier-data.js?v=${version}`,
      `/bg-legacy/accessories-data.js?v=${version}`,
      `/bg-legacy/comps-data.js?v=${version}`,
      BG_STRATEGY_BUILDER_JS,
    ];

    scripts.reduce(
      (chain, src) => chain.then(async () => {
        if (cancelled) return undefined;
        const script = await loadLegacyScript(src, 'strategy-builder');
        loadedScripts.push(script);
        return undefined;
      }),
      Promise.resolve<void>(undefined)
    ).catch(error => {
      console.error('Не удалось запустить конструктор стратегий.', error);
    });

    return () => {
      cancelled = true;
      css.remove();
      loadedScripts.forEach(script => script.remove());
      document.querySelectorAll<HTMLScriptElement>('script[data-bg-legacy-owner="strategy-builder"]').forEach(script => script.remove());
    };
  }, []);

  return (
    <div className="bg-builder-page">
      <div
        id={mountId.current}
        className="strategy-builder-page overflow-visible rounded-lg bg-[#07101f]/95"
        dangerouslySetInnerHTML={{ __html: BG_STRATEGY_BUILDER_HTML }}
      />
      </div>
  );
}

const BG_TIER_BUILDER_HTML = String.raw`
<main class="builder-layout bg-tier-builder-legacy">
  <section class="builder-sidebar builder-sidebar-wide">
    <div class="builder-controls">
      <label class="control-field">
        <span class="control-label">Поиск по картам (RU / EN)</span>
        <input id="tier-builder-search" class="text-input" type="search" placeholder="Например, мурлок, murloc, deathrattle, Тюремщик">
      </label>

      <details class="filter-block collapsible-filter" open>
        <summary class="filter-heading-row">
          <h3 class="filter-heading">Источник</h3>
          <span class="filter-toggle-marker" aria-hidden="true"></span>
        </summary>
        <div id="tier-builder-source-filters" class="chip-row" aria-label="Фильтр по источнику"></div>
      </details>

      <details class="filter-block collapsible-filter" id="tier-builder-race-block" open>
        <summary class="filter-heading-row">
          <h3 class="filter-heading">Тип существа</h3>
          <span class="filter-toggle-marker" aria-hidden="true"></span>
        </summary>
        <div id="tier-builder-race-filters" class="chip-row" aria-label="Фильтр по типу существа"></div>
      </details>

      <details class="filter-block collapsible-filter" id="tier-builder-level-block" open>
        <summary class="filter-heading-row">
          <h3 class="filter-heading">Уровень таверны</h3>
          <span class="filter-toggle-marker" aria-hidden="true"></span>
        </summary>
        <div id="tier-builder-level-filters" class="chip-row" aria-label="Фильтр по уровню таверны"></div>
      </details>

      <details class="filter-block collapsible-filter" id="tier-builder-accessory-block" hidden open>
        <summary class="filter-heading-row">
          <h3 class="filter-heading">Размер аксессуара</h3>
          <span class="filter-toggle-marker" aria-hidden="true"></span>
        </summary>
        <div id="tier-builder-accessory-filters" class="chip-row" aria-label="Фильтр по размеру аксессуара"></div>
      </details>

      <div class="hero-tier-toolbar">
        <button id="tier-builder-reset" class="secondary-button" type="button">Сбросить</button>
        <button id="tier-builder-unassigned" class="download-button" type="button">Все в пул</button>
      </div>
    </div>

    <div class="library-toolbar-row">
      <div id="tier-builder-summary" class="library-status hero-tier-summary">Загружаю библиотеку...</div>
      <label class="columns-control" for="tier-builder-library-columns" title="Сколько карт в ряду в библиотеке">
        <span class="columns-control-label">В ряду: <b id="tier-builder-library-columns-value">3</b></span>
        <input id="tier-builder-library-columns" class="columns-range" type="range" min="2" max="5" step="1">
      </label>
    </div>
    <div id="tier-builder-pool" class="hero-tier-pool" aria-live="polite"></div>
  </section>

  <section class="hero-tier-board">
    <div class="builder-canvas-head">
      <div>
        <p class="eyebrow">Drag and Drop</p>
        <h2 class="panel-title">Конструктор тир-листов</h2>
      </div>
      <div id="tier-builder-counter" class="filter-caption">0 карт распределено</div>
    </div>

    <div class="board-toolbar">
      <button id="tier-builder-download-all-png" class="download-button" type="button">Скачать всё PNG</button>
      <button id="tier-builder-download-all-webp" class="secondary-button" type="button">Скачать всё WebP</button>
      <div id="tier-builder-background-picker" class="background-picker" aria-label="Фон тир-листа"></div>
    </div>

    <div id="tier-builder-rows" class="tier-builder-rows"></div>
  </section>
</main>`;

function BattlegroundTierBuilderEmbed() {
  const mountId = useRef(`bg-tier-builder-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = BG_STRATEGY_BUILDER_CSS;
    css.dataset.bgTierBuilder = 'true';
    document.head.appendChild(css);

    let cancelled = false;
    const loadedScripts: HTMLScriptElement[] = [];
    const version = BG_STRATEGY_BUILDER_VERSION;
    const scripts = [
      'https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.js',
      'https://cdn.jsdelivr.net/npm/pica@9.0.1/dist/pica.min.js',
      `/bg-legacy/shared.js?v=${version}`,
      `/bg-legacy/tier-data.js?v=${version}`,
      `/bg-legacy/accessories-data.js?v=${version}`,
      `/bg-legacy/hero-tier-builder.js?v=${version}`,
    ];

    scripts.reduce(
      (chain, src) => chain.then(async () => {
        if (cancelled) return undefined;
        const script = await loadLegacyScript(src, 'tier-builder');
        loadedScripts.push(script);
        return undefined;
      }),
      Promise.resolve<void>(undefined)
    ).catch(error => {
      console.error('Не удалось запустить конструктор тир-листов.', error);
    });

    return () => {
      cancelled = true;
      css.remove();
      loadedScripts.forEach(script => script.remove());
      document.querySelectorAll<HTMLScriptElement>('script[data-bg-legacy-owner="tier-builder"]').forEach(script => script.remove());
    };
  }, []);

  return (
    <div
      id={mountId.current}
      className="bg-builder-page strategy-builder-page overflow-visible rounded-lg bg-[#07101f]/95"
      dangerouslySetInnerHTML={{ __html: BG_TIER_BUILDER_HTML }}
    />
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────



export { BattlegroundHeroesRoute, BattlegroundTierList, BattlegroundStrategyBuilderEmbed, BattlegroundTierBuilderEmbed };
