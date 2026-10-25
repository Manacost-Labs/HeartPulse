import type { PatchNotesArchetypeUse, PatchNotesFormat, PatchNotesMeta } from './contract.js';
import type { PatchArchetypeSnapshot } from './archetypeSnapshots.js';

type Archetype = Omit<PatchNotesArchetypeUse, 'decks'>;

export type PatchMetaIndex = {
  meta: PatchNotesMeta;
  /** Archetype key → builds containing the card, per card dbf id. */
  buildsByDbf: Map<number, Map<string, Set<number>>>;
  archetypes: Map<string, Archetype>;
};

/** Chips per card; the rest is said by the archetype count. */
const ARCHETYPES_PER_CARD = 8;
const FORMATS: PatchNotesFormat[] = ['standard', 'wild'];

/**
 * Which archetypes of a patch's pinned snapshots play each card: a card is
 * "played" by an archetype when at least one of its listed builds contains
 * it. A format without a snapshot of that day is reported in `meta.missing`;
 * `null` when the patch has no snapshot at all, so the page shows no archetypes.
 */
export function buildPatchMetaIndex(snapshots: readonly PatchArchetypeSnapshot[]): PatchMetaIndex | null {
  if (!snapshots.length) return null;
  const buildsByDbf = new Map<number, Map<string, Set<number>>>();
  const archetypes = new Map<string, Archetype>();
  for (const snapshot of snapshots) {
    for (const item of snapshot.items) {
      const key = `${snapshot.format}:${item.slug}`;
      archetypes.set(key, {
        format: snapshot.format, slug: item.slug, name: item.name, classKey: item.classKey,
        popularity: item.popularity, totalDecks: item.builds.length,
      });
      item.builds.forEach((cards, build) => {
        for (const dbf of cards) {
          const byArchetype = buildsByDbf.get(dbf) ?? new Map<string, Set<number>>();
          const builds = byArchetype.get(key) ?? new Set<number>();
          builds.add(build);
          byArchetype.set(key, builds);
          buildsByDbf.set(dbf, byArchetype);
        }
      });
    }
  }
  const first = snapshots[0];
  const formats = snapshots.map(snapshot => snapshot.format);
  return {
    meta: {
      day: first.day,
      period: first.period,
      updatedAt: first.recordedAt,
      formats,
      missing: FORMATS.filter(format => !formats.includes(format)),
    },
    buildsByDbf,
    archetypes,
  };
}

/** Archetypes whose builds play any print of the card, most decks and most popular first. */
export function archetypesForCard(index: PatchMetaIndex, dbfs: readonly number[]): PatchNotesArchetypeUse[] {
  const builds = new Map<string, Set<number>>();
  for (const dbf of dbfs) {
    for (const [key, found] of index.buildsByDbf.get(dbf) ?? []) {
      builds.set(key, new Set([...(builds.get(key) ?? []), ...found]));
    }
  }
  return [...builds].flatMap(([key, found]) => {
    const archetype = index.archetypes.get(key);
    return archetype ? [{ ...archetype, decks: found.size }] : [];
  }).sort((left, right) => right.decks / right.totalDecks - left.decks / left.totalDecks
    || (right.popularity ?? 0) - (left.popularity ?? 0)).slice(0, ARCHETYPES_PER_CARD);
}
