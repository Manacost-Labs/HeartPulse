import { optimizedBattlegroundThumbnailUrl } from './battlegroundImageUrls';
import type { BattlegroundTierListKey } from '../modules/battlegrounds/public';

// What one entry of a Battlegrounds tier list shows: its title, race, metric line, images and lightbox item.

export type BattlegroundLightboxItem = {
  key: string;
  title: string;
  image: string;
  kicker: string;
  meta: string;
  text?: string;
  detailHref?: string;
};

export const BG_RACE_NAMES: Record<string, string> = {
  ABERRATION: 'Аберрации',
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

export const BG_RACE_ICON: Record<string, string> = {
  ABERRATION: '/bg-legacy/assset/аберрации.webp',
  ALL: '/api/public-resource/bg/assset/%D0%BE%D0%B1%D1%89%D0%B5%D0%B5.webp',
  NONE: '/api/public-resource/bg/assset/%D0%BE%D0%B1%D1%89%D0%B5%D0%B5.webp',
  BEAST: '/api/public-resource/bg/assset/%D0%B7%D0%B2%D0%B5%D1%80%D1%8C.webp',
  DEMON: '/api/public-resource/bg/assset/%D0%B4%D0%B5%D0%BC%D0%BE%D0%BD%D1%8B.webp',
  DRAGON: '/api/public-resource/bg/assset/%D0%B4%D1%80%D0%B0%D0%BA%D0%BE%D0%BD%D1%8B.webp',
  ELEMENTAL: '/api/public-resource/bg/assset/%D1%8D%D0%BB%D0%B5%D0%BC%D0%B5%D0%BD%D1%82%D0%B0%D0%BB%D0%B8.webp',
  MECHANICAL: '/api/public-resource/bg/assset/%D0%BC%D0%B5%D1%85%D0%B0%D0%BD%D0%B8%D0%B7%D0%BC%D1%8B.webp',
  MURLOC: '/api/public-resource/bg/assset/%D0%BC%D1%83%D1%80%D0%BB%D0%BE%D0%BA%D0%B8.webp',
  NAGA: '/api/public-resource/bg/assset/%D0%BD%D0%B0%D0%B3%D0%B8.webp',
  PIRATE: '/api/public-resource/bg/assset/%D0%BF%D0%B8%D1%80%D0%B0%D1%82%D1%8B.webp',
  QUILBOAR: '/api/public-resource/bg/assset/%D1%81%D0%B2%D0%B8%D0%BD%D0%BE%D0%B1%D1%80%D0%B0%D0%B7%D1%8B.webp',
  UNDEAD: '/api/public-resource/bg/assset/%D0%BD%D0%B5%D0%B6%D0%B8%D1%82%D1%8C.webp',
};

export const BG_RACE_ORDER = ['ALL', 'NONE', 'ABERRATION', 'BEAST', 'DEMON', 'DRAGON', 'ELEMENTAL', 'MECHANICAL', 'MURLOC', 'NAGA', 'PIRATE', 'QUILBOAR', 'UNDEAD'];
const BG_TAVERN_ICON_BASE = '/api/public-resource/bg/assset';

export function bgItemTitle(item: any): string {
  return String(item?.ruName || item?.localizedName || item?.title || item?.name || item?.hero || item?.key || 'Без названия');
}

export function bgTavernIcon(tavern: string): string {
  return `${BG_TAVERN_ICON_BASE}/tier${encodeURIComponent(tavern)}.png`;
}

export function bgItemRaces(item: any): string[] {
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

export function bgRaceLabelForItem(item: any): string {
  const raceRu = String(item?.raceRu || '').trim();
  if (raceRu) return raceRu;
  const race = bgItemRaces(item).find(entry => entry && entry !== 'ALL' && entry !== 'NONE') || '';
  return BG_RACE_NAMES[race] || race;
}

export function bgDetailCardTooltipText(value: any): string {
  return String(value || '')
    .replace(/\s+EN:\s*[\s\S]*$/i, '')
    .replace(/\s+Механики:\s*[\s\S]*$/i, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** How many entries of a tier are shown at first, and how many more each «Показать ещё» adds. */
const BG_TIER_INITIAL_VISIBLE: Record<BattlegroundTierListKey, number> = {
  minions: 12,
  strategies: 6,
  spells: 8,
  trinkets: 6,
};
export const BG_TIER_VISIBLE_STEP: Record<BattlegroundTierListKey, number> = {
  minions: 24,
  strategies: 12,
  spells: 18,
  trinkets: 24,
};

/** Tier S of the strategies is shown whole: its builds lead the page and are named in its description. */
export const bgTierInitialVisible = (list: BattlegroundTierListKey, tier: string): number =>
  list === 'strategies' && tier === 'S' ? Number.POSITIVE_INFINITY : BG_TIER_INITIAL_VISIBLE[list];
/**
 * The page anchor of a build (a strategy), also the address the page's JSON-LD list points at. Every key the
 * projection accepts gets one: a character outside `[A-Za-z0-9_.-]` is written as `~<hex code>~` (so `foo#1` is
 * `build-foo~23~1`), which keeps anchors distinct and safe in an `id` and a URL fragment.
 */
export const bgBuildAnchor = (item: { key?: unknown }): string | undefined =>
  typeof item?.key === 'string' && item.key
    ? `build-${item.key.replace(/[^A-Za-z0-9_.-]/gu, char => `~${char.codePointAt(0)!.toString(16)}~`)}`
    : undefined;

export function bgNormalizeDeepLinkValue(value: unknown): string {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function bgMinionDetailHref(item: any): string {
  const dbfId = Number(item?.dbfId || item?.dbf || item?.dbf_id);
  if (!Number.isFinite(dbfId)) return '';
  const slug = bgNormalizeDeepLinkValue(bgItemTitle(item));
  return `/library/minions/${slug || 'minion'}-${dbfId}/`;
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

export function bgImageForItem(item: any, list: BattlegroundTierListKey): string {
  if (list === 'strategies') return '';
  return String(item?.image256 || item?.image || item?.imageFallback || '');
}

export function bgThumbnailForItem(item: any, list: BattlegroundTierListKey): string {
  const width = list === 'trinkets' ? 220 : 160;
  return optimizedBattlegroundThumbnailUrl(bgImageForItem(item, list), width);
}

export function bgLightboxItem(item: any, list: BattlegroundTierListKey, tier: string, index = 0): BattlegroundLightboxItem | null {
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

type BattlegroundStrategyPreviewGroup = {
  key: 'core' | 'addon';
  label: string;
  cards: any[];
};

export type BattlegroundStrategyPreviewEntry = {
  groupKey: 'core' | 'addon';
  groupLabel: string;
  card: any;
  thumb: string;
  lightbox: BattlegroundLightboxItem;
};

/** Same grouping as strategy card tiles — keep lightbox keys in sync with clicks. */
function bgStrategyPreviewGroups(item: any): BattlegroundStrategyPreviewGroup[] {
  const allCards = Array.isArray(item?.cards) ? item.cards : [];
  const coreCards = (
    Array.isArray(item?.coreCards)
      ? item.coreCards
      : allCards.filter((card: any) => String(card?.role || '').toUpperCase() === 'CORE')
  ).slice(0, 6);
  const additionalCards = (
    Array.isArray(item?.additionalCards)
      ? item.additionalCards
      : allCards.filter((card: any) => String(card?.role || '').toUpperCase() !== 'CORE')
  ).slice(0, 8);
  return [
    { key: 'core' as const, label: 'Ключевые', cards: coreCards },
    { key: 'addon' as const, label: 'Дополнительные', cards: additionalCards },
  ].filter((group) => group.cards.length > 0);
}

export function bgStrategyPreviewEntries(entry: any, tier: string): BattlegroundStrategyPreviewEntry[] {
  const strategyTitle = bgItemTitle(entry);
  const metric = bgMetricLine(entry, 'strategies');
  const strategyKey = entry?.key || entry?.title;
  const items: BattlegroundStrategyPreviewEntry[] = [];
  bgStrategyPreviewGroups(entry).forEach((group) => {
    group.cards.forEach((card: any, cardIdx: number) => {
      const thumb = card.frame || card.card || card.fallback || '';
      const cardImage = card.card || card.frame || card.fallback || '';
      if (!cardImage && !thumb) return;
      const rawText = String(card.ruText || card.text || '');
      items.push({
        groupKey: group.key,
        groupLabel: group.label,
        card,
        thumb: thumb || cardImage,
        lightbox: {
          key: `strategy-${tier}-${strategyKey}-${group.key}-${card.id || card.name}-${cardIdx}`,
          title: bgItemTitle(card),
          image: cardImage || thumb,
          kicker: `${tier}-тир · ${strategyTitle}`,
          meta: [group.label, metric].filter(Boolean).join(' · '),
          text: /[А-Яа-яЁё]/.test(rawText) ? rawText : '',
        },
      });
    });
  });
  return items;
}

export function bgStrategyLightboxItems(entry: any, tier: string): BattlegroundLightboxItem[] {
  return bgStrategyPreviewEntries(entry, tier).map((item) => item.lightbox);
}
