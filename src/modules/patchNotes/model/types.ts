/**
 * `/api/patch-notes` as the browser reads it (owned by server/modules/patchNotes). The source is the Russian hs-manacost.ru article
 * that hs-data-api stores per patch: it states card changes as "До изменения: …"
 * and "После: …" lines, and Battlegrounds cost or armor changes as "a → b".
 * Nothing here is invented: a value the article does not state is absent.
 */

export type PatchNotesMode = 'constructed' | 'arena' | 'battlegrounds';

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
  name: string;
  mode: PatchNotesMode;
  /** Resolved collectible card, when the name matches exactly one card name. */
  cardId: string | null;
  /** HearthstoneJSON class enum of the resolved card (`WARRIOR`, `NEUTRAL`…). */
  cardClass: string | null;
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

export type PatchNotesDetail = PatchNotesSummary & {
  summary: string | null;
  entries: PatchNotesEntry[];
  /** Entries whose article text had a new value but no "before" value. */
  missingBefore: number;
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
