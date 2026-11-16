export type SitemapSegment =
  | 'standard-cards'
  | 'wild-cards'
  | 'battleground-minions'
  | 'battleground-spells'
  | 'battleground-heroes'
  | 'cosmetics'
  | 'guides-archive'
  | 'archetypes';

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
};

export type StoredSitemapEntry = Omit<SitemapSemanticEntry, 'dataDate'> & {
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
