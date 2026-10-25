import {
  PATCH_SECTION_TITLES, type PatchGroupView, type PatchNotesMeta, type PatchNotesMode, type PatchSectionView,
} from '../../modules/patchNotes/public';
import { groupAnchor, sectionAnchor } from './patchAnchors';
import type { PatchTocEntry } from './PatchToc';

/** Anchors of the blocks before the sections. */
export const HIGHLIGHTS_ANCHOR = 'hp-patch-highlights';
export const ARCHETYPES_ANCHOR = 'hp-patch-archetypes';

/**
 * The table of contents in reading order: "Главное", the archetypes block,
 * then each section with the groups it shows (after filters), then the
 * sections of modes that have only general changes.
 */
export function patchTocEntries({ blocks, sections, groups, notesOnly }: {
  blocks: { id: string; title: string }[];
  sections: PatchSectionView[];
  groups: PatchGroupView[];
  notesOnly: PatchNotesMode[];
}): PatchTocEntry[] {
  return [
    ...blocks.map(block => ({ ...block, groups: [] })),
    ...sections.flatMap(section => {
      const shown = groups.filter(group => group.section === section.id);
      return shown.length
        ? [{ id: sectionAnchor(section.id), title: section.title, groups: shown.map(group => ({ id: groupAnchor(group.id), title: group.title })) }]
        : [];
    }),
    ...notesOnly.map(mode => ({ id: sectionAnchor(mode), title: PATCH_SECTION_TITLES[mode], groups: [] })),
  ];
}

/**
 * Which blocks stand before the sections and what the table of contents
 * lists: filters hide "Главное" and the archetypes (`archetypes` is the
 * meta to show, else `null`); a table of two entries or fewer would only
 * repeat their headings, so `toc` is then `null` and the page has none.
 */
export function patchPageNavigation({ filtered, highlights, archetypes, sections, groups, notesOnly }: {
  filtered: boolean; highlights: boolean; archetypes: PatchNotesMeta | null;
  sections: PatchSectionView[]; groups: PatchGroupView[]; notesOnly: PatchNotesMode[];
}): { showHighlights: boolean; archetypes: PatchNotesMeta | null; toc: PatchTocEntry[] | null } {
  const showHighlights = !filtered && highlights;
  const showArchetypes = filtered ? null : archetypes;
  const toc = patchTocEntries({
    blocks: [
      ...(showHighlights ? [{ id: HIGHLIGHTS_ANCHOR, title: 'Главное в патче' }] : []),
      ...(showArchetypes ? [{ id: ARCHETYPES_ANCHOR, title: 'Архетипы' }] : []),
    ],
    sections, groups, notesOnly: filtered ? [] : notesOnly,
  });
  const navigable = toc.length + toc.reduce((sum, entry) => sum + entry.groups.length, 0) > 2;
  return { showHighlights, archetypes: showArchetypes, toc: navigable ? toc : null };
}
