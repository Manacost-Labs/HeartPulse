import { canonicalPagePath } from '../app/routing/canonicalPagePath';
import { libraryCardSearchTerms } from './bgLibraryCatalogModel';
import { LIBRARY_SECTIONS, libraryKindLabel, sectionHref, type LibraryKind, type PoolMode } from './bgLibrarySections';

/** A card of the library as the catalog answers it (the subscriber's view) or as the open listing is mapped to it. */
export interface LibraryCard {
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

export interface LibraryMeta {
  creature_types?: Array<{ slug: string | null; name_ru: string | null }>;
  mechanics?: Array<{ slug: string; name_ru: string }>;
}

/** The first page of a current listing; «Показать ещё» adds the same number again. */
export const INITIAL_VISIBLE_CARDS = 36;

const CARD_NAME_OVERRIDES: Record<string, string> = {
  'bacon blood gem': 'Кровавые самоцветы',
  'bacon pass tooltip': 'Передача карт',
  'bacon refresh': 'Обновление таверны',
};

export function tavernIcon(tier: number | string): string {
  return `/bg-legacy/assset/tier${tier}.png`;
}

export function cleanSearch(value: unknown): string {
  return String(value || '').toLowerCase().replace(/ё/g, 'е').trim();
}

function slugify(value: string): string {
  return cleanSearch(value)
    .replace(/['’]/g, '')
    .replace(/[^a-zа-я0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'card';
}

export function cardRuName(card: LibraryCard): string {
  const keys = [card.name?.ru, card.name?.en, card.card_id].map(value => cleanSearch(String(value || '')));
  for (const key of keys) {
    if (CARD_NAME_OVERRIDES[key]) return CARD_NAME_OVERRIDES[key];
  }
  return card.name?.ru || card.name?.en || card.card_id;
}

function cardSlug(card: LibraryCard): string {
  return `${slugify(cardRuName(card) || card.name?.en || card.card_id)}-${card.dbf}`;
}

const normalizeLibrarySlug = (value: unknown): string => String(value || '').toLowerCase().replace(/-/g, '_');

export function cardLibraryKind(card: LibraryCard): LibraryKind {
  const librarySlug = normalizeLibrarySlug(card.library?.slug || card.category?.slug);
  if (librarySlug === 'darkmoon_prize') return 'darkmoon_prize';
  if (LIBRARY_SECTIONS.some(section => section.kind === librarySlug)) return librarySlug as LibraryKind;
  const typeSlug = String(card.card_type?.slug || '').toLowerCase();
  if (typeSlug === 'spell') return 'spell';
  return 'minion';
}

export function cardPath(card: LibraryCard, pool: PoolMode): string {
  return canonicalPagePath(`${sectionHref(cardLibraryKind(card), pool)}/${cardSlug(card)}`);
}

export function searchText(card: LibraryCard): string {
  return cleanSearch(libraryCardSearchTerms(card, cardRuName(card)).join(' '));
}

/** The raw tier of a card (a prize's rating), read for its value or for its label. */
function tierField(card: LibraryCard, field: 'value' | 'label'): string {
  const raw = card.tier;
  const value = typeof raw === 'object' && raw !== null
    ? (field === 'value' ? (raw.value ?? raw.slug ?? raw.name_ru) : (raw.name_ru ?? raw.value ?? raw.slug))
    : raw;
  return String(value ?? '').trim();
}

export function libraryTierValue(card: LibraryCard): string {
  return tierField(card, 'value');
}

export function libraryTierLabel(card: LibraryCard): string {
  const normalized = tierField(card, 'label');
  if (!normalized) return 'Без тира';
  if (/^tier\s+/i.test(normalized)) return normalized.replace(/^tier/i, 'Тир');
  if (/^тир\s+/i.test(normalized)) return normalized;
  return `Тир ${normalized.toUpperCase()}`;
}

/** A rating letter that has a mark in `/tier-marks/`; the prizes' other tiers («Тир 1») stay plain text. */
export const isTierLetter = (value: string): boolean => /^[sabcdef]$/i.test(value);

function libraryTierSortValue(card: LibraryCard): number {
  const value = libraryTierValue(card).toUpperCase();
  const order: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };
  if (value in order) return order[value];
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return 99;
}

export type LibraryDisplayGroup = { key: string; label: string; tavernTier?: number; tier?: string };

export function libraryDisplayGroup(card: LibraryCard, kind: LibraryKind): LibraryDisplayGroup {
  if (kind === 'darkmoon_prize') {
    const tierValue = libraryTierValue(card);
    return { key: `darkmoon-prize-tier-${tierValue || 'none'}`, label: libraryTierLabel(card), tier: isTierLetter(tierValue) ? tierValue : undefined };
  }
  if (card.tavern_tier) {
    return { key: `tavern-${card.tavern_tier}`, label: `Таверна ${card.tavern_tier}`, tavernTier: card.tavern_tier };
  }
  if (card.group?.slug || card.group?.name_ru) {
    return { key: `group-${card.group?.slug || card.group?.name_ru}`, label: card.group?.name_ru || 'Группа' };
  }
  return { key: `kind-${kind}`, label: libraryKindLabel(kind) };
}

/** The order of a listing: prizes by rating, the rest by tavern tier, then by Russian name. */
export function compareLibraryCards(kind: LibraryKind) {
  return (left: LibraryCard, right: LibraryCard): number =>
    (kind === 'darkmoon_prize' ? libraryTierSortValue(left) - libraryTierSortValue(right)
      : Number(left.tavern_tier || 99) - Number(right.tavern_tier || 99))
    || cardRuName(left).localeCompare(cardRuName(right), 'ru');
}

/**
 * The cards a current listing shows before any search or filter: Duo cards hidden, in listing order, the first page.
 * The server page names exactly these in its JSON-LD.
 */
export function initialLibraryCards(cards: LibraryCard[], kind: LibraryKind): LibraryCard[] {
  return cards.filter(card => !card.duos_only).sort(compareLibraryCards(kind)).slice(0, INITIAL_VISIBLE_CARDS);
}
