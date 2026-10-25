/**
 * `/api/patch-notes` as the browser reads it (owned by server/modules/patchNotes). The source is the Russian hs-manacost.ru article
 * that hs-data-api stores per patch: it states card changes as "До изменения: …"
 * and "После: …" lines, and Battlegrounds cost or armor changes as "a → b".
 * Nothing here is invented: a value the article does not state is absent.
 */

/** `other` is a retired or side mode (Duels, Twist, Mercenaries); its entry subtitle names it. */
export type PatchNotesMode = 'constructed' | 'arena' | 'battlegrounds' | 'other';

/** One stated value change. `before` is absent when the article gives only the new value. */
export type PatchNotesChange = {
  label: string;
  before?: number | string;
  after?: number | string;
  /** Which direction helps the player; present only for numbers with a known direction. */
  better?: 'higher' | 'lower';
};

export type PatchNotesEntry = {
  id: string;
  /** Russian name: the article's, or the catalog's when the article names the card in English. */
  name: string;
  /** The article's own spelling when it differs from `name` (Battlegrounds trinket lists are in English). */
  sourceName: string | null;
  mode: PatchNotesMode;
  /**
   * Resolved card: a collectible card matched by its exact Russian name, or a
   * Battlegrounds card matched by its Russian or English catalog name.
   */
  cardId: string | null;
  /** HearthstoneJSON class enum of the resolved card (`WARRIOR`, `NEUTRAL`…). */
  cardClass: string | null;
  /** Lower-case card type of the resolved card: `minion`, `spell`, `weapon`, `trinket`, `hero`… */
  cardType: string | null;
  /** Full card render from the Battlegrounds catalog; Constructed cards use the HearthstoneJSON render. */
  renderUrl: string | null;
  /** Hearthstone Wiki full illustration of a resolved Constructed card; absent from older responses. */
  artwork?: PatchNotesArtwork | null;
  /**
   * Today's format of a resolved Constructed card: `standard` when the
   * Standard catalog lists it, else `wild`; `null` when unknown.
   */
  format: PatchNotesFormat | null;
  /** Archetypes of the day before the patch whose listed builds play the card (Constructed only). */
  archetypes: PatchNotesArchetypeUse[];
  /** Earlier patches of the archive that changed the same card, newest first. */
  history: PatchNotesHistoryItem[];
  /** Line under the name: "Малый аксессуар", "Броня героя". */
  subtitle: string | null;
  changes: PatchNotesChange[];
  /** Developer comment printed right under the card name. */
  note: string | null;
};

export type PatchNotesSummary = {
  /** Short game version: "36.6.3". */
  version: string;
  /** Full client build: "36.6.3.253932". */
  build: string;
  title: string;
  publishedAt: string | null;
  sourceUrl: string | null;
  officialUrl: string | null;
  changeCount: number;
};

export type PatchNotesFormat = 'standard' | 'wild';

/** A card illustration with its original size; dimensions are `null` when the catalog does not state them. */
export type PatchNotesArtwork = { url: string; width: number | null; height: number | null };

/** One archetype of the patch's snapshot that plays a changed card: `decks` of its `totalDecks` listed builds. */
export type PatchNotesArchetypeUse = {
  format: PatchNotesFormat;
  slug: string;
  name: string;
  classKey: string | null;
  popularity: number | null;
  decks: number;
  totalDecks: number;
};

export type PatchNotesHistoryItem = { version: string; entryId: string; publishedAt: string | null };

/**
 * Where meta impact comes from: the site's archetype catalogs as they were on
 * the Moscow day before the patch (`day`), pinned when the patch came out.
 * `missing` lists formats without a snapshot of that day.
 */
export type PatchNotesMeta = {
  /** `YYYY-MM-DD`, the day of the data. */
  day: string;
  period: string | null;
  updatedAt: string | null;
  formats: PatchNotesFormat[];
  missing: PatchNotesFormat[];
};

/** An article heading of changes that the article shows only as pictures, so no entry carries them. */
export type PatchNotesPictureSection = { mode: PatchNotesMode; title: string };

/** Rule changes the article states as plain sentences under a "general changes" heading. */
export type PatchNotesGeneralChanges = { mode: PatchNotesMode; lines: string[] };

export type PatchNotesDetail = PatchNotesSummary & {
  summary: string | null;
  entries: PatchNotesEntry[];
  /** Entries whose article text had a new value but no "before" value. */
  missingBefore: number;
  pictureSections: PatchNotesPictureSection[];
  generalChanges: PatchNotesGeneralChanges[];
  /** `null` when no snapshot of the day before the patch was kept: the patch then lists no archetypes. */
  meta: PatchNotesMeta | null;
};

export type PatchNotesArchive = {
  patches: PatchNotesSummary[];
  updatedAt: string;
};

/** "36.6.3" from "36.6.3.253932" or "36.6.3"; "37.0" reads as "37.0.0"; anything else is empty. */
export function normalizePatchVersion(value: unknown): string {
  const match = String(value ?? '').match(/^(\d{1,3})\.(\d{1,3})(?:\.(\d{1,3}))?(?:\.\d+)?$/);
  return match ? `${match[1]}.${match[2]}.${match[3] ?? 0}` : '';
}
