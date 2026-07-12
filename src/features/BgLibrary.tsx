import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, ChevronDown, ExternalLink, Filter, Search } from 'lucide-react';
import '../route-parchment.css';
import '../battlegrounds-parchment.css';

type LibraryKind = 'minion' | 'spell' | 'anomaly' | 'quest' | 'darkmoon_prize' | 'reward' | 'trinket' | 'timewarped';
type PoolMode = 'current' | 'archive';
const BG_LIBRARY_API_VERSION = 'bg-library-20260704-2';

interface LibraryCard {
  id?: number;
  card_id: string;
  dbf: number;
  library?: { slug: string; name_ru: string };
  category?: { slug: string; name_ru: string };
  card_type: { slug: string; name_ru?: string; id?: number };
  name: { ru: string; en: string };
  tavern_tier: number | null;
  tier?: { value?: string | number | null; slug?: string | null; name_ru?: string | null } | string | number | null;
  creature_type?: { slug: string; name_ru: string } | null;
  minion_type?: string | null;
  race?: string | null;
  attack?: number | null;
  health?: number | null;
  in_pool?: boolean;
  pool_status?: string | null;
  duos_only?: boolean;
  mechanics?: Array<{ slug: string; name_ru: string }>;
  text?: { ru?: string | null; en?: string | null };
  text_ru?: string;
  images: { card?: string | null; golden?: string | null; art?: string | null; framed?: string | null; crop?: string | null };
  group?: { slug?: string | null; name_ru?: string | null };
  source?: string | null;
  wiki_page?: { title?: string | null; url?: string | null };
  wiki?: { page?: { title?: string | null; url?: string | null } };
  mana_cost?: number | null;
  cost?: number | null;
  artist?: string | null;
  golden?: { image?: string | null; card_id?: string | null; dbf?: number | null; text?: { ru?: string | null; en?: string | null } };
  asset_status?: {
    base_card_id?: string;
    local_card?: boolean;
    local_framed?: boolean;
    local_golden?: boolean;
    local_art?: boolean;
    golden_variant_tavern_tier?: number | null;
    golden_tier_mismatch?: boolean;
  };
  updated_at?: string;
}

interface LibraryMeta {
  creature_types?: Array<{ slug: string | null; name_ru: string | null }>;
  mechanics?: Array<{ slug: string; name_ru: string }>;
}

interface MinionStat {
  dbf_id: number;
  card_id: string;
  name: string;
  name_ru: string;
  tavern_tier: number;
  impact: number | null;
  combat_winrate: number | null;
  popularity: number | null;
  games_with_minion: number | null;
  games_without_minion: number | null;
  avg_placement_with: number | null;
  avg_placement_without: number | null;
}

interface MinionRoundStat {
  combat_round: number;
  games_with_minion: number;
  games_without_minion: number;
  avg_placement_with: number;
  avg_placement_without: number;
  impact: number;
  combat_winrate: number;
  wins: number;
  losses: number;
}

interface MinionDetail extends MinionStat {
  rounds?: MinionRoundStat[];
}

interface FirestoneSpellStat {
  id: string;
  card_id: string;
  dbfId: number;
  name: string;
  image_url?: string;
  tavern_tier: number;
  total_played: number;
  average_placement: number;
  average_placement_other: number;
  impact: number;
}

interface StrategyCard {
  id?: string;
  dbfId?: number | null;
  name?: string;
  ruName?: string;
  role?: string;
}

interface StrategyEntry {
  key: string;
  source: string;
  title: string;
  description?: string;
  tier?: string;
  difficulty?: string;
  avgPlacement?: string;
  cards?: StrategyCard[];
}

interface BgLibraryProps {
  currentPath: string;
  navigatePath: (path: string) => void;
}

const SITE_URL = 'https://arena.hs-manacost.ru';
const TAVERN_TIERS = [1, 2, 3, 4, 5, 6, 7];
const INITIAL_VISIBLE_CARDS = 96;
const MORE_VISIBLE_CARDS = 96;
const ARCHIVE_PAGE_SIZE = 72;

interface LibrarySectionConfig {
  id: string;
  kind: LibraryKind;
  activeHref: string;
  archiveHref: string;
  endpoint?: string;
  title: string;
  shortTitle: string;
  description: string;
  archiveDescription: string;
  icon: 'book' | 'archive' | 'sparkles';
  supportsArchive: boolean;
  accent: string;
}

const LIBRARY_SECTIONS: LibrarySectionConfig[] = [
  {
    id: 'current-minions',
    kind: 'minion',
    activeHref: '/library/minions',
    archiveHref: '/library/archive/minions',
    title: 'Существа в пуле',
    shortTitle: 'Существа',
    description: 'Все доступные сейчас существа с фильтрами, golden-версией и страницами статистики.',
    archiveDescription: 'Существа, которые раньше были в Полях сражений, но сейчас не входят в активный пул.',
    icon: 'book',
    supportsArchive: true,
    accent: '#3f7fba',
  },
  {
    id: 'current-spells',
    kind: 'spell',
    activeHref: '/library/spells',
    archiveHref: '/library/archive/spells',
    title: 'Заклинания в пуле',
    shortTitle: 'Заклинания',
    description: 'Текущие заклинания таверны: уровень, текст, impact и среднее место.',
    archiveDescription: 'Старые заклинания таверны вне активного пула, с карточками и поиском.',
    icon: 'sparkles',
    supportsArchive: true,
    accent: '#8a5fb8',
  },
  {
    id: 'anomalies',
    kind: 'anomaly',
    activeHref: '/library/anomalies',
    archiveHref: '/library/archive/anomalies',
    title: 'Аномалии',
    shortTitle: 'Аномалии',
    description: 'Активные аномалии Полей сражений с описанием эффекта и ссылкой на источник.',
    archiveDescription: 'Удаленные аномалии, которые больше не появляются в активном пуле.',
    icon: 'sparkles',
    supportsArchive: true,
    endpoint: 'anomaly',
    accent: '#7c3aed',
  },
  {
    id: 'quests',
    kind: 'quest',
    activeHref: '/library/quests',
    archiveHref: '/library/archive/quests',
    title: 'Квесты',
    shortTitle: 'Квесты',
    description: 'Активные задания квестов: условия выполнения и русские описания.',
    archiveDescription: 'Удаленные квесты из прошлых пулов Полей сражений.',
    icon: 'book',
    supportsArchive: true,
    endpoint: 'quest',
    accent: '#b7791f',
  },
  {
    id: 'rewards',
    kind: 'reward',
    activeHref: '/library/rewards',
    archiveHref: '/library/archive/rewards',
    title: 'Награды',
    shortTitle: 'Награды',
    description: 'Награды квестов с эффектами и официальными картами.',
    archiveDescription: 'Архив наград квестов, если источник отмечает их как удаленные.',
    icon: 'sparkles',
    supportsArchive: true,
    endpoint: 'reward',
    accent: '#2f855a',
  },
  {
    id: 'darkmoon-prizes',
    kind: 'darkmoon_prize',
    activeHref: '/library/darkmoon-prizes',
    archiveHref: '/library/archive/darkmoon-prizes',
    title: 'Призы Ярмарки Новолуния',
    shortTitle: 'Призы',
    description: 'Активные призы Ярмарки Новолуния с русскими текстами карт.',
    archiveDescription: 'Старые призы Ярмарки Новолуния вне активного пула.',
    icon: 'archive',
    supportsArchive: true,
    endpoint: 'darkmoon_prize',
    accent: '#be185d',
  },
  {
    id: 'trinkets',
    kind: 'trinket',
    activeHref: '/library/trinkets',
    archiveHref: '/library/archive/trinkets',
    title: 'Аксессуары',
    shortTitle: 'Аксессуары',
    description: 'Малые и большие аксессуары с группами, эффектами и карточками.',
    archiveDescription: 'Удаленные аксессуары из прошлых сезонов Полей сражений.',
    icon: 'sparkles',
    supportsArchive: true,
    endpoint: 'trinket',
    accent: '#c05621',
  },
  {
    id: 'timewarped',
    kind: 'timewarped',
    activeHref: '/library/timewarped',
    archiveHref: '/library/archive/timewarped',
    title: 'Хрономальные карты',
    shortTitle: 'Хрономальные',
    description: 'Отдельная библиотека Timewarped Tavern: существа, заклинания и силы героя.',
    archiveDescription: 'Источник пока не разделяет хрономальные карты на активные и архивные, поэтому показывается полный набор.',
    icon: 'archive',
    supportsArchive: false,
    endpoint: 'timewarped',
    accent: '#2563eb',
  },
];

const CARD_NAME_OVERRIDES: Record<string, string> = {
  'bacon blood gem': 'Кровавые самоцветы',
  'bacon pass tooltip': 'Передача карт',
  'bacon refresh': 'Обновление таверны',
};

const MECHANIC_LABEL_OVERRIDES: Record<string, string> = {
  bacon_fresh_tooltip: 'В следующих обновлениях',
  bacon_refresh_tooltip: 'В следующих обновлениях',
  bacon_blood_gem_tooltip: 'Кровавые самоцветы',
  immune: 'Неуязвимость',
};

const HIDDEN_MECHANIC_KEYS = new Set([
  'bacon_pass_tooltip',
  'secret',
]);

const RACE_ICON_BY_SLUG: Record<string, string> = {
  all: '/bg-legacy/assset/общее.webp',
  beast: '/bg-legacy/assset/зверь.webp',
  demon: '/bg-legacy/assset/демоны.webp',
  dragon: '/bg-legacy/assset/драконы.webp',
  elemental: '/bg-legacy/assset/элементали.webp',
  mech: '/bg-legacy/assset/механизмы.webp',
  murloc: '/bg-legacy/assset/мурлоки.webp',
  naga: '/bg-legacy/assset/наги.webp',
  pirate: '/bg-legacy/assset/пираты.webp',
  quilboar: '/bg-legacy/assset/свинобразы.webp',
  undead: '/bg-legacy/assset/нежить.webp',
};

