import type { PatchCardView, PatchFilter, PatchGroupView, PatchKind, PatchSectionId, PatchView } from './patchEntries';

/* Which cards the page shows: filter results, filter options and the "what matters" pick. */

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Groups a section offers in the class/type filter, with their card counts. */
export function patchGroupOptions(view: PatchView, section: PatchFilter['section']): {
  id: string; section: PatchSectionId; title: string; count: number;
}[] {
  return view.groups.filter(group => section === 'all' || group.section === section)
    .map(group => ({ id: group.id, section: group.section, title: group.title, count: group.entries.length }));
}

/** Filtered groups, empty ones left out. Search matches names in both languages and the change text. */
export function filterPatchView(view: PatchView, filter: PatchFilter): PatchGroupView[] {
  const words = filter.query.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  return view.groups
    .filter(group => (filter.section === 'all' || group.section === filter.section) && (filter.group === 'all' || group.id === filter.group))
    .map(group => ({
      ...group,
      entries: group.entries.filter(entry => (filter.kind === 'all' || entry.kind === filter.kind)
        && words.every(word => entry.search.includes(word))),
    }))
    .filter(group => group.entries.length > 0);
}

const HIGHLIGHT_WEIGHT: Record<PatchSectionId, number> = { standard: 300, constructed: 250, arena: 200, wild: 150, battlegrounds: 100, other: 50 };

/** A section this short is read whole below; picking from it would only repeat it. */
const SHORT_SECTION = 3;
/** A patch this short fits one screen of cards: it gets no highlights at all. */
const SHORT_PATCH = 8;

/**
 * The patch at a glance: up to `limit` changes with a picture from sections
 * longer than three cards of a patch longer than eight, Standard first, then the largest number moves; a
 * stated buff or nerf outranks a rework and no section fills more than half
 * the list unless nothing else is left.
 */
export function patchHighlights(view: PatchView, limit = 4): PatchCardView[] {
  const score = (card: PatchCardView) => HIGHLIGHT_WEIGHT[card.section] + (card.kind === 'rework' ? 0 : 40)
    + Math.min(50, 10 * card.changes.reduce((sum, change) =>
      sum + (isNumber(change.before) && isNumber(change.after) ? Math.abs(change.after - change.before) : 0), 0))
    + (card.hasText ? 20 : 0);
  if (view.total <= SHORT_PATCH) return [];
  const long = new Set(view.sections.filter(section => section.count > SHORT_SECTION).map(section => section.id));
  const ranked = view.groups.flatMap(group => group.entries).filter(card => card.cardId && long.has(card.section))
    .map((card, index) => ({ card, index, score: score(card) }))
    .sort((left, right) => right.score - left.score || left.index - right.index).map(({ card }) => card);
  const cap = Math.ceil(limit / 2);
  const picked: PatchCardView[] = [];
  const perSection = new Map<PatchSectionId, number>();
  for (const card of ranked) {
    if (picked.length === limit) break;
    if ((perSection.get(card.section) ?? 0) >= cap) continue;
    picked.push(card);
    perSection.set(card.section, (perSection.get(card.section) ?? 0) + 1);
  }
  for (const card of ranked) {
    if (picked.length >= limit) break;
    if (!picked.includes(card)) picked.push(card);
  }
  return picked;
}

/** Reading order of the kinds inside a group: what got worse first, then what got better, then the rest. */
export const PATCH_KIND_ORDER: readonly PatchKind[] = ['nerf', 'buff', 'rework'];
/** A group this long reads better split by kind; a shorter one is only reordered. */
const KIND_BLOCK_MIN = 6;

/**
 * The rows of one group in kind order (the article's order inside each kind).
 * A group of at least six rows with more than one kind is split into one block
 * per kind, each named once; otherwise it is a single block with `kind: null`.
 */
export function patchKindBlocks(entries: readonly PatchCardView[]): { kind: PatchKind | null; entries: PatchCardView[] }[] {
  const blocks = PATCH_KIND_ORDER.map(kind => ({ kind, entries: entries.filter(entry => entry.kind === kind) }))
    .filter(block => block.entries.length > 0);
  if (entries.length < KIND_BLOCK_MIN || blocks.length < 2) return [{ kind: null, entries: blocks.flatMap(block => block.entries) }];
  return blocks;
}
