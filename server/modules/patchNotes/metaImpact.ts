import { decode } from '@firestone-hs/deckstrings';
import type { PatchNotesArchetypeUse, PatchNotesFormat, PatchNotesMeta } from './contract.js';

/** The site's archetype catalog of one format, reduced to what the patch page reads. */
export type PatchArchetypeCatalog = {
  format: PatchNotesFormat;
  period?: string | null;
  updatedAt?: string | null;
  items: {
    slug: string;
    archetypeLabel: string;
    classKey?: string | null;
    popularity?: number | null;
    builds: { deckCode: string }[];
  }[];
};

type Archetype = Omit<PatchNotesArchetypeUse, 'decks'>;

export type PatchMetaIndex = {
  meta: PatchNotesMeta;
  /** Archetype key → builds containing the card, per card dbf id. */
  buildsByDbf: Map<number, Map<string, Set<number>>>;
  archetypes: Map<string, Archetype>;
};

/** Chips per card; the rest is said by the archetype count. */
const ARCHETYPES_PER_CARD = 8;

/**
 * Which current archetypes play each card: every build's deck code is
 * decoded once, so a card is "played" by an archetype when at least one of
 * its listed builds contains it. A format whose catalog failed is reported in
 * `meta.missing` instead of being shown as empty.
 */
export function buildPatchMetaIndex(catalogs: PatchArchetypeCatalog[], missing: PatchNotesFormat[]): PatchMetaIndex {
  const buildsByDbf = new Map<number, Map<string, Set<number>>>();
  const archetypes = new Map<string, Archetype>();
  for (const catalog of catalogs) {
    for (const item of catalog.items) {
      const key = `${catalog.format}:${item.slug}`;
      const codes = item.builds.map(build => build.deckCode).filter(Boolean);
      archetypes.set(key, {
        format: catalog.format, slug: item.slug, name: item.archetypeLabel, classKey: item.classKey ?? null,
        popularity: item.popularity ?? null, totalDecks: codes.length,
      });
      codes.forEach((code, build) => {
        let cards: [number, number][];
        try {
          cards = decode(code).cards;
        } catch {
          return;
        }
        for (const [dbf] of cards) {
          const byArchetype = buildsByDbf.get(dbf) ?? new Map<string, Set<number>>();
          const builds = byArchetype.get(key) ?? new Set<number>();
          builds.add(build);
          byArchetype.set(key, builds);
          buildsByDbf.set(dbf, byArchetype);
        }
      });
    }
  }
  const first = catalogs[0];
  return {
    meta: {
      period: first?.period ?? null,
      updatedAt: first?.updatedAt ?? null,
      formats: catalogs.map(catalog => catalog.format),
      missing,
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
