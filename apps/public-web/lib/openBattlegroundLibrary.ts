/**
 * The open listing of the library as the subscriber's listing view reads it. The server page hands the client a
 * compact copy (`openLibraryPayload`: the tile facts of each card, no statistics, no paths); `openLibraryCards` turns
 * it into the catalog cards of `BgLibraryListPage`, the same view a subscriber gets, so a guest and a robot see the
 * same tiles, pictures, tiers, search and badges in the server HTML.
 */
import { cleanSearch, initialLibraryCards, type LibraryCard, type LibraryMeta } from '@/src/features/bgLibraryCards';
import { dedupeLibraryCards, hearthstoneJsonBgCardUrl, localDbImageUrl } from '@/src/features/bgLibraryCardImages';
import { isBaseLibraryKind, LIBRARY_SECTIONS, type LibraryKind } from '@/src/features/bgLibrarySections';
import type { LibraryListingKind, PublicLibraryListing, PublicLibraryListingItem } from './publicBattlegroundLibraryListingData';

/** One card as the client gets it: every key but the identity only when the projection has it. */
export type OpenLibraryItem = {
  dbfId: number; name: string; nameEn?: string; cardId?: string; tavernTier?: number; group?: string;
  golden?: string; tier?: string; duosOnly?: true;
};
export type OpenLibraryListing = { kind: LibraryListingKind; items: OpenLibraryItem[] };

/** The tribes of the catalog (`/api/bg/library/meta`), in its order: the slugs name the tribe icons of the filter. */
const TRIBES: Array<[string, string]> = [
  ['all', 'Общие'], ['aberration', 'Аберрация'], ['undead', 'Нежить'], ['dragon', 'Дракон'], ['mech', 'Механизм'],
  ['murloc', 'Мурлок'], ['demon', 'Демон'], ['quilboar', 'Свинобраз'], ['naga', 'Нага'], ['pirate', 'Пират'],
  ['beast', 'Зверь'], ['elemental', 'Элементаль'],
];
const TRIBE_SLUGS = new Map(TRIBES.map(([slug, name]) => [name, slug]));
export const OPEN_LIBRARY_META: LibraryMeta = { creature_types: TRIBES.map(([slug, name_ru]) => ({ slug, name_ru })) };

export function libraryKindOf(kind: LibraryListingKind): LibraryKind {
  return LIBRARY_SECTIONS.find(section => section.activeHref === `/library/${kind}`)?.kind ?? 'minion';
}

export function openLibraryPayload(listing: PublicLibraryListing): OpenLibraryListing {
  return {
    kind: listing.kind,
    items: listing.items.map(item => ({
      dbfId: item.dbfId, name: item.name,
      ...(item.nameEn ? { nameEn: item.nameEn } : {}), ...(item.cardId ? { cardId: item.cardId } : {}),
      ...(item.tavernTier !== null ? { tavernTier: item.tavernTier } : {}), ...(item.group ? { group: item.group } : {}),
      ...(item.golden ? { golden: item.golden } : {}), ...(item.tier ? { tier: item.tier } : {}),
      ...(item.duosOnly ? { duosOnly: true as const } : {}),
    })),
  };
}

/** The pictures of an open card: the catalog's own copy for minions and spells, HearthstoneJSON for the other kinds. */
function images(item: OpenLibraryItem, kind: LibraryKind): LibraryCard['images'] {
  if (!item.cardId) return {};
  if (!isBaseLibraryKind(kind)) return { card: hearthstoneJsonBgCardUrl(item.cardId) };
  return {
    card: localDbImageUrl(item.cardId, 'cards'),
    golden: item.golden ? `/api/public-resource/db/uploads/${item.golden.split('/').map(encodeURIComponent).join('/')}` : null,
  };
}

function card(item: OpenLibraryItem, kind: LibraryKind): LibraryCard {
  const section = LIBRARY_SECTIONS.find(entry => entry.kind === kind);
  const tribe = item.group && (kind === 'minion' || kind === 'timewarped')
    ? { slug: TRIBE_SLUGS.get(item.group) ?? cleanSearch(item.group), name_ru: item.group } : null;
  return {
    card_id: item.cardId ?? String(item.dbfId), dbf: item.dbfId,
    name: { ru: item.name, en: item.nameEn ?? '' },
    card_type: { slug: kind },
    ...(isBaseLibraryKind(kind) ? {} : { library: { slug: kind, name_ru: section?.shortTitle ?? '' } }),
    tavern_tier: item.tavernTier ?? null, tier: item.tier ?? null,
    creature_type: tribe,
    ...(kind === 'trinket' && item.group ? { group: { slug: item.group, name_ru: item.group } } : {}),
    in_pool: true, duos_only: item.duosOnly === true, mechanics: [], images: images(item, kind),
  };
}

export function openLibraryCards(listing: OpenLibraryListing): LibraryCard[] {
  const kind = libraryKindOf(listing.kind);
  return dedupeLibraryCards(listing.items.map(item => card(item, kind)));
}

/** The cards the listing prints in its server HTML (its first page), for the page's JSON-LD list. */
export function printedOpenLibraryItems(listing: PublicLibraryListing): PublicLibraryListingItem[] {
  const byDbf = new Map(listing.items.map(item => [item.dbfId, item]));
  return initialLibraryCards(openLibraryCards(openLibraryPayload(listing)), libraryKindOf(listing.kind))
    .flatMap(entry => byDbf.get(entry.dbf) ?? []);
}
