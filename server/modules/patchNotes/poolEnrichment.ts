import type {
  PatchNotesContentSection, PatchNotesDetail, PatchNotesMention, PatchNotesMode, PatchNotesPoolGroup, PatchNotesPoolItem,
} from './contract.js';
import type { PatchCardResolver } from './parser.js';

type MentionFinder = (line: string, lineIndex: number) => PatchNotesMention[];
type Finders = { battlegrounds: MentionFinder; collectible: MentionFinder };

const cleanName = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();

function resolvePoolItem(item: PatchNotesPoolItem, mode: PatchNotesMode, subtitle: string | null, resolve: PatchCardResolver): PatchNotesPoolItem {
  const lookup = item.sourceName || item.name;
  const card = resolve(lookup, { mode, subtitle: item.tribe ?? subtitle, tier: item.tier ?? null });
  if (!card) return item;
  const resolvedName = card.name || item.name;
  return {
    ...item,
    name: resolvedName,
    sourceName: cleanName(resolvedName) === cleanName(lookup) ? null : lookup,
    cardId: card.id,
    cardType: card.cardType ?? item.cardType ?? null,
    renderUrl: card.renderUrl ?? item.renderUrl ?? null,
    tier: item.tier ?? card.tier ?? null,
  };
}

function resolveList(
  items: readonly PatchNotesPoolItem[] | undefined,
  mode: PatchNotesMode,
  subtitle: string | null,
  resolve: PatchCardResolver,
  shouldResolve: boolean,
): PatchNotesPoolItem[] | undefined {
  if (!items?.length) return undefined;
  return shouldResolve ? items.map(item => resolvePoolItem(item, mode, subtitle, resolve)) : items.map(item => ({ ...item }));
}

/** Resolves removed, new and returning pool cards against the Battlegrounds and collectible catalogs. */
export function enrichPoolGroups(raw: unknown, resolve: PatchCardResolver): PatchNotesPoolGroup[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const groups = (raw as PatchNotesPoolGroup[]).map(group => {
    const subtitle = group.title;
    return {
      id: group.id,
      mode: group.mode,
      title: group.title,
      ...(group.note ? { note: group.note } : {}),
      ...(group.removed?.length ? { removed: resolveList(group.removed, group.mode, subtitle, resolve, true) } : {}),
      // New cards resolve too: they gain the library picture as soon as the catalog lists them.
      ...(group.added?.length ? { added: resolveList(group.added, group.mode, subtitle, resolve, true) } : {}),
      ...(group.returning?.length ? { returning: resolveList(group.returning, group.mode, subtitle, resolve, true) } : {}),
    };
  });
  return groups.length ? groups : undefined;
}

/** Card pictures of a section item, resolved by name and tier unless the data gives the card id. */
function resolveSectionCards(cards: readonly PatchNotesPoolItem[], mode: PatchNotesMode, resolve: PatchCardResolver): PatchNotesPoolItem[] {
  // A card the data already names by id (a hero, a hero skin) keeps it: a name lookup could pick a namesake.
  return cards.map(card => (card.cardId ? { ...card } : resolvePoolItem(card, mode, null, resolve)));
}

/** Keeps structured content sections from an official article row when present; their cards resolve against the catalogs. */
export function readContentSections(raw: unknown, resolve: PatchCardResolver): PatchNotesContentSection[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  return (raw as PatchNotesContentSection[]).map(section => ({
    ...section,
    ...(section.items ? { items: section.items.map(item => ({
      ...item,
      ...(item.bullets ? { bullets: [...item.bullets] } : {}),
      ...(item.cards?.length ? { cards: resolveSectionCards(item.cards, section.mode, resolve) } : {}),
      ...(item.images?.length ? { images: item.images.map(image => ({ ...image })) } : {}),
    })) } : {}),
    ...(section.columns ? { columns: [...section.columns] } : {}),
    ...(section.rows ? { rows: section.rows.map(row => [...row]) } : {}),
  }));
}

/** Adds interactive card-mention marks to structured section bullets. */
export function withSectionMentions(patches: PatchNotesDetail[], finders: Finders): PatchNotesDetail[] {
  return patches.map(patch => {
    if (!patch.sections?.length) return patch;
    return {
      ...patch,
      sections: patch.sections.map(section => {
        if (!section.items?.length) return section;
        const find = section.mode === 'battlegrounds' ? finders.battlegrounds : finders.collectible;
        return {
          ...section,
          items: section.items.map(item => {
            if (!item.bullets?.length) return item;
            const marks = item.bullets.flatMap((line, index) => find(line, index));
            return marks.length ? { ...item, marks } : item;
          }),
        };
      }),
    };
  });
}