function tavernIcon(tier: number | string): string {
  return `/bg-legacy/assset/tier${tier}.png`;
}

function isBaseLibraryKind(kind: LibraryKind): boolean {
  return kind === 'minion' || kind === 'spell';
}

function sectionFor(kind: LibraryKind): LibrarySectionConfig {
  return LIBRARY_SECTIONS.find(section => section.kind === kind) || LIBRARY_SECTIONS[0];
}

function sectionHref(kind: LibraryKind, pool: PoolMode): string {
  const section = sectionFor(kind);
  return pool === 'archive' ? section.archiveHref : section.activeHref;
}

function normalizeLibrarySlug(value: unknown): string {
  return String(value || '').toLowerCase().replace(/-/g, '_');
}

function libraryKindLabel(kind: LibraryKind): string {
  return sectionFor(kind).shortTitle;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload as T;
}

function versionedLibraryUrl(path: string, params: Record<string, string | number | boolean | null | undefined> = {}): string {
  const search = new URLSearchParams({ v: BG_LIBRARY_API_VERSION });
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) search.set(key, String(value));
  }
  return `${path}?${search.toString()}`;
}

function formatDecimal(value: unknown, digits = 2): string {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(digits).replace('.', ',');
}

function formatPercent(value: unknown, digits = 1): string {
  if (!Number.isFinite(Number(value))) return '—';
  return `${formatDecimal(value, digits)}%`;
}

function formatCount(value: unknown): string {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('ru-RU');
}

function cleanSearch(value: unknown): string {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').trim();
}

