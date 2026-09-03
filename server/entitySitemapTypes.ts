export type SitemapSegment =
  | 'standard-cards'
  | 'wild-cards'
  | 'battleground-minions'
  | 'battleground-spells'
  | 'battleground-heroes';

export type SitemapSemanticEntry = {
  key: string;
  location: string;
  semanticHash: string;
};

export type StoredSitemapEntry = SitemapSemanticEntry & {
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
