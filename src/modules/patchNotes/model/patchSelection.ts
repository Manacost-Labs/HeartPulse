import type { PatchCardView, PatchFilter, PatchGroupView, PatchKindCounts, PatchSectionId, PatchView } from './patchEntries';
import type { PatchNotesArchetypeUse } from './types';

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

/**
 * The patch at a glance: up to `limit` changes with a picture from sections
 * longer than three cards, Standard first, then the largest number moves; a
 * stated buff or nerf outranks a rework and no section fills more than half
 * the list unless nothing else is left.
 */
export function patchHighlights(view: PatchView, limit = 6): PatchCardView[] {
  const score = (card: PatchCardView) => HIGHLIGHT_WEIGHT[card.section] + (card.kind === 'rework' ? 0 : 40)
    + Math.min(50, 10 * card.changes.reduce((sum, change) =>
      sum + (isNumber(change.before) && isNumber(change.after) ? Math.abs(change.after - change.before) : 0), 0))
    + (card.hasText ? 20 : 0);
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

/** One archetype of today's meta with the changed cards it plays. */
export type PatchAffectedArchetype = PatchNotesArchetypeUse & {
  href: string;
  kinds: PatchKindCounts;
  cards: { name: string; anchor: string; kind: PatchCardView['kind'] }[];
};

/** Archetypes touched by the patch, most popular first; a card counts once per archetype. */
export function patchAffectedArchetypes(view: PatchView): PatchAffectedArchetype[] {
  const byKey = new Map<string, PatchAffectedArchetype>();
  for (const card of view.groups.flatMap(group => group.entries)) {
    for (const use of card.archetypes) {
      const key = `${use.format}:${use.slug}`;
      const known = byKey.get(key) ?? { ...use, kinds: { buff: 0, nerf: 0, rework: 0 }, cards: [] };
      if (known.cards.some(item => item.anchor === card.anchor)) continue;
      known.cards.push({ name: card.name, anchor: card.anchor, kind: card.kind });
      known.kinds[card.kind] += 1;
      byKey.set(key, known);
    }
  }
  return [...byKey.values()].sort((left, right) => (right.popularity ?? 0) - (left.popularity ?? 0)
    || right.cards.length - left.cards.length);
}

/** Buff, nerf and rework counts of a group, for the summary strip. */
export function patchGroupKinds(group: PatchGroupView): PatchKindCounts {
  const kinds: PatchKindCounts = { buff: 0, nerf: 0, rework: 0 };
  for (const card of group.entries) kinds[card.kind] += 1;
  return kinds;
}
