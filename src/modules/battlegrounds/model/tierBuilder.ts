/*
 * Card pool, filters and draft format of the Battlegrounds tier builder
 * (/battlegrounds/tier-builder/). The cards come from the same synchronized
 * sources the classic builder read; the draft stays in the browser under the
 * classic key, so a saved board survives the move to the VaryloUI tier list.
 */

export type TierBuilderSource = 'MINION' | 'SPELL' | 'ACCESSORY' | 'HERO';

export type TierBuilderCard = {
  id: string;
  name: string;
  englishName: string;
  slug: string;
  text: string;
  techLevel: number;
  races: string[];
  manaCost: number;
  source: TierBuilderSource;
  /** Full picture for spells, heroes and trinkets; minions use their art crop. */
  image: string;
  artUrl: string;
  heroTier?: string;
  accessorySize?: 'SMALL' | 'LARGE';
};

export type TierBuilderFilters = {
  search: string;
  source: 'ALL' | TierBuilderSource;
  race: string;
  level: string;
  accessorySize: 'ALL' | 'SMALL' | 'LARGE';
};

export const DEFAULT_TIER_BUILDER_FILTERS: TierBuilderFilters = { search: '', source: 'ALL', race: 'ALL', level: 'ALL', accessorySize: 'ALL' };

export const TIER_BUILDER_TIERS = [
  { id: 'S', label: 'S', color: 'red', description: 'Лучшее ядро' },
  { id: 'A', label: 'A', color: 'orange', description: 'Сильный тир' },
  { id: 'B', label: 'B', color: 'amber', description: 'Рабочий вариант' },
  { id: 'C', label: 'C', color: 'green', description: 'Ситуативно' },
  { id: 'D', label: 'D', color: 'gray', description: 'Слабый тир' },
] as const;

