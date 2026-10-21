import type { PatchHeroLead, PatchSectionId } from '../../modules/patchNotes/public';
import { publicResourceImageUrl } from '../../publicResourceUrl';
import { archetypeClassBackdrop } from '../archetypeDetailModel';
import { constructedSetLabel } from '../constructedCardLabels';
import { STANDARD_META_CLASS_COLORS } from '../standardMetaClassModel';

/*
 * Which of the site's own images dress the patch page. Mode plates and icons
 * are derived from shipped art by scripts/build-patch-notes-assets.mjs; class
 * plates are the archetype header art; set glyphs come from the card library.
 */

/** A 2.4:1 plate with its responsive sources and the crop centre for `object-position`. */
export type PatchPlate = { src: string; srcSet: string; focus: string; width: number; height: number };

function modePlate(name: string, focus = '50% 40%'): PatchPlate {
  return {
    src: `/patch-notes/${name}-1280.webp`,
    srcSet: `/patch-notes/${name}-640.webp 640w, /patch-notes/${name}-1280.webp 1280w`,
    focus, width: 1280, height: 533,
  };
}

export const SECTION_PLATES: Record<PatchSectionId, PatchPlate> = {
  standard: modePlate('standard', '62% 18%'),
  wild: modePlate('wild'),
  constructed: modePlate('constructed'),
  arena: modePlate('arena', '80% 30%'),
  battlegrounds: modePlate('battlegrounds'),
  other: modePlate('other'),
};

/** Mode emblems; "Стандарт и Вольный" (cards of unknown format) shows both shields. */
export const SECTION_ICONS: Record<PatchSectionId, string[]> = {
  standard: ['/patch-notes/mode-standard-96.webp'],
  wild: ['/patch-notes/mode-wild-96.webp'],
  constructed: ['/patch-notes/mode-standard-96.webp', '/patch-notes/mode-wild-96.webp'],
  arena: ['/patch-notes/mode-arena-96.webp'],
  battlegrounds: ['/patch-notes/mode-battlegrounds-96.webp'],
  other: [],
};

/** The header plate: the lead class's archetype art, else the Battlegrounds or first section's mode plate. */
export function heroPlate(lead: PatchHeroLead | null, firstSection: PatchSectionId | undefined): PatchPlate {
  if (lead && 'classKey' in lead) {
    const backdrop = archetypeClassBackdrop(lead.classKey);
    if (backdrop) return { ...backdrop, width: 1920, height: 800 };
  }
  return SECTION_PLATES[lead && 'mode' in lead ? 'battlegrounds' : firstSection ?? 'constructed'];
}

/** The image proxy serves at most 512 px; a featured illustration is never drawn wider than that on 1x screens. */
export function cardArtSources(url: string): { src: string; srcSet: string } {
  return {
    src: publicResourceImageUrl(url, { width: 512, quality: 78 }),
    srcSet: [320, 512].map(width => `${publicResourceImageUrl(url, { width, quality: 78 })} ${width}w`).join(', '),
  };
}

/** The newest set has no glyph in the card library yet (the wiki did not answer when it was synced). */
const SETS_WITHOUT_GLYPH = new Set(['BE']);

export function expansionBadge(code: string): { label: string; glyph: string | null } {
  return {
    label: constructedSetLabel(code),
    glyph: SETS_WITHOUT_GLYPH.has(code) ? null : `/constructed-filter-icons/sets/${code.toLocaleLowerCase('en-US')}.webp`,
  };
}

/** Class accent of a group header, the same colours as the meta page's deck headers. */
export function classAccent(classKey: string | null): string | undefined {
  return classKey ? STANDARD_META_CLASS_COLORS[classKey as keyof typeof STANDARD_META_CLASS_COLORS] : undefined;
}

export function classIcon96(classKey: string): string {
  return classKey === 'neutral' ? '/class_icon/neutral.webp' : `/class_icon/ui/${classKey}-96.webp`;
}