function mechanicKey(value: unknown): string {
  return cleanSearch(value)
    .replace(/[^a-zа-я0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function slugify(value: string): string {
  return cleanSearch(value)
    .replace(/['’]/g, '')
    .replace(/[^a-zа-я0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'card';
}

function cardSlug(card: LibraryCard): string {
  return `${slugify(cardRuName(card) || card.name?.en || card.card_id)}-${card.dbf}`;
}

function dbfFromPath(path: string): number | null {
  const match = decodeURIComponent(path).match(/-(\d+)\/?$/);
  return match ? Number(match[1]) : null;
}

function libraryRoute(path: string): { page: 'list' | 'detail'; kind: LibraryKind; pool: PoolMode; dbfId: number | null } {
  const normalized = path.replace(/\/+$/, '') || '/library';
  const pool: PoolMode = normalized.startsWith('/library/archive') ? 'archive' : 'current';
  const kind = (() => {
    const match = LIBRARY_SECTIONS.find(section => {
      const base = pool === 'archive' ? section.archiveHref : section.activeHref;
      return normalized === base || normalized.startsWith(`${base}/`);
    });
    return match?.kind || (normalized.includes('/spells') ? 'spell' : 'minion');
  })();
  const detailBase = `${sectionHref(kind, pool)}/`;
  const isDetail = normalized.startsWith(detailBase) && normalized.length > detailBase.length;
  return { page: isDetail ? 'detail' : 'list', kind, pool, dbfId: isDetail ? dbfFromPath(normalized) : null };
}

function cardLibraryKind(card: LibraryCard): LibraryKind {
  const librarySlug = normalizeLibrarySlug(card.library?.slug || card.category?.slug);
  if (librarySlug === 'darkmoon_prize') return 'darkmoon_prize';
  if (LIBRARY_SECTIONS.some(section => section.kind === librarySlug)) return librarySlug as LibraryKind;
  const typeSlug = String(card.card_type?.slug || '').toLowerCase();
  if (typeSlug === 'spell') return 'spell';
  return 'minion';
}

function cardPath(card: LibraryCard, pool: PoolMode): string {
  return `${sectionHref(cardLibraryKind(card), pool)}/${cardSlug(card)}`;
}

function cardRuName(card: LibraryCard): string {
  const keys = [card.name?.ru, card.name?.en, card.card_id].map(value => cleanSearch(String(value || '')));
  for (const key of keys) {
    if (CARD_NAME_OVERRIDES[key]) return CARD_NAME_OVERRIDES[key];
  }
  return card.name?.ru || card.name?.en || card.card_id;
}

function cardEnName(card: LibraryCard): string {
  return card.name?.en || card.card_id;
}

function cardRulesText(card: LibraryCard): string {
  return String(card.text?.ru || card.text_ru || card.text?.en || '')
    .replace(/\[x\]/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isArtOnlyImage(url?: string | null): boolean {
  return Boolean(url && (/\/uploads\/art\//.test(url) || /\/v1\/orig\//.test(url)));
}

function properImage(url?: string | null): string | null {
  return url && !isArtOnlyImage(url) ? url : null;
}

function localDbImageUrl(cardId: string, folder: 'cards' | 'framed' | 'golden' | 'art'): string {
  const ext = folder === 'art' ? 'jpg' : 'png';
  return `https://db.kolodahs.ru/uploads/${folder}/${encodeURIComponent(cardId)}.${ext}`;
}

function hearthstoneJsonBgCardUrl(cardId: string, size: '256x' | '512x' = '512x'): string {
  return `https://art.hearthstonejson.com/v1/bgs/latest/ruRU/${size}/${encodeURIComponent(cardId)}.png`;
}

function isLikelyGoldenCardId(cardId: string): boolean {
  return /_G($|t$)/.test(cardId);
}

function baseCardId(cardId: string): string {
  return cardId.replace(/_Gt$/, 't').replace(/_G$/, '');
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach(value => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result;
}

function cardImageCandidates(card: LibraryCard, includeArt = false): string[] {
  const id = card.card_id || '';
  const baseId = baseCardId(id);
  const isGoldenId = id && isLikelyGoldenCardId(id) && baseId !== id;
  const kind = cardLibraryKind(card);
  const baseFallbacks = isGoldenId
    ? [
        localDbImageUrl(baseId, 'cards'),
        localDbImageUrl(baseId, 'framed'),
        localDbImageUrl(baseId, 'golden'),
        hearthstoneJsonBgCardUrl(baseId),
      ]
    : [];
  const anomalyFallbacks = kind === 'anomaly'
    ? [
        hearthstoneJsonBgCardUrl(id),
        hearthstoneJsonBgCardUrl(id, '256x'),
        ...['t', 't2', 't3', 't4'].flatMap(suffix => [
          localDbImageUrl(`${id}${suffix}`, 'cards'),
          localDbImageUrl(`${id}${suffix}`, 'framed'),
        ]),
      ]
    : [];
  const cropFallback = kind === 'anomaly' ? null : card.images?.crop;
  return uniqueStrings([
    ...baseFallbacks,
    ...anomalyFallbacks,
    properImage(card.images?.card),
    properImage(card.images?.framed),
    properImage(card.images?.golden),
    includeArt ? card.images?.art : null,
    includeArt ? cropFallback : null,
  ]);
}

function primaryCardImage(card: LibraryCard): string | null {
  return cardImageCandidates(card, false)[0] || null;
}

function detailCardImage(card: LibraryCard): string | null {
  return cardImageCandidates(card, true)[0] || null;
}

function fallbackCardImages(card: LibraryCard, current: string, includeArt = false): string[] {
  return cardImageCandidates(card, includeArt).filter(candidate => candidate !== current);
}

function goldenCardImage(card: LibraryCard): string | null {
  const golden = properImage(card.images?.golden);
  return golden && golden !== primaryCardImage(card) ? golden : null;
}

function hasReliableGolden(card: LibraryCard): boolean {
  return Boolean(card.asset_status?.local_golden || properImage(card.images?.golden));
}

function isCompanionOrBuddy(card: LibraryCard): boolean {
  const cardId = card.card_id || '';
  const text = cleanSearch([cardId, card.name?.ru, card.name?.en, card.text_ru].filter(Boolean).join(' '));
  return /buddy|companion|компаньон|напарник|tb_baconshop_hero|_hero_.*buddy|hero_.*buddy/.test(text);
}

function isGeneratedArchiveToken(card: LibraryCard): boolean {
  const cardId = card.card_id || '';
  const text = cleanSearch([cardId, card.name?.ru, card.name?.en].filter(Boolean).join(' '));
  return (
    isLikelyGoldenCardId(cardId) ||
    /(^|_)BG34_Giant_/i.test(cardId) ||
    /(^|_)magicitem_/i.test(cardId) ||
    /^TB_BaconUps_/i.test(cardId) ||
    /_HERO_/i.test(cardId) ||
    /(^|_)HERO_/i.test(cardId) ||
    /(^|_)Bacon(BloodGem|Refresh|Pass|Tooltip)(_|$)/i.test(cardId) ||
    /\btimewarped\b|хрономальн/.test(text) ||
    /\bbacon blood gem\b|\bbacon pass tooltip\b|\bbacon refresh\b|кровавые самоцветы|передача карт|обновление таверны/.test(text) ||
    /(?:^|_)BG[^_]*_[A-Z0-9]+t\d*$/i.test(cardId) ||
    /(?:^|_)BGS?_[A-Z0-9]+t\d*$/i.test(cardId) ||
    /(?:^|_)TB_[A-Za-z0-9]+_[A-Za-z0-9]+t\d*$/i.test(cardId)
  );
}

function isArchiveDisplayCard(card: LibraryCard, kind: LibraryKind, pool: PoolMode): boolean {
  if (pool !== 'archive' || kind !== 'minion') return true;
  if (isCompanionOrBuddy(card)) return false;
  if (isGeneratedArchiveToken(card)) return false;
  return hasReliableGolden(card);
}

function hideBrokenTileImage(event: React.SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget;
  const fallbacks = (image.dataset.fallbacks || '').split('|').filter(Boolean);
  const index = Number(image.dataset.fallbackIndex || 0);
  const fallback = fallbacks[index];
  if (fallback) {
    image.dataset.fallbackIndex = String(index + 1);
    image.src = fallback;
    return;
  }
  const tile = image.closest('[data-library-card-tile]') as HTMLElement | null;
  if (tile) tile.style.display = 'none';
}

function hideBrokenImage(event: React.SyntheticEvent<HTMLImageElement>): void {
  event.currentTarget.style.display = 'none';
}

function fallbackBrokenHeroImage(event: React.SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget;
  const fallbacks = (image.dataset.fallbacks || '').split('|').filter(Boolean);
  const index = Number(image.dataset.fallbackIndex || 0);
  const fallback = fallbacks[index];
  if (fallback) {
    image.dataset.fallbackIndex = String(index + 1);
    image.src = fallback;
    return;
  }
  if (image.dataset.logoFallbackTried !== 'true') {
    image.dataset.logoFallbackTried = 'true';
    image.src = '/arena-logo-icon.webp?v=arena-legacy-20260629';
    return;
  }
  image.style.display = 'none';
}

function cardFamilyKey(card: LibraryCard): string {
  return [
    cardLibraryKind(card),
    card.card_type?.slug || '',
    cleanSearch(cardRuName(card) || card.name?.en || card.card_id),
    cleanSearch(card.name?.en || ''),
    card.tavern_tier || 'none',
    card.creature_type?.slug || card.group?.slug || 'none',
  ].join('|');
}

function cardQualityScore(card: LibraryCard): number {
  const cardId = cleanSearch(card.card_id || '');
  const isLikelyGolden = cardId.includes('_g') || cardId.includes('golden') || /_g$/.test(cardId);
  const statTotal = Number(card.attack || 0) + Number(card.health || 0);
  return (
    (card.in_pool ? 1000 : 0) +
    (primaryCardImage(card) ? 300 : 0) +
    (card.images?.card ? 60 : 0) +
    (goldenCardImage(card) ? 30 : 0) +
    (isLikelyGolden ? 0 : 25) -
    Math.max(0, statTotal) * 0.02
  );
}

function dedupeLibraryCards(cards: LibraryCard[]): LibraryCard[] {
  const byFamily = new Map<string, LibraryCard>();
  cards.forEach(card => {
    if (!card?.dbf) return;
    const key = cardFamilyKey(card);
    const current = byFamily.get(key);
    if (!current || cardQualityScore(card) > cardQualityScore(current)) {
      byFamily.set(key, card);
    }
  });
  return Array.from(byFamily.values());
}

async function fetchJsonOrNull<T>(url: string): Promise<T | null> {
  try {
    return await fetchJson<T>(url);
  } catch {
    return null;
  }
}

function normalizeMechanic(value: any): { slug: string; name_ru: string } | null {
  const label = typeof value === 'string'
    ? value
    : (value?.name_ru || value?.name_en || value?.slug || value?.name || '');
  if (!label) return null;
  const slug = String(typeof value === 'string' ? cleanSearch(label) : (value?.slug || cleanSearch(label)));
  const key = mechanicKey(slug || label);
  if (HIDDEN_MECHANIC_KEYS.has(key)) return null;
  return { slug, name_ru: MECHANIC_LABEL_OVERRIDES[key] || String(label) };
}

function normalizeMechanics(values: unknown): Array<{ slug: string; name_ru: string }> {
  if (!Array.isArray(values)) return [];
  const mechanics: Array<{ slug: string; name_ru: string }> = [];
  for (const value of values) {
    const mechanic = normalizeMechanic(value);
    if (mechanic) mechanics.push(mechanic);
  }
  return mechanics;
}

function normalizeAuxiliaryLibraryCard(item: any, kind: LibraryKind): LibraryCard {
  const library = item?.library || item?.category || { slug: kind, name_ru: sectionFor(kind).shortTitle };
  const group = item?.group || null;
  const textRu = item?.text_ru || item?.text?.ru || '';
  const minionType = item?.minion_type || item?.race || item?.creature_type?.name_ru || null;
  const rawTavernTier = item?.tavern_tier ?? item?.tavernTier ?? null;
  const tavernTier = rawTavernTier !== null && rawTavernTier !== undefined && rawTavernTier !== ''
    ? Number(rawTavernTier)
    : null;
  return {
    ...item,
    id: item?.id ?? item?.dbf ?? item?.card_id,
    dbf: Number(item?.dbf ?? item?.dbfId ?? 0),
    library,
    category: item?.category,
    card_type: item?.card_type || { slug: kind, name_ru: sectionFor(kind).shortTitle },
    name: {
      ru: item?.name?.ru || item?.localized_name || item?.name || item?.card_id,
      en: item?.name?.en || item?.name || item?.card_id,
    },
    tavern_tier: Number.isFinite(tavernTier) ? tavernTier : null,
    tier: item?.tier ?? item?.meta_tier ?? item?.rating_tier ?? null,
    creature_type: item?.creature_type || (minionType ? { slug: cleanSearch(String(minionType)), name_ru: String(minionType) } : null),
    minion_type: minionType,
    attack: item?.attack ?? null,
    health: item?.health ?? null,
    in_pool: Boolean(item?.in_pool ?? item?.pool_status === 'available'),
    duos_only: Boolean(item?.duos_only),
    mechanics: normalizeMechanics(item?.mechanics || item?.wiki?.wiki_mechanics_localized || []),
    text: item?.text,
    text_ru: textRu,
    images: {
      card: item?.images?.card || item?.image_url || item?.image || null,
      golden: item?.images?.golden || item?.golden?.image || null,
      art: item?.images?.art || item?.images?.crop || null,
      crop: item?.images?.crop || null,
      framed: item?.images?.framed || null,
    },
    group,
    source: item?.source || item?.wiki?.source || null,
    wiki_page: item?.wiki_page || item?.wiki?.page || null,
    mana_cost: item?.mana_cost ?? item?.cost ?? null,
    artist: item?.artist || null,
    golden: item?.golden,
  };
}

async function fetchAuxiliaryLibraryCards(kind: LibraryKind, pool: PoolMode, params: Record<string, string | number> = {}): Promise<LibraryCard[]> {
  const section = sectionFor(kind);
  if (!section.endpoint) return [];
  const baseParams = new URLSearchParams({
    v: BG_LIBRARY_API_VERSION,
    per_page: '200',
    page: '1',
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
  });
  if (section.supportsArchive) baseParams.set('in_pool', pool === 'current' ? '1' : '0');

  const fetchPage = async (page: number) => {
    const pageParams = new URLSearchParams(baseParams);
    pageParams.set('page', String(page));
    return fetchJson<{ data?: any[]; pagination?: { total?: number; page?: number; per_page?: number; pages?: number } }>(
      `/api/bg/library/extra/${section.endpoint}?${pageParams.toString()}`
    );
  };

  const first = await fetchPage(1);
  const data = Array.isArray(first.data) ? first.data : [];
  const total = Number(first.pagination?.total || data.length);
  const perPage = Number(first.pagination?.per_page || data.length || 200);
  const pages = Math.max(1, Number(first.pagination?.pages || Math.ceil(total / Math.max(1, perPage))));
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, index) => fetchPage(index + 2).catch(() => ({ data: [] })))
    );
    rest.forEach(page => data.push(...(Array.isArray(page.data) ? page.data : [])));
  }
  return data.map(item => normalizeAuxiliaryLibraryCard(item, kind)).filter(card => card.dbf || card.card_id);
}

function setLibraryMeta(title: string, description: string, slug: string, image?: string | null): void {
  document.title = title;
  const metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (metaDescription) metaDescription.content = description;
  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = title;
  const ogDesc = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
  if (ogDesc) ogDesc.content = description;
  const ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  if (ogUrl) ogUrl.content = `${SITE_URL}${slug}`;
  const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
  if (ogImage && image) ogImage.content = image;
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = `${SITE_URL}${slug}`;
}

function flattenSpellStats(payload: any): FirestoneSpellStat[] {
  const tiers = payload?.view?.tiers || {};
  return Object.values(tiers).flatMap((items: any) => Array.isArray(items) ? items : []) as FirestoneSpellStat[];
}

function parseStrategies(source: string): StrategyEntry[] {
  const match = source.match(/window\.compsStatic\s*=\s*([\s\S]*?);\s*$/);
  if (!match) return [];
  try {
    const payload = Function(`"use strict"; return (${match[1].replace(/;+\s*$/, '')});`)();
    return Array.isArray(payload?.comps) ? payload.comps : [];
  } catch {
    return [];
  }
}

function searchText(card: LibraryCard): string {
  return cleanSearch([
    card.name?.ru,
    card.name?.en,
    cardRuName(card),
    card.card_id,
    card.dbf,
    card.text_ru,
    card.text?.ru,
    card.text?.en,
    card.group?.name_ru,
    card.group?.slug,
    card.library?.name_ru,
    card.category?.name_ru,
    card.creature_type?.name_ru,
    card.creature_type?.slug,
    ...(card.mechanics || []).flatMap(mechanic => [mechanic.slug, mechanic.name_ru]),
  ].filter(Boolean).join(' '));
}

function cardGroupName(card: LibraryCard): string {
  return card.group?.name_ru || card.library?.name_ru || card.category?.name_ru || libraryKindLabel(cardLibraryKind(card));
}

function libraryTierValue(card: LibraryCard): string {
  const rawTier: any = card.tier;
  const value = typeof rawTier === 'object' && rawTier !== null
    ? (rawTier.value ?? rawTier.slug ?? rawTier.name_ru)
    : rawTier;
  return String(value ?? '').trim();
}

function libraryTierLabel(card: LibraryCard): string {
  const rawTier: any = card.tier;
  const label = typeof rawTier === 'object' && rawTier !== null
    ? (rawTier.name_ru ?? rawTier.value ?? rawTier.slug)
    : rawTier;
  const normalized = String(label ?? '').trim();
  if (!normalized) return 'Без тира';
  if (/^tier\s+/i.test(normalized)) return normalized.replace(/^tier/i, 'Тир');
  if (/^тир\s+/i.test(normalized)) return normalized;
  return `Тир ${normalized.toUpperCase()}`;
}

function libraryTierSortValue(card: LibraryCard): number {
  const value = libraryTierValue(card).toUpperCase();
  const order: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
  if (value in order) return order[value];
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return 99;
}

function libraryDisplayGroup(card: LibraryCard, kind: LibraryKind): { key: string; label: string; tavernTier?: number } {
  if (kind === 'darkmoon_prize') {
    const tierValue = libraryTierValue(card);
    return { key: `darkmoon-prize-tier-${tierValue || 'none'}`, label: libraryTierLabel(card) };
  }
  if (card.tavern_tier) {
    return { key: `tavern-${card.tavern_tier}`, label: `Таверна ${card.tavern_tier}`, tavernTier: card.tavern_tier };
  }
  if (card.group?.slug || card.group?.name_ru) {
    return { key: `group-${card.group?.slug || card.group?.name_ru}`, label: card.group?.name_ru || 'Группа' };
  }
  return { key: `kind-${kind}`, label: libraryKindLabel(kind) };
}

function containsSearchText(value: string, needle: string): boolean {
  return value.includes(needle);
}

function cardMatchesStrategy(card: LibraryCard, strategy: StrategyEntry): boolean {
  return (strategy.cards || []).some(item => {
    if (Number(item.dbfId) === Number(card.dbf)) return true;
    if (item.id && item.id === card.card_id) return true;
    return false;
  });
}

function strategySourceParam(strategy: StrategyEntry): string {
  return cleanSearch(strategy.source).includes('hsreplay') ? 'hsreplay' : 'firestone';
}

function strategyTierListPath(strategy: StrategyEntry): string {
  const params = new URLSearchParams({
    list: 'strategies',
    source: strategySourceParam(strategy),
    strategy: strategy.key,
  });
  if (strategy.title) params.set('q', strategy.title);
  return `/battlegrounds/tier-list?${params.toString()}#strategy`;
}

function metricTone(value: unknown): string {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 'text-[#826b49]';
  if (numberValue > 0.4) return 'text-[#2f7a3e]';
  if (numberValue > 0) return 'text-[#8a651f]';
  return 'text-[#a33a3a]';
}

function useLibraryData(kind: LibraryKind, pool: PoolMode) {
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [meta, setMeta] = useState<LibraryMeta>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const inPool = pool === 'current' ? '1' : '0';
    const metaRequest = isBaseLibraryKind(kind) ? fetchJson<LibraryMeta>(versionedLibraryUrl('/api/bg/library/meta')) : Promise.resolve({});
    const cardsRequest = isBaseLibraryKind(kind)
      ? fetchJson<{ data: LibraryCard[] }>(versionedLibraryUrl('/api/bg/library/cards', { card_type: kind, in_pool: inPool })).then(result => result.data || [])
      : fetchAuxiliaryLibraryCards(kind, pool);

    Promise.all([metaRequest, cardsRequest])
      .then(results => {
        if (!alive) return;
        const rawMeta = results[0] as LibraryMeta;
        const normalizedCards: LibraryCard[] = [];
        for (const card of results[1] as LibraryCard[]) {
          if (card?.dbf || card?.card_id) {
            normalizedCards.push({ ...card, mechanics: normalizeMechanics(card.mechanics) });
          }
        }
        setMeta({ ...rawMeta, mechanics: normalizeMechanics(rawMeta.mechanics) });
        setCards(dedupeLibraryCards(normalizedCards));
      })
      .catch(errorValue => {
        if (alive) setError(errorValue?.message || 'Не удалось загрузить библиотеку');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, [kind, pool]);

  return { cards, meta, loading, error };
}

function MetricCard({ label, value, caption, tone }: { label: string; value: string; caption?: string; tone?: string }) {
  return (
    <div className="bg-library-metric-card min-w-0 rounded-md border border-[#cbd9ed] bg-[#f8fbff] px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#60718a]">{label}</p>
      <p className={`mt-1 min-w-0 font-hs text-2xl ${tone || 'text-[#7c5b24]'}`}>{value}</p>
      {caption && <p className="mt-1 text-xs text-[#657893]">{caption}</p>}
    </div>
  );
}

function MiniChart({ points, color = '#f1d47b', unit = '', invert = false }: { points: Array<{ x: string | number; y: number }>; color?: string; unit?: string; invert?: boolean }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const clean = points.filter(point => Number.isFinite(Number(point.y)));
  if (clean.length < 2) return <div className="flex h-44 items-center justify-center text-sm text-[#657893]">Недостаточно точек для графика</div>;
  const width = 560;
  const height = 190;
  const padX = 34;
  const padY = 24;
  const values = clean.map(point => Number(point.y));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xFor = (index: number) => padX + (index / Math.max(1, clean.length - 1)) * (width - padX * 2);
  const yFor = (value: number) => {
    const normalized = (value - min) / range;
    const plotted = invert ? normalized : 1 - normalized;
    return padY + plotted * (height - padY * 2);
  };
  const path = clean.map((point, index) => `${index === 0 ? 'M' : 'L'}${xFor(index).toFixed(1)} ${yFor(Number(point.y)).toFixed(1)}`).join(' ');
  const last = clean[clean.length - 1];
  const active = clean[activeIndex ?? clean.length - 1];
  const activeSafeIndex = Math.max(0, activeIndex ?? clean.length - 1);
  const activeX = xFor(activeSafeIndex);
  const activeY = yFor(Number(active.y));
  const activeValue = `${formatDecimal(active.y, unit === '%' ? 1 : 2)}${unit}`;
  const moveActivePoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const ratio = position / Math.max(1, rect.width);
    const index = Math.round(ratio * (clean.length - 1));
    setActiveIndex(Math.min(clean.length - 1, Math.max(0, index)));
  };
  return (
    <div className="relative overflow-hidden rounded-md border border-[#d3deef] bg-[#fbfdff]">
      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-md border border-[#cbd9ed] bg-white/95 px-3 py-2 text-sm shadow-sm">
        <p className="font-semibold text-[#26374f]">Ход: {String(active.x).slice(0, 10)}</p>
        <p className="mt-1 text-[#657893]"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{activeValue}</p>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        className="h-48 w-full touch-none cursor-crosshair"
        onPointerMove={moveActivePoint}
        onPointerLeave={() => setActiveIndex(null)}
        onPointerDown={moveActivePoint}
      >
        {[0, 1, 2, 3].map(line => {
          const y = padY + (line / 3) * (height - padY * 2);
          return <line key={line} x1={padX} x2={width - padX} y1={y} y2={y} stroke="rgba(89,103,126,0.18)" />;
        })}
        <line x1={activeX} x2={activeX} y1={padY} y2={height - padY} stroke="rgba(38,55,79,0.24)" strokeDasharray="4 6" />
        <path d={path} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {clean.map((point, index) => (
          <circle key={`${point.x}-${index}`} cx={xFor(index)} cy={yFor(Number(point.y))} r="4" fill={color} stroke="#fbfdff" strokeWidth="2" />
        ))}
        <circle cx={activeX} cy={activeY} r="7" fill={color} stroke="#26374f" strokeWidth="2" />
        <text x={padX} y={height - 6} fill="#657893" fontSize="13">{String(clean[0].x).slice(0, 10)}</text>
        <text x={width - padX} y={height - 6} textAnchor="end" fill="#657893" fontSize="13">{String(last.x).slice(0, 10)}</text>
        <text x={width - padX} y={padY - 7} textAnchor="end" fill="#26374f" fontSize="14">{formatDecimal(last.y, unit === '%' ? 1 : 2)}{unit}</text>
      </svg>
    </div>
  );
}

function FilterChip({ active, children, onClick, title }: { key?: React.Key; active: boolean; children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      data-active={active ? 'true' : 'false'}
      className={`bg-library-filter-chip flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
        active
          ? 'border-[#e4c675] bg-[#e4c675] text-[#101827] shadow-sm'
          : 'border-[#cbd9ed] bg-[#ffffff] text-[#34445c] hover:border-[#d3af55] hover:text-[#6d4f1c]'
      }`}
    >
      {children}
    </button>
  );
}

function LibrarySectionSwitcher({
  kind,
  pool,
  navigatePath,
  totalCards,
  filteredCards,
}: {
  kind: LibraryKind;
  pool: PoolMode;
  navigatePath: (path: string) => void;
  totalCards: number;
  filteredCards: number;
}) {
  const activeSection = sectionFor(kind);
  const activePoolLabel = pool === 'archive' ? 'Архив' : 'Актуальный пул';
  const navigateTo = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    navigatePath(href);
  };

  return (
    <section className="bg-library-directory rounded-lg border border-[#cbd9ed] bg-[#f3f7fe] p-4 shadow-sm sm:p-5">
      <div className="bg-library-directory-head mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8a651f]">Разделы библиотеки</p>
          <h2 className="mt-1 font-hs text-2xl text-[#26374f]">{activeSection.shortTitle} · {activePoolLabel}</h2>
        </div>
        <div className="bg-library-result-count rounded-md border border-[#d6e1f1] bg-white px-3 py-2 text-sm font-semibold text-[#5e708a]">
          {filteredCards.toLocaleString('ru-RU')} найдено · {totalCards.toLocaleString('ru-RU')} загружено
        </div>
      </div>

      <div className="bg-library-directory-grid grid gap-3 lg:grid-cols-[minmax(260px,0.75fr)_1fr]">
        <div className="bg-library-nav-group rounded-md border border-[#d6e1f1] bg-white p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#60718a]">Состояние пула</p>
          <div className="flex flex-wrap gap-2">
            {(['current', 'archive'] as PoolMode[]).map(nextPool => {
              const active = nextPool === pool;
              const href = sectionHref(kind, nextPool);
              const disabled = nextPool === 'archive' && !sectionFor(kind).supportsArchive;
              return (
                <a
                  key={nextPool}
                  href={href}
                  onClick={(event) => {
                    if (disabled) event.preventDefault();
                    else navigateTo(event, href);
                  }}
                  aria-disabled={disabled ? 'true' : undefined}
                  data-active={active ? 'true' : 'false'}
                  className={`rounded-md border px-4 py-2 font-hs text-sm ${
                    disabled
                      ? 'cursor-not-allowed border-[#d6e1f1] bg-[#eef4fd] text-[#8b9ab0]'
                      : active ? 'border-[#e4c675] bg-[#e4c675] text-[#101827]' : 'border-[#cbd9ed] bg-[#ffffff] text-[#33445d]'
                  }`}
                  style={{ textDecoration: 'none' }}
                >
                  {nextPool === 'current' ? 'Актуальный пул' : 'Архив'}
                </a>
              );
            })}
          </div>
        </div>

        <div className="bg-library-nav-group rounded-md border border-[#d6e1f1] bg-white p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#60718a]">Тип данных</p>
          <div className="flex max-h-none flex-wrap gap-2 overflow-auto pr-1 sm:max-h-28">
            {LIBRARY_SECTIONS.map(section => {
              const nextKind = section.kind;
              const active = nextKind === kind;
              const href = sectionHref(nextKind, pool);
              return (
                <a
                  key={nextKind}
                  href={href}
                  onClick={(event) => navigateTo(event, href)}
                  data-active={active ? 'true' : 'false'}
                  className={`rounded-md border px-4 py-2 font-hs text-sm ${
                    active ? 'border-[#e4c675] bg-[#e4c675] text-[#101827]' : 'border-[#cbd9ed] bg-[#ffffff] text-[#33445d]'
                  }`}
                  style={{ textDecoration: 'none' }}
                >
                  {section.shortTitle}
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function LibraryCardTile({
  card,
  pool,
  navigatePath,
}: {
  key?: React.Key;
  card: LibraryCard;
  pool: PoolMode;
  navigatePath: (path: string) => void;
}) {
  const href = cardPath(card, pool);
  const image = primaryCardImage(card) || '/arena-logo-icon.webp?v=arena-legacy-20260629';
  const fallbacks = fallbackCardImages(card, image, false);
  const golden = goldenCardImage(card);
  const cardKind = cardLibraryKind(card);
  return (
    <a
      href={href}
      onClick={(event) => { event.preventDefault(); navigatePath(href); }}
      data-library-card-tile
      className="group relative block overflow-visible rounded-md p-1 text-center transition-transform hover:-translate-y-1"
      style={{ textDecoration: 'none' }}
    >
      <div className="relative mx-auto aspect-[0.72] w-full max-w-[240px]">
        <img
          src={image}
          alt={cardRuName(card)}
          className="relative z-10 h-full w-full object-contain drop-shadow-[0_16px_20px_rgba(21,31,47,0.22)] transition duration-200 group-hover:scale-[1.03] sm:group-hover:-translate-x-5"
          loading="lazy"
          data-fallbacks={fallbacks.join('|') || undefined}
          onError={hideBrokenTileImage}
        />
        {golden && (
          <img
            src={golden}
            alt={`${cardRuName(card)}, золотая версия`}
            className="pointer-events-none absolute inset-0 z-20 h-full w-full translate-x-2 object-contain opacity-0 drop-shadow-[0_20px_26px_rgba(21,31,47,0.28)] transition duration-200 group-hover:translate-x-8 group-hover:opacity-100 sm:group-hover:translate-x-12"
            loading="lazy"
            onError={hideBrokenImage}
          />
        )}
      </div>
      <div className="mx-auto mt-2 max-w-[220px] rounded-md border border-[#d6e1f1] bg-white/85 px-2 py-2 opacity-95 transition-colors group-hover:border-[#d3af55]">
        <p className="line-clamp-2 font-hs text-sm leading-tight text-[#26374f]">{cardRuName(card)}</p>
        <div className="mt-1 flex flex-wrap justify-center gap-1">
          {cardKind === 'darkmoon_prize' && libraryTierValue(card) && <span className="rounded bg-[#f3e8ff] px-1.5 py-0.5 text-[11px] font-bold text-[#6d28d9]">{libraryTierLabel(card)}</span>}
          {card.tavern_tier && cardKind !== 'minion' && <span className="rounded bg-[#fff3c4] px-1.5 py-0.5 text-[11px] font-bold text-[#7c5b24]">Т{card.tavern_tier}</span>}
          {!isBaseLibraryKind(cardKind) && <span className="rounded bg-[#eef4fd] px-1.5 py-0.5 text-[11px] font-bold text-[#4f6685]">{libraryKindLabel(cardKind)}</span>}
          {card.group?.name_ru && <span className="max-w-full truncate rounded bg-[#f6ead0] px-1.5 py-0.5 text-[11px] font-bold text-[#7c5b24]">{card.group.name_ru}</span>}
        </div>
      </div>
      <span className="sr-only">Открыть страницу карты {cardRuName(card)}</span>
    </a>
  );
}

function ChartPanel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[#cbd9ed] bg-[#f8fbff] p-4">
      <h3 className="font-hs text-xl text-[#26374f]">{title}</h3>
      {subtitle && <p className="mb-3 mt-1 text-sm text-[#657893]">{subtitle}</p>}
      {children}
    </div>
  );
}

function LibraryListPage({ kind, pool, navigatePath }: { kind: LibraryKind; pool: PoolMode; navigatePath: (path: string) => void }) {
  const { cards, meta, loading, error } = useLibraryData(kind, pool);
  const [query, setQuery] = useState('');
  const [tavernFilters, setTavernFilters] = useState<string[]>([]);
  const [raceFilters, setRaceFilters] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState('ALL');
  const [mechanic, setMechanic] = useState('ALL');
  const [includeDuos, setIncludeDuos] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_CARDS);
  const [archivePage, setArchivePage] = useState(1);

  useEffect(() => {
    const section = sectionFor(kind);
    const kindLabel = kind === 'spell' ? 'заклинаний' : 'существ';
    const title = isBaseLibraryKind(kind)
      ? (pool === 'archive'
        ? `Архив ${kindLabel} Полей сражений — BG Hearthstone | HS-Manacost`
        : `${kind === 'spell' ? 'Заклинания' : 'Существа'} Полей сражений — библиотека BG Hearthstone | HS-Manacost`)
      : `${pool === 'archive' ? 'Архив · ' : ''}${section.title} Полей сражений — BG Hearthstone | HS-Manacost`;
    const description = pool === 'archive' ? section.archiveDescription : section.description;
    setLibraryMeta(title, description, sectionHref(kind, pool));
  }, [kind, pool]);

  useEffect(() => {
    setTavernFilters([]);
    setRaceFilters([]);
    setGroupFilter('ALL');
    setMechanic('ALL');
    setIncludeDuos(false);
  }, [kind, pool]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_CARDS);
    setArchivePage(1);
  }, [query, tavernFilters, raceFilters, groupFilter, mechanic, includeDuos, kind, pool]);

  const hiddenArchiveMinions = useMemo(
    () => pool === 'archive' && kind === 'minion'
      ? cards.filter(card => !isArchiveDisplayCard(card, kind, pool)).length
      : 0,
    [cards, kind, pool]
  );

  const creatureTypes = useMemo(() => {
    const seen = new Map<string, string>();
    (meta.creature_types || []).forEach(item => {
      if (item.slug && item.name_ru) seen.set(item.slug, item.name_ru);
    });
    cards.forEach(card => {
      if (card.creature_type?.slug && card.creature_type?.name_ru) seen.set(card.creature_type.slug, card.creature_type.name_ru);
    });
    return Array.from(seen.entries()).filter(([slug]) => slug !== 'all');
  }, [cards, meta.creature_types]);

  const mechanics = useMemo(() => {
    const seen = new Map<string, string>();
    (meta.mechanics || []).forEach(item => seen.set(item.slug, item.name_ru));
    cards.forEach(card => (card.mechanics || []).forEach(item => seen.set(item.slug, item.name_ru)));
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [cards, meta.mechanics]);

  const cardGroups = useMemo(() => {
    const seen = new Map<string, string>();
    cards.forEach(card => {
      const slug = card.group?.slug || card.group?.name_ru;
      const label = card.group?.name_ru || card.group?.slug;
      if (slug && label) seen.set(String(slug), String(label));
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [cards]);

  const filtered = useMemo(() => {
    const needle = cleanSearch(query);
    const rows: LibraryCard[] = [];
    const tavernSet = new Set(tavernFilters);
    const raceSet = new Set(raceFilters);
    for (const card of cards) {
      if (!isArchiveDisplayCard(card, kind, pool)) continue;
      if (needle && !containsSearchText(searchText(card), needle)) continue;
      if (!includeDuos && card.duos_only) continue;
      if (tavernSet.size > 0 && !tavernSet.has(String(card.tavern_tier || ''))) continue;
      if (kind === 'minion' && raceSet.size > 0 && !raceSet.has(card.creature_type?.slug || '')) continue;
      if (groupFilter !== 'ALL' && String(card.group?.slug || card.group?.name_ru || '') !== groupFilter) continue;
      if (mechanic !== 'ALL' && !(card.mechanics || []).some(item => item.slug === mechanic)) continue;
      rows.push(card);
    }
    return rows.sort((a, b) => {
      if (kind === 'darkmoon_prize') {
        return libraryTierSortValue(a) - libraryTierSortValue(b) || cardRuName(a).localeCompare(cardRuName(b), 'ru');
      }
      return Number(a.tavern_tier || 99) - Number(b.tavern_tier || 99) || cardRuName(a).localeCompare(cardRuName(b), 'ru');
    });
  }, [cards, groupFilter, includeDuos, kind, mechanic, pool, query, raceFilters, tavernFilters]);

  const archivePageCount = Math.max(1, Math.ceil(filtered.length / ARCHIVE_PAGE_SIZE));
  const normalizedArchivePage = Math.min(archivePage, archivePageCount);
  const archiveStart = (normalizedArchivePage - 1) * ARCHIVE_PAGE_SIZE;
  const visible = pool === 'archive'
    ? filtered.slice(archiveStart, archiveStart + ARCHIVE_PAGE_SIZE)
    : filtered.slice(0, visibleCount);
  const grouped = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; tavernTier?: number; items: LibraryCard[] }>();
    visible.forEach(card => {
      const group = libraryDisplayGroup(card, kind);
      if (!groups.has(group.key)) groups.set(group.key, { ...group, items: [] });
      groups.get(group.key)!.items.push(card);
    });
    return Array.from(groups.values());
  }, [kind, visible]);

  const activeSection = sectionFor(kind);
  const kindTitle = activeSection.shortTitle;
  const poolTitle = pool === 'archive' ? 'Архив' : 'Актуальный пул';
  const toggleTavern = (tier: string) => {
    setTavernFilters(current => current.includes(tier) ? current.filter(item => item !== tier) : [...current, tier]);
  };
  const toggleRace = (slug: string) => {
    setRaceFilters(current => current.includes(slug) ? current.filter(item => item !== slug) : [...current, slug]);
  };
  const archivePages = useMemo(() => {
    const pages = new Set<number>([1, archivePageCount, normalizedArchivePage]);
    for (let page = normalizedArchivePage - 2; page <= normalizedArchivePage + 2; page += 1) {
      if (page >= 1 && page <= archivePageCount) pages.add(page);
    }
    return Array.from(pages).sort((a, b) => a - b);
  }, [archivePageCount, normalizedArchivePage]);

  return (
    <div className="bg-library-page space-y-6 text-[#26374f]">
      <section className="rounded-lg border border-[#cbd9ed] bg-[#f8fbff] p-4 shadow-[0_16px_38px_rgba(68,88,122,0.14)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8a651f]">Battlegrounds</p>
            <h1 className="mt-2 font-hs text-3xl text-[#23314a] sm:text-4xl">Библиотека Полей Сражений</h1>
            <p className="mt-2 max-w-3xl text-sm text-[#5e708a]">
              {pool === 'archive' ? activeSection.archiveDescription : activeSection.description}
            </p>
          </div>
          <div className="rounded-md border border-[#d6e1f1] bg-white px-4 py-3 text-sm text-[#5e708a]">
            <span className="font-hs text-[#8a651f]">{pool === 'archive' ? 'Архив' : 'Актуальный пул'}</span>
            <span className="mx-2 text-[#a4b1c3]">·</span>
            <span>{activeSection.shortTitle}</span>
          </div>
        </div>
      </section>

      <LibrarySectionSwitcher
        kind={kind}
        pool={pool}
        navigatePath={navigatePath}
        totalCards={cards.length}
        filteredCards={filtered.length}
      />

      <section className="bg-library-filter-board rounded-lg border border-[#cbd9ed] bg-[#f3f7fe] p-4 shadow-sm sm:p-5">
        <div className="grid gap-3">
          <label className="bg-library-search relative block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7b8da6]" size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Найти карту или механику…"
              className="h-12 w-full rounded-md border border-[#c5d4e9] bg-[#ffffff] pl-12 pr-4 text-base font-semibold text-[#26374f] outline-none transition-colors placeholder:text-[#8b9ab0] focus:border-[#d3af55]"
            />
          </label>
        </div>

        <div className="mt-4 space-y-4">
          <details className="bg-library-filter-group rounded-md border border-[#cbd9ed] bg-[#ffffff] p-3" open>
            <summary className="flex cursor-pointer list-none items-center justify-between font-hs text-sm text-[#26374f]">
              <span>Формат</span><ChevronDown size={16} />
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setIncludeDuos(value => !value)}
                data-active={includeDuos ? 'true' : 'false'}
                className={`bg-library-duos-toggle inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                  includeDuos ? 'border-[#e4c675] bg-[#e4c675] text-[#101827]' : 'border-[#cbd9ed] bg-white text-[#34445c] hover:border-[#d3af55]'
                }`}
              >
                <span className={`h-4 w-8 rounded-full p-0.5 transition-colors ${includeDuos ? 'bg-[#26374f]' : 'bg-[#cbd9ed]'}`}>
                  <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${includeDuos ? 'translate-x-4' : ''}`} />
                </span>
                Показывать карты Duo
              </button>
              <span className="text-sm text-[#657893]">Добавляет карты Duo к списку.</span>
            </div>
          </details>

          <details className="bg-library-filter-group rounded-md border border-[#cbd9ed] bg-[#ffffff] p-3" open>
            <summary className="flex cursor-pointer list-none items-center justify-between font-hs text-sm text-[#26374f]">
              <span className="flex items-center gap-2"><Filter size={16} />Уровень таверны</span><ChevronDown size={16} />
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <FilterChip active={tavernFilters.length === 0} onClick={() => setTavernFilters([])}>Все уровни</FilterChip>
              {TAVERN_TIERS.map(tier => (
                <FilterChip key={tier} active={tavernFilters.includes(String(tier))} onClick={() => toggleTavern(String(tier))} title={`Таверна ${tier}`}>
                  <img src={tavernIcon(tier)} alt="" className="h-7 w-7" loading="lazy" />Таверна {tier}
                </FilterChip>
              ))}
            </div>
          </details>

          {kind === 'minion' && (
            <details className="bg-library-filter-group rounded-md border border-[#cbd9ed] bg-[#ffffff] p-3" open>
              <summary className="flex cursor-pointer list-none items-center justify-between font-hs text-sm text-[#26374f]">
                <span>Тип существа</span><ChevronDown size={16} />
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterChip active={raceFilters.length === 0} onClick={() => setRaceFilters([])}>Все типы</FilterChip>
                {creatureTypes.map(([slug, label]) => (
                  <FilterChip key={slug} active={raceFilters.includes(slug)} onClick={() => toggleRace(slug)}>
                    {RACE_ICON_BY_SLUG[slug] && <img src={RACE_ICON_BY_SLUG[slug]} alt="" className="h-7 w-7 rounded-full" loading="lazy" />}{label}
                  </FilterChip>
                ))}
              </div>
            </details>
          )}

          {cardGroups.length > 0 && (
            <details className="bg-library-filter-group rounded-md border border-[#cbd9ed] bg-[#ffffff] p-3" open>
              <summary className="flex cursor-pointer list-none items-center justify-between font-hs text-sm text-[#26374f]">
                <span>Группа</span><ChevronDown size={16} />
              </summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <FilterChip active={groupFilter === 'ALL'} onClick={() => setGroupFilter('ALL')}>Все группы</FilterChip>
                {cardGroups.map(([slug, label]) => (
                  <FilterChip key={slug} active={groupFilter === slug} onClick={() => setGroupFilter(slug)}>{label}</FilterChip>
                ))}
              </div>
            </details>
          )}

          <details className="bg-library-filter-group rounded-md border border-[#cbd9ed] bg-[#ffffff] p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between font-hs text-sm text-[#26374f]">
              <span>Механики</span><ChevronDown size={16} />
            </summary>
            <div className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-auto pr-1">
              <FilterChip active={mechanic === 'ALL'} onClick={() => setMechanic('ALL')}>Все механики</FilterChip>
              {mechanics.map(([slug, label]) => (
                <FilterChip key={slug} active={mechanic === slug} onClick={() => setMechanic(slug)}>{label}</FilterChip>
              ))}
            </div>
          </details>
        </div>
      </section>

      <section className="overflow-visible rounded-lg border border-[#cbd9ed] bg-[#f8fbff] p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-hs text-xl text-[#26374f]">{kindTitle} · {poolTitle}</p>
          </div>
          {loading && <span className="font-hs text-[#8a651f]">Загружаю...</span>}
        </div>

        {error && <div className="rounded-md border border-[#efb4b4] bg-[#fff1f1] p-4 text-[#8f2424]">{error}</div>}
        {!loading && !error && filtered.length === 0 && <div className="rounded-md border border-[#cbd9ed] bg-[#ffffff] p-8 text-center text-[#657893]">По выбранным фильтрам ничего не найдено.</div>}

        <div className="space-y-8">
          {grouped.map(group => (
            <div key={group.key}>
              <div className="mb-4 flex items-center gap-3">
                {group.tavernTier && <img src={tavernIcon(group.tavernTier)} alt="" className="h-10 w-10" loading="lazy" />}
                <h2 className="font-hs text-2xl text-[#26374f]">{group.label}</h2>
                <span className="rounded-full border border-[#d6e1f1] bg-white px-2.5 py-1 text-xs font-bold text-[#60718a]">{group.items.length}</span>
                <div className="h-px flex-1 bg-[#cbd9ed]" />
              </div>
              <div className="grid overflow-visible grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {group.items.map(card => (
                  <LibraryCardTile
                    key={`${card.dbf}-${card.card_id}`}
                    card={card}
                    pool={pool}
                    navigatePath={navigatePath}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {pool === 'archive' && filtered.length > ARCHIVE_PAGE_SIZE && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <button type="button" disabled={normalizedArchivePage === 1} onClick={() => setArchivePage(page => Math.max(1, page - 1))} className="rounded-md border border-[#cbd9ed] bg-white px-4 py-2 font-semibold text-[#33445d] disabled:cursor-not-allowed disabled:opacity-45">
              Назад
            </button>
            {archivePages.map((page, index) => (
              <React.Fragment key={page}>
                {index > 0 && page - archivePages[index - 1] > 1 && <span className="px-1 text-[#657893]">...</span>}
                <button
                  type="button"
                  onClick={() => setArchivePage(page)}
                  className={`h-10 min-w-10 rounded-md border px-3 font-semibold ${page === normalizedArchivePage ? 'border-[#e4c675] bg-[#e4c675] text-[#101827]' : 'border-[#cbd9ed] bg-white text-[#33445d] hover:border-[#d3af55]'}`}
                >
                  {page}
                </button>
              </React.Fragment>
            ))}
            <button type="button" disabled={normalizedArchivePage === archivePageCount} onClick={() => setArchivePage(page => Math.min(archivePageCount, page + 1))} className="rounded-md border border-[#cbd9ed] bg-white px-4 py-2 font-semibold text-[#33445d] disabled:cursor-not-allowed disabled:opacity-45">
              Вперёд
            </button>
          </div>
        )}

        {pool !== 'archive' && visibleCount < filtered.length && (
          <div className="mt-8 text-center">
            <button type="button" onClick={() => setVisibleCount(count => count + MORE_VISIBLE_CARDS)} className="rounded-md border border-[#e4c675] bg-[#e4c675] px-6 py-3 font-hs text-[#101827]">
              Показать ещё
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function DetailPage({ kind, pool, dbfId, navigatePath }: { kind: LibraryKind; pool: PoolMode; dbfId: number; navigatePath: (path: string) => void }) {
  const [card, setCard] = useState<LibraryCard | null>(null);
  const [detail, setDetail] = useState<MinionDetail | null>(null);
  const [spellStats, setSpellStats] = useState<FirestoneSpellStat[]>([]);
  const [relatedCards, setRelatedCards] = useState<LibraryCard[]>([]);
  const [strategies, setStrategies] = useState<StrategyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const section = sectionFor(kind);
    const cardRequest = isBaseLibraryKind(kind)
      ? fetchJson<LibraryCard>(versionedLibraryUrl(`/api/bg/library/cards/by-dbf/${dbfId}`))
      : fetchAuxiliaryLibraryCards(kind, pool, { dbf: dbfId, per_page: 1 }).then(items => {
        const found = items.find(item => Number(item.dbf) === Number(dbfId)) || items[0];
        if (!found) throw new Error('Карта не найдена');
        return found;
      });
    const baseRequests: Array<Promise<unknown>> = [
      cardRequest,
      isBaseLibraryKind(kind) && pool === 'current'
        ? fetch('/bg-legacy/comps-data.js', { cache: 'force-cache' }).then(response => response.ok ? response.text() : '')
        : Promise.resolve(''),
      isBaseLibraryKind(kind) && pool === 'current'
        ? fetchJson<{ data: LibraryCard[] }>(versionedLibraryUrl('/api/bg/library/cards', { card_type: kind, in_pool: 1 })).then(result => result.data || []).catch(() => [])
        : fetchAuxiliaryLibraryCards(kind, pool).catch(() => []),
    ];
    if (kind === 'minion' && pool === 'current') {
      baseRequests.push(fetchJsonOrNull<MinionDetail>(`/api/bg/library/minions/${dbfId}`));
    } else if (kind === 'spell' && pool === 'current') {
      baseRequests.push(fetchJsonOrNull<any>('/api/bg/library/spell-stats'));
    } else {
      baseRequests.push(Promise.resolve(null));
    }

    Promise.all(baseRequests)
      .then(results => {
        if (!alive) return;
        const loadedCard = results[0] as LibraryCard;
        setCard(loadedCard);
        setStrategies(parseStrategies(String(results[1] || '')));
        setRelatedCards(dedupeLibraryCards((results[2] as LibraryCard[]).filter(item => item.dbf !== loadedCard.dbf)));
        if (kind === 'minion' && pool === 'current') {
          setDetail(results[3] as MinionDetail | null);
          setSpellStats([]);
        } else if (kind === 'spell' && pool === 'current') {
          setSpellStats(results[3] ? flattenSpellStats(results[3]) : []);
          setDetail(null);
        } else {
          setSpellStats([]);
          setDetail(null);
        }
        const loadedCardName = cardRuName(loadedCard);
        const title = pool === 'archive'
          ? `${loadedCardName} — архив · ${section.shortTitle} BG Hearthstone | HS-Manacost`
          : `${loadedCardName} — ${section.shortTitle} BG Hearthstone | HS-Manacost`;
        const description = pool === 'archive'
          ? `${loadedCardName}: архивная карта Полей сражений Hearthstone вне активного пула.`
          : `${loadedCardName}: ${cardGroupName(loadedCard)}, ${cardRulesText(loadedCard) || 'подробная карточка Полей сражений.'}`;
        setLibraryMeta(title, description, cardPath(loadedCard, pool), detailCardImage(loadedCard));
      })
      .catch(errorValue => {
        if (alive) setError(errorValue?.message || 'Не удалось загрузить карту');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [dbfId, kind, pool]);

  const spellStat = useMemo(() => spellStats.find(item => Number(item.dbfId) === Number(dbfId)), [dbfId, spellStats]);
  const usedStrategies = useMemo(() => card ? strategies.filter(strategy => cardMatchesStrategy(card, strategy)).slice(0, 10) : [], [card, strategies]);
  const similar = useMemo(() => {
    if (!card) return [];
    const mechanicSet = new Set((card.mechanics || []).map(item => item.slug));
    const scored: Array<{ item: LibraryCard; score: number }> = [];
    for (const item of relatedCards) {
      const raceMatch = card.creature_type?.slug && item.creature_type?.slug === card.creature_type.slug ? 2 : 0;
      const tierMatch = card.tavern_tier && item.tavern_tier === card.tavern_tier ? 1 : 0;
      let mechanicMatch = 0;
      for (const mechanic of item.mechanics || []) {
        if (mechanicSet.has(mechanic.slug)) mechanicMatch += 1;
      }
      const score = raceMatch + tierMatch + mechanicMatch;
      if (score > 0) scored.push({ item, score });
    }
    return scored
      .sort((a, b) => b.score - a.score || cardRuName(a.item).localeCompare(cardRuName(b.item), 'ru'))
      .slice(0, 6)
      .map(row => row.item);
  }, [card, relatedCards]);

  if (loading) return <div className="py-16 text-center font-hs text-[#6b4c2a]">Загружаем страницу карты...</div>;
  if (error || !card) return <div className="rounded-lg border border-[#efb4b4] bg-[#fff1f1] p-6 text-[#8f2424]">{error || 'Карта не найдена'}</div>;

  const backPath = sectionHref(kind, pool);
  const rounds = detail?.rounds || [];
  const mainImpact = kind === 'spell' ? spellStat?.impact : detail?.impact;
  const mainAverage = kind === 'spell' ? spellStat?.average_placement : detail?.avg_placement_with;
  const mainPopularity = kind === 'spell' ? spellStat?.total_played : detail?.popularity;
  const showStats = pool === 'current' && isBaseLibraryKind(kind);
  const heroImage = detailCardImage(card) || '/arena-logo-icon.webp?v=arena-legacy-20260629';
  const currentCardName = cardRuName(card);
  const section = sectionFor(kind);
  const rulesText = cardRulesText(card);
  const wikiUrl = card.wiki_page?.url || card.wiki?.page?.url || '';

  return (
    <div className="bg-library-detail-page space-y-6 text-[#26374f]">
      <button type="button" onClick={() => navigatePath(backPath)} className="inline-flex items-center gap-2 rounded-md border border-[#cbd9ed] bg-[#ffffff] px-4 py-2 text-sm font-semibold text-[#33445d] hover:border-[#d3af55]">
        <ArrowLeft size={16} /> Назад в {pool === 'archive' ? 'архив' : 'библиотеку'}
      </button>

      <section className="bg-library-card-dossier overflow-hidden rounded-lg border border-[#cbd9ed] bg-[#f8fbff] shadow-[0_16px_38px_rgba(68,88,122,0.14)]">
        <div className="bg-library-card-dossier__layout grid gap-6 p-4 sm:p-6 lg:grid-cols-[320px_1fr]">
          <div className="bg-library-card-dossier__art relative mx-auto w-full max-w-xs">
            <img src={heroImage} alt={currentCardName} className="w-full drop-shadow-[0_22px_30px_rgba(21,31,47,0.22)]" data-fallbacks={fallbackCardImages(card, heroImage, true).join('|') || undefined} onError={fallbackBrokenHeroImage} />
          </div>
          <div className="bg-library-card-dossier__copy min-w-0 space-y-5">
            <div>
              <p className="font-hs text-xs uppercase tracking-[0.18em] text-[#8a651f]">{section.shortTitle} · {pool === 'archive' ? 'Архив' : 'Активный пул'}</p>
              <h1 className="bg-library-card-dossier__title mt-2 font-hs text-4xl text-[#23314a] sm:text-5xl">{currentCardName}</h1>
              <p className="mt-1 text-lg text-[#657893]">{cardEnName(card)}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {card.tavern_tier && <span className="inline-flex items-center gap-2 rounded-md border border-[#d6e1f1] bg-[#ffffff] px-3 py-2 font-semibold text-[#33445d]"><img src={tavernIcon(card.tavern_tier)} alt="" className="h-8 w-8" />Таверна {card.tavern_tier}</span>}
              {card.creature_type && <span className="inline-flex items-center gap-2 rounded-md border border-[#d6e1f1] bg-[#ffffff] px-3 py-2 font-semibold text-[#33445d]">{RACE_ICON_BY_SLUG[card.creature_type.slug] && <img src={RACE_ICON_BY_SLUG[card.creature_type.slug]} alt="" className="h-8 w-8 rounded-full" />} {card.creature_type.name_ru}</span>}
              {card.group?.name_ru && <span className="rounded-md border border-[#f0dca8] bg-[#fff8de] px-3 py-2 font-semibold text-[#7c5b24]">{card.group.name_ru}</span>}
              {(card.mechanics || []).map(mechanic => <span key={mechanic.slug} className="rounded-md border border-[#e5d3f1] bg-[#fbf4ff] px-3 py-2 font-semibold text-[#603f77]">{mechanic.name_ru}</span>)}
              {card.duos_only && <span className="rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 font-semibold text-[#1f4e88]">Дуо</span>}
            </div>

            {rulesText && (
              <div className="bg-library-card-description rounded-md border border-[#d6e1f1] bg-[#ffffff] p-4 text-base leading-relaxed text-[#3b4d68]">
                <p className="mb-2 font-hs text-lg text-[#26374f]">Описание карты</p>
                <p className="whitespace-pre-line">{rulesText}</p>
              </div>
            )}

            {showStats ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Impact" value={formatDecimal(mainImpact, 2)} tone={metricTone(mainImpact)} />
                <MetricCard label="Среднее место" value={formatDecimal(mainAverage, 2)} />
                <MetricCard label={kind === 'spell' ? 'Сыграно' : 'Популярность'} value={kind === 'spell' ? formatCount(mainPopularity) : formatPercent(mainPopularity, 1)} />
                <MetricCard label="Стратегии" value={String(usedStrategies.length)} caption="где карта встречается" />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Раздел" value={section.shortTitle} />
                <MetricCard label="Группа" value={cardGroupName(card)} />
                <MetricCard label="DBF" value={String(card.dbf || '—')} />
                <MetricCard label="Статус" value={pool === 'archive' ? 'Архив' : (card.in_pool ? 'В пуле' : 'Справочник')} />
              </div>
            )}

            <div className="bg-library-card-sources flex min-w-0 flex-wrap gap-2">
              {card.source && <span className="rounded-md border border-[#d6e1f1] bg-white px-3 py-2 text-sm font-semibold text-[#60718a]">Источник: {card.source}</span>}
              {card.artist && <span className="rounded-md border border-[#d6e1f1] bg-white px-3 py-2 text-sm font-semibold text-[#60718a]">Художник: {card.artist}</span>}
              {wikiUrl && (
                <a href={wikiUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-[#d3af55] bg-[#fff8de] px-3 py-2 text-sm font-semibold text-[#7c5b24]" style={{ textDecoration: 'none' }}>
                  Страница на wiki <ExternalLink size={15} />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {kind === 'minion' && showStats && detail && (
        <section className="rounded-lg border border-[#cbd9ed] bg-[#f8fbff] p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <BarChart3 className="text-[#8a651f]" />
            <h2 className="font-hs text-2xl text-[#26374f]">Раунды и динамика</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartPanel title="Влияние по раундам" subtitle="Насколько наличие существа меняет среднее место">
              <MiniChart points={rounds.map(row => ({ x: row.combat_round, y: row.impact }))} color="#b58a2d" />
            </ChartPanel>
            <ChartPanel title="Доля побед в боях" subtitle="Combat winrate по раундам">
              <MiniChart points={rounds.map(row => ({ x: row.combat_round, y: row.combat_winrate }))} color="#3f9b52" unit="%" />
            </ChartPanel>
            <ChartPanel title="Среднее место" subtitle="Меньше значение лучше">
              <MiniChart points={rounds.map(row => ({ x: row.combat_round, y: row.avg_placement_with }))} color="#3e7fc1" invert />
            </ChartPanel>
            <ChartPanel title="Размер выборки" subtitle="Сколько игр включено в раундовую точку">
              <MiniChart points={rounds.map(row => ({ x: row.combat_round, y: row.games_with_minion }))} color="#8a5fb8" />
            </ChartPanel>
          </div>

          <div className="mt-5 overflow-hidden rounded-md border border-[#cbd9ed]">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-[#eef4fd] text-left text-[#26374f]">
                <tr>
                  <th className="px-3 py-2">Раунд</th>
                  <th className="px-3 py-2">Impact</th>
                  <th className="px-3 py-2">Combat WR</th>
                  <th className="px-3 py-2">Среднее место</th>
                  <th className="px-3 py-2">Игры с картой</th>
                  <th className="px-3 py-2">W/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d6e1f1] bg-[#ffffff]">
                {rounds.map(row => (
                  <tr key={row.combat_round}>
                    <td className="px-3 py-2 font-semibold text-[#8a651f]">{row.combat_round}</td>
                    <td className={`px-3 py-2 ${metricTone(row.impact)}`}>{formatDecimal(row.impact, 2)}</td>
                    <td className="px-3 py-2">{formatPercent(row.combat_winrate, 1)}</td>
                    <td className="px-3 py-2">{formatDecimal(row.avg_placement_with, 2)}</td>
                    <td className="px-3 py-2">{formatCount(row.games_with_minion)}</td>
                    <td className="px-3 py-2">{formatCount(row.wins)} / {formatCount(row.losses)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {kind === 'spell' && showStats && (
        <section className="rounded-lg border border-[#cbd9ed] bg-[#f8fbff] p-4 shadow-sm sm:p-5">
          <h2 className="mb-4 font-hs text-2xl text-[#26374f]">Статистика Firestone</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Impact" value={formatDecimal(spellStat?.impact, 2)} tone={metricTone(spellStat?.impact)} />
            <MetricCard label="Среднее место" value={formatDecimal(spellStat?.average_placement, 2)} />
            <MetricCard label="Среднее место без карты" value={formatDecimal(spellStat?.average_placement_other, 2)} />
            <MetricCard label="Сыграно" value={formatCount(spellStat?.total_played)} />
          </div>
        </section>
      )}

      {showStats && (
      <section className="rounded-lg border border-[#cbd9ed] bg-[#f8fbff] p-4 shadow-sm sm:p-5">
        <h2 className="mb-4 font-hs text-2xl text-[#26374f]">Используется в стратегиях</h2>
        {usedStrategies.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {usedStrategies.map(strategy => {
              const href = strategyTierListPath(strategy);
              return (
              <a
                key={strategy.key}
                href={href}
                onClick={(event) => { event.preventDefault(); navigatePath(href); }}
                className="group rounded-md border border-[#cbd9ed] bg-[#ffffff] p-4 transition-colors hover:border-[#d3af55] hover:bg-[#fffaf0]"
                style={{ textDecoration: 'none' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#8a651f]">{strategy.source} · {strategy.tier || 'meta'}</p>
                    <h3 className="mt-1 font-hs text-xl text-[#26374f]">{strategy.title}</h3>
                  </div>
                  <ExternalLink size={18} className="text-[#7b8da6]" />
                </div>
                {strategy.description && <p className="mt-2 line-clamp-2 text-sm text-[#657893]">{strategy.description}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(strategy.cards || []).slice(0, 8).map(item => (
                    <span key={`${strategy.key}-${item.id}-${item.dbfId}`} className={`rounded px-2 py-1 text-xs ${Number(item.dbfId) === Number(card.dbf) || item.id === card.card_id ? 'bg-[#e4c675] text-[#101827]' : 'bg-[#eef4fd] text-[#33445d]'}`}>
                      {item.ruName || item.name || item.id}
                    </span>
                  ))}
                </div>
                <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#d3af55] bg-[#fff3c4] px-3 py-2 text-sm font-bold text-[#4b3419] transition-colors group-hover:bg-[#e4c675]">
                  Открыть стратегию
                  <ExternalLink size={15} />
                </div>
              </a>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-[#cbd9ed] bg-[#ffffff] p-6 text-center text-[#657893]">
            В текущих мета-сборках эта карта не найдена.
          </div>
        )}
      </section>
      )}

      {showStats && similar.length > 0 && (
        <section className="rounded-lg border border-[#cbd9ed] bg-[#f8fbff] p-4 shadow-sm sm:p-5">
          <h2 className="mb-4 font-hs text-2xl text-[#26374f]">Похожие карты</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {similar.map(item => (
              <a key={`${item.dbf}-${item.card_id}`} href={cardPath(item, pool)} onClick={(event) => { event.preventDefault(); navigatePath(cardPath(item, pool)); }} className="rounded-md p-2 text-center transition-transform hover:-translate-y-1" style={{ textDecoration: 'none' }}>
                <img src={primaryCardImage(item) || '/arena-logo-icon.webp?v=arena-legacy-20260629'} alt={cardRuName(item)} className="mx-auto h-40 object-contain drop-shadow-[0_12px_16px_rgba(21,31,47,0.18)]" loading="lazy" onError={hideBrokenImage} />
                <p className="mt-2 line-clamp-2 font-hs text-sm text-[#26374f]">{cardRuName(item)}</p>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function BgLibrary({ currentPath, navigatePath }: BgLibraryProps) {
  const route = libraryRoute(currentPath);
  if (route.page === 'detail' && route.dbfId) {
    return <DetailPage kind={route.kind} pool={route.pool} dbfId={route.dbfId} navigatePath={navigatePath} />;
  }
  return <LibraryListPage kind={route.kind} pool={route.pool} navigatePath={navigatePath} />;
}
