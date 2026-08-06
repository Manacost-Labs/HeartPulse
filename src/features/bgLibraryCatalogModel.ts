export type BgLibraryCatalogKind =
  | 'minion'
  | 'spell'
  | 'anomaly'
  | 'dark_gift'
  | 'quest'
  | 'darkmoon_prize'
  | 'reward'
  | 'trinket'
  | 'timewarped';

type SearchableLibraryCard = {
  card_id?: string | null;
  dbf?: number | string | null;
  name?: { ru?: string | null; en?: string | null } | null;
  text_ru?: string | null;
  text?: { ru?: string | null; en?: string | null } | null;
  group?: { name_ru?: string | null; slug?: string | null } | null;
  library?: { name_ru?: string | null } | null;
  category?: { name_ru?: string | null } | null;
  creature_type?: { name_ru?: string | null; slug?: string | null } | null;
  mechanics?: Array<{ slug?: string | null; name_ru?: string | null }> | null;
};

/**
 * Some Dark Gifts have the same localized name but different card IDs and effects.
 * They are separate Blizzard catalog records and must never be merged by display name.
 */
export function distinctCatalogIdentity(
  kind: BgLibraryCatalogKind,
  card: Pick<SearchableLibraryCard, 'card_id' | 'dbf'>,
): string | null {
  if (kind !== 'dark_gift') return null;
  const identity = String(card.card_id || card.dbf || '').trim();
  return identity ? `${kind}|${identity}` : null;
}

/** Returns every user-facing field that participates in library search. */
export function libraryCardSearchTerms(card: SearchableLibraryCard, resolvedRuName: string): string[] {
  return [
    card.name?.ru,
    card.name?.en,
    resolvedRuName,
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
  ]
    .filter((value): value is string | number => value !== null && value !== undefined && value !== '')
    .map(String);
}

export function visibleEnglishLibraryName(card: Pick<SearchableLibraryCard, 'card_id' | 'name'>, ruName: string): string | null {
  const enName = String(card.name?.en || '').trim();
  if (!enName || enName === card.card_id || enName.localeCompare(ruName, undefined, { sensitivity: 'accent' }) === 0) {
    return null;
  }
  return enName;
}
