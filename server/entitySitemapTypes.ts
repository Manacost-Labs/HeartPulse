export type SitemapSegment =
  | 'standard-cards'
  | 'wild-cards'
  | 'battleground-minions'
  | 'battleground-spells'
  | 'battleground-heroes'
  | 'cosmetics'
  | 'guides-archive'
  | 'archetypes'
  /** Class pages of Standard decks (`/standard/decks/<class>/`) above the content threshold. */
  | 'decks'
  /** Internal: dates the static pages; it has no sitemap of its own. */
  | 'static-pages';

export type SitemapSemanticEntry = {
  key: string;
  location: string;
  semanticHash: string;
  /**
   * UTC day (`YYYY-MM-DD`) the entity's data was produced by its source. A
   * segment whose source states it hands it over here, and a new or changed
   * entry takes it as `lastmod` instead of the day the server noticed the
   * change. It is a hint of the candidate and is never stored.
   */
  dataDate?: string;
  /**
   * UTC day the entity itself came into being (a guide's publication day).
   * It dates an address the store sees for the first time when the source
   * states no `dataDate` (which is the later day and wins when both are set);
   * a later change of the entity is dated by `dataDate` or the day it is seen.
   */
  createdOn?: string;
};

export type StoredSitemapEntry = Omit<SitemapSemanticEntry, 'dataDate' | 'createdOn'> & {
  /** Always written by the store; optional only for documents saved before it dated every entry. */
  lastmod?: string;
};

export type SemanticSitemapDocument = {
  schemaVersion: 1;
  segment: SitemapSegment;
  updatedAt: string;
  entryCount: number;
  entries: StoredSitemapEntry[];
  contentHash: string;
};
