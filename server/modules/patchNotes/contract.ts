/**
 * Public patch-notes projection. Sources are stored Russian hs-manacost.ru articles
 * and reviewed official-note transcriptions: they state card changes as "До изменения: …"
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
  /** Hearthstone Wiki full illustration of a resolved Constructed card, from the site's card catalog. */
  artwork: PatchNotesArtwork | null;
  /**
   * Today's format of a resolved Constructed card: `standard` when the
   * Standard catalog lists it, else `wild`; `null` when unknown.
   */
  format: PatchNotesFormat | null;
  /**
   * The card as it looked before and after this patch: absolute archive URLs of the card-history
   * (`api.kolodahearthstone.com/uploads/card-history-media/…`). Both are `null` unless the history holds a
   * version on each side of the patch whose picture differs; one side is never filled alone.
   */
  beforeRenderUrl: string | null;
  afterRenderUrl: string | null;
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

/** A card named inside a general-changes line: characters `start`–`end` of `lines[line]`. */
export type PatchNotesMention = {
  line: number;
  start: number;
  end: number;
  cardId: string;
  /** The card's own name, as the catalog spells it (the line may use another case). */
  name: string;
  /** Catalog render of a Battlegrounds card; `null` for a Constructed card, which the site renders itself. */
  renderUrl: string | null;
};

/** Rule changes the article states as plain sentences under a "general changes" heading. */
export type PatchNotesGeneralChanges = { mode: PatchNotesMode; lines: string[]; marks?: PatchNotesMention[] };

/** One card in a pool rotation list: removed, added or returning. */
export type PatchNotesPoolItem = {
  name: string;
  sourceName?: string | null;
  cardId?: string | null;
  cardType?: string | null;
  renderUrl?: string | null;
  tier?: number | null;
  cost?: number | null;
  tribe?: string | null;
  stats?: string | null;
  text?: string | null;
};

/** One category of pool changes (e.g. Battlegrounds minions, tavern spells, timewarp, trinkets). */
export type PatchNotesPoolGroup = {
  id: string;
  mode: PatchNotesMode;
  title: string;
  note?: string | null;
  removed?: PatchNotesPoolItem[];
  added?: PatchNotesPoolItem[];
  returning?: PatchNotesPoolItem[];
};

/** A patch illustration stored with the site under `/assets/patch-notes/`. */
export type PatchNotesSectionImage = { url: string; alt: string; shape: 'banner' | 'card'; width?: number; height?: number };

/** One card or sub-group inside a structured patch overview/event/bugfix section. */
export type PatchNotesHighlightItem = {
  title: string;
  meta?: string | null;
  body?: string | null;
  bullets?: string[];
  marks?: PatchNotesMention[];
  /** Cards, heroes or hero powers the item is about, shown as pictures. */
  cards?: PatchNotesPoolItem[];
  /** Illustrations of the item (translated card overviews, event banners), in reading order. */
  images?: PatchNotesSectionImage[];
};

/** Rich non-diff section of a major patch (new mechanics, heroes, events, rewards track, cosmetics, bug fixes). */
export type PatchNotesContentSection = {
  id: string;
  mode: PatchNotesMode;
  title: string;
  subtitle?: string | null;
  kind: 'cards' | 'list' | 'table';
  /** Wide official artwork shown under the section heading. */
  banner?: PatchNotesSectionImage | null;
  collapsedByDefault?: boolean;
  items?: PatchNotesHighlightItem[];
  columns?: string[];
  rows?: string[][];
  footnote?: string | null;
};

export type PatchNotesDetail = PatchNotesSummary & {
  summary: string | null;
  entries: PatchNotesEntry[];
  /** Entries whose article text had a new value but no "before" value. */
  missingBefore: number;
  pictureSections: PatchNotesPictureSection[];
  generalChanges: PatchNotesGeneralChanges[];
  /** Pool rotations (removed, newly added, returning cards) for major season patches. */
  poolChanges?: PatchNotesPoolGroup[];
  /** Structured overview, event, rewards, cosmetics and bug-fix sections for major patches. */
  sections?: PatchNotesContentSection[];
  /** `null` when no snapshot of the day before the patch was kept: the patch then lists no archetypes. */
  meta: PatchNotesMeta | null;
};

export type PatchNotesArchive = {
  patches: PatchNotesSummary[];
  updatedAt: string;
};

/** "36.6.3" from "36.6.3.253932", "Patch 36.6.3" or "36.6.3"; "37.0" reads as "37.0.0". */
export function shortPatchVersion(value: unknown): string {
  const match = String(value ?? '').match(/(\d{1,3})\.(\d{1,3})(?:\.(\d{1,3}))?/);
  return match ? `${match[1]}.${match[2]}.${match[3] ?? 0}` : '';
}
