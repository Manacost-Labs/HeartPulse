import type { PatchCardView, PatchKindCounts, PatchView } from './patchEntries';
import type { PatchNotesSummary } from './types';

/* What the page shows around the changes: the expansion cycle, the hero's lead and the archive timeline. */

/**
 * Every major client version opens one expansion cycle: 35.0 shipped
 * «КАТАКЛИЗМ», 35.6 is still its cycle. Majors are confirmed by the archive's
 * own article titles (25, 26, 28–30, 32, 33, 35, 37) or by the release order
 * of the card catalog's sets; a major the archive has no patch of is left out
 * rather than guessed. Codes are HearthstoneJSON `set` values.
 */
const EXPANSION_BY_MAJOR: Readonly<Record<number, string>> = {
  18: 'SCHOLOMANCE',
  21: 'STORMWIND',
  23: 'THE_SUNKEN_CITY',
  24: 'REVENDRETH',
  25: 'RETURN_OF_THE_LICH_KING',
  26: 'BATTLE_OF_THE_BANDS',
  27: 'TITANS',
  28: 'WILD_WEST',
  29: 'WHIZBANGS_WORKSHOP',
  30: 'ISLAND_VACATION',
  31: 'SPACE',
  32: 'EMERALD_DREAM',
  33: 'THE_LOST_CITY',
  34: 'TIME_TRAVEL',
  35: 'CATACLYSM',
  36: 'ESCAPEFROM_VIOLET_HOLD',
  37: 'BE',
};

/** The expansion whose cycle a version belongs to, `null` for a cycle not listed above. */
export function patchExpansionCode(version: string): string | null {
  const major = Number.parseInt(version, 10);
  return Number.isSafeInteger(major) ? EXPANSION_BY_MAJOR[major] ?? null : null;
}

/** Whose art leads the patch header: Battlegrounds when most changes are there, else the most changed class. */
export type PatchHeroLead = { mode: 'battlegrounds' } | { classKey: string };

export function patchHeroLead(view: PatchView): PatchHeroLead | null {
  const battlegrounds = view.sections.find(section => section.id === 'battlegrounds')?.count ?? 0;
  if (battlegrounds > view.total - battlegrounds) return { mode: 'battlegrounds' };
  const byClass = new Map<string, number>();
  for (const card of view.groups.flatMap(group => group.entries)) {
    if (card.classKey) byClass.set(card.classKey, (byClass.get(card.classKey) ?? 0) + 1);
  }
  // Map order is view order, so a tie goes to the class shown first.
  const [lead] = [...byClass.entries()].sort((left, right) => right[1] - left[1]);
  if (lead) return { classKey: lead[0] };
  return battlegrounds > 0 ? { mode: 'battlegrounds' } : null;
}

/** Art this wide fills a featured plate without visible upscaling after the proxy's resize. */
const FEATURED_ART_MIN_WIDTH = 1000;

export function patchHasWideArtwork(card: PatchCardView): card is PatchCardView & { artwork: NonNullable<PatchCardView['artwork']> } {
  return (card.artwork?.width ?? 0) >= FEATURED_ART_MIN_WIDTH;
}

/** The first card, in the given order, whose wiki art is wide enough to carry a featured plate. */
export function patchFeaturedArtwork(cards: readonly PatchCardView[]): { card: PatchCardView; url: string } | null {
  const card = cards.find(patchHasWideArtwork);
  return card ? { card, url: card.artwork.url } : null;
}

/** Consecutive patches of one expansion cycle; `code` is `null` for an unlisted cycle. */
export type PatchArchiveGroup = { key: string; code: string | null; patches: PatchNotesSummary[] };

/** The archive (newest first) cut into expansion cycles, keeping its order. */
export function patchArchiveByExpansion(patches: readonly PatchNotesSummary[]): PatchArchiveGroup[] {
  const groups: PatchArchiveGroup[] = [];
  for (const patch of patches) {
    const code = patchExpansionCode(patch.version);
    const key = code ?? `major-${Number.parseInt(patch.version, 10)}`;
    const last = groups.at(-1);
    if (last?.key === key) last.patches.push(patch);
    else groups.push({ key, code, patches: [patch] });
  }
  return groups;
}

/** Whole-percent shares of buffs, nerfs and reworks for share bars; all zero for an empty count. */
export function patchKindShares(kinds: PatchKindCounts): PatchKindCounts {
  const total = kinds.buff + kinds.nerf + kinds.rework;
  if (!total) return { buff: 0, nerf: 0, rework: 0 };
  const share = (value: number) => Math.round((value / total) * 100);
  return { buff: share(kinds.buff), nerf: share(kinds.nerf), rework: share(kinds.rework) };
}