export const TIER_BUILDER_RACE_NAMES: Record<string, string> = {
  ALL: 'Все типы',
  NONE: 'Нейтральные',
  ABERRATION: 'Аберрации',
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

export const TIER_BUILDER_SOURCES: { value: TierBuilderFilters['source']; label: string }[] = [
  { value: 'ALL', label: 'Все карты' },
  { value: 'MINION', label: 'Существа' },
  { value: 'SPELL', label: 'Заклинания' },
  { value: 'ACCESSORY', label: 'Аксессуары' },
  { value: 'HERO', label: 'Герои' },
];

type Row = Record<string, unknown>;
type ResourceUrl = (url: string) => string;

const text = (value: unknown) => String(value ?? '');

/** Rule text without markup; entities other than the common five are kept as written. */
export function plainCardText(value: unknown): string {
  return text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

function slugify(value: unknown): string {
  return text(value).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/(^-|-$)/g, '');
}

/** Absolute URLs go through the public resource proxy; bare names are classic builder assets. */
export function tierBuilderAssetUrl(value: unknown, publicResourceUrl: ResourceUrl): string {
  const raw = text(value).trim();
  if (!raw) return '';
  if (/^https?:/i.test(raw)) return publicResourceUrl(raw);
  if (/^(data:|blob:|\/)/i.test(raw)) return raw;
  return `/bg-legacy/${raw.replace(/^\.\//, '')}`;
}

function englishNameFromImagePath(imagePath: unknown): string {
  const filename = text(imagePath).trim().split('/').pop() ?? '';
  const base = filename.replace(/\.[a-z0-9]+$/i, '');
  try {
    return decodeURIComponent(base).replace(/\s+/g, ' ').trim();
  } catch {
    return base.replace(/\s+/g, ' ').trim();
  }
}

/** The picture a tile and an export use: the art crop for minions, the full card otherwise. */
export function tierBuilderCardImage(card: TierBuilderCard, size: '256x' | '512x' = '256x'): string {
  if (card.source !== 'MINION') return card.image;
  return card.artUrl || `/api/card-art?id=${encodeURIComponent(card.id)}&locale=ruRU&size=${size}`;
}

export type TierBuilderSourcePayloads = {
  library: { cards?: unknown };
  spells: { cards?: unknown };
  englishNames: { cards?: unknown };
  heroTiers: unknown;
  accessories: { small?: unknown; large?: unknown };
};

const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((item): item is Row => !!item && typeof item === 'object') : [];

/** Every card of the builder in catalog order: minions, spells, trinkets, then heroes. */
export function buildTierBuilderCards(payloads: TierBuilderSourcePayloads, publicResourceUrl: ResourceUrl): TierBuilderCard[] {
  const asset = (value: unknown) => tierBuilderAssetUrl(value, publicResourceUrl);
  const english = new Map<string, Row>();
  for (const card of rows(payloads.englishNames.cards)) {
    if (card.id != null) english.set(text(card.id), card);
    if (card.slug) english.set(`slug:${text(card.slug)}`, card);
  }
  const englishOf = (card: Row) => english.get(text(card.dbfId)) ?? english.get(text(card.id))
    ?? (card.slug ? english.get(`slug:${text(card.slug)}`) : undefined);

  const minions = rows(payloads.library.cards).map((card): TierBuilderCard => {
    const en = englishOf(card);
    return {
      id: text(card.id), name: text(card.name), englishName: text(en?.name ?? card.englishName), slug: text(en?.slug),
      text: text(card.text), techLevel: Number(card.techLevel) || 0, races: Array.isArray(card.races) ? card.races.map(text) : [],
      manaCost: 0, source: 'MINION', image: '', artUrl: asset(card.artUrl),
    };
  });
  const spells = rows(payloads.spells.cards).map((card): TierBuilderCard => {
    const en = englishOf(card);
    return {
      id: `spell-${text(card.id)}`, name: text(card.name), englishName: text(en?.name), slug: text(en?.slug),
      text: plainCardText(card.text), techLevel: Number(card.tier) || 0, races: [], manaCost: Number(card.manaCost) || 0,
      source: 'SPELL', image: asset(card.image || card.cropImage || card.artUrl), artUrl: '',
    };
  });
  const accessories = [...rows(payloads.accessories.small), ...rows(payloads.accessories.large)].map((card): TierBuilderCard => ({
    id: text(card.id), name: text(card.name), englishName: text(card.englishName), slug: '', text: plainCardText(card.text),
    techLevel: 0, races: [], manaCost: 0, source: 'ACCESSORY', image: asset(card.image), artUrl: '',
    accessorySize: card.size === 'LARGE' ? 'LARGE' : 'SMALL',
  }));
  const heroes = rows(payloads.heroTiers).flatMap(section => rows(section.heroes).map((hero): TierBuilderCard => ({
    id: `hero-${slugify(hero.name)}`, name: text(hero.name), englishName: text(hero.englishName) || englishNameFromImagePath(hero.image),
    slug: '', text: '', techLevel: 0, races: [], manaCost: 0, source: 'HERO', image: asset(hero.image), artUrl: '',
    heroTier: text(section.tier),
  })));
  const seen = new Set<string>();
  return [...minions, ...spells, ...accessories, ...heroes].filter(card => card.id && card.name && !seen.has(card.id) && seen.add(card.id));
}

function searchText(card: TierBuilderCard): string {
  return [
    card.name, card.englishName, card.slug, card.text,
    card.source === 'SPELL' ? 'заклинание spell' : '',
    card.source === 'MINION' ? 'существо minion' : '',
    card.source === 'HERO' ? 'герой hero' : '',
    card.source === 'ACCESSORY' ? 'аксессуар accessory trinket' : '',
    card.accessorySize === 'SMALL' ? 'малый small' : '',
    card.accessorySize === 'LARGE' ? 'большой large' : '',
    card.races.join(' '), `таверна ${card.techLevel || ''}`, `мана ${card.manaCost || ''}`,
  ].join(' ').toLowerCase();
}

/** Classic pool filters: "Все карты" leaves heroes out; race, level and size apply only where they mean something. */
export function matchesTierBuilderFilters(card: TierBuilderCard, filters: TierBuilderFilters): boolean {
  const query = filters.search.trim().toLowerCase();
  if (query && !searchText(card).includes(query)) return false;
  if (filters.source === 'ALL' ? card.source === 'HERO' : card.source !== filters.source) return false;
  if (filters.race !== 'ALL' && (filters.source === 'ALL' || filters.source === 'MINION')) {
    if (card.source !== 'MINION' || !(card.races.length ? card.races : ['NONE']).includes(filters.race)) return false;
  }
  if (filters.level !== 'ALL' && card.source !== 'HERO' && card.source !== 'ACCESSORY' && String(card.techLevel || '') !== filters.level) return false;
  if (filters.accessorySize !== 'ALL' && card.source === 'ACCESSORY' && card.accessorySize !== filters.accessorySize) return false;
  return true;
}

/** Filters that do not apply to the chosen source fall back to "all", as the classic builder hid them. */
export function withTierBuilderSource(filters: TierBuilderFilters, source: TierBuilderFilters['source']): TierBuilderFilters {
  return {
    ...filters,
    source,
    race: source === 'ALL' || source === 'MINION' ? filters.race : 'ALL',
    level: source === 'HERO' || source === 'ACCESSORY' ? 'ALL' : filters.level,
    accessorySize: source === 'ACCESSORY' ? filters.accessorySize : 'ALL',
  };
}

export function tierBuilderCardMeta(card: TierBuilderCard): string {
  if (card.source === 'HERO') return card.heroTier ? `${card.heroTier}-тир героев` : 'Герой';
  if (card.source === 'SPELL') return `Таверна ${card.techLevel || '?'} · Мана ${card.manaCost}`;
  if (card.source === 'ACCESSORY') return card.accessorySize === 'LARGE' ? 'Большой аксессуар' : 'Малый аксессуар';
  return `Таверна ${card.techLevel || '?'} · ${TIER_BUILDER_RACE_NAMES[card.races[0] ?? 'NONE'] ?? 'Нейтральные'}`;
}
