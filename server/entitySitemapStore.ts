import { existsSync, readFileSync } from 'node:fs';
import { writeJsonAtomically } from './durableJson.js';
import {
  MAX_SITEMAP_ENTRIES,
  normalizeSitemapCandidate,
  SitemapCandidateRejectedError,
  sitemapContentHash,
  validateSitemapDocument,
} from './entitySitemapValidation.js';
import type {
  SemanticSitemapDocument,
  SitemapSegment,
  SitemapSemanticEntry,
  StoredSitemapEntry,
} from './entitySitemapTypes.js';

export type {
  SemanticSitemapDocument,
  SitemapSegment,
  SitemapSemanticEntry,
  StoredSitemapEntry,
} from './entitySitemapTypes.js';

export { SitemapCandidateRejectedError };

type StoreOptions = {
  directory: string;
  filename?: string;
  segment?: SitemapSegment;
  canonicalOrigin?: string;
  now?: () => number;
  collapseRatio?: number;
  minimumEntryCount?: number;
};

function normalizedOrigin(value: string | undefined): string {
  try {
    const parsed = new URL(value ?? 'https://hearthpulse.net');
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('unsupported protocol');
    return parsed.origin;
  } catch {
    return 'https://hearthpulse.net';
  }
}

function recoveryFilename(filename: string): string {
  return filename.replace(/\.json$/i, '.lkg.json');
}


export class SemanticSitemapStore {
  private readonly directory: string;
  private readonly filename: string;
  private readonly recovery: string;
  private readonly segment: SitemapSegment;
  private readonly origin: string;
  private readonly now: () => number;
  private readonly collapseRatio: number;
  private readonly minimumEntryCount: number;

  constructor(options: StoreOptions) {
    this.directory = options.directory;
    this.segment = options.segment ?? 'standard-cards';
    this.filename = options.filename ?? `seo-${this.segment}-sitemap-v1.json`;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(this.filename)) throw new Error('unsafe sitemap store filename');
    this.recovery = recoveryFilename(this.filename);
    this.origin = normalizedOrigin(options.canonicalOrigin);
    this.now = options.now ?? Date.now;
    this.collapseRatio = Math.max(0.5, Math.min(0.95, options.collapseRatio ?? 0.9));
    this.minimumEntryCount = Math.max(1, Math.min(MAX_SITEMAP_ENTRIES, Math.floor(options.minimumEntryCount ?? 1)));
  }

  private readFile(filename: string): SemanticSitemapDocument | null {
    const pathname = `${this.directory}/${filename}`;
    if (!existsSync(pathname)) return null;
    try {
      return validateSitemapDocument(JSON.parse(readFileSync(pathname, 'utf8')), this.origin, this.segment);
    } catch {
      return null;
    }
  }

  readLastKnownGood(): SemanticSitemapDocument | null {
    const documents = [this.readFile(this.filename), this.readFile(this.recovery)]
      .filter((document): document is SemanticSitemapDocument => Boolean(document));
    return documents.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] ?? null;
  }

  publish(candidateEntries: SitemapSemanticEntry[]): SemanticSitemapDocument {
    const entries = normalizeSitemapCandidate(candidateEntries, this.origin, this.segment);
    if (entries.length < this.minimumEntryCount) {
      throw new SitemapCandidateRejectedError(
        `Sitemap candidate is partial: ${entries.length}/${this.minimumEntryCount} minimum entries`,
      );
    }
    const current = this.readLastKnownGood();
    if (current && current.entryCount >= 2 && entries.length < Math.ceil(current.entryCount * this.collapseRatio)) {
      throw new SitemapCandidateRejectedError(
        `Sitemap candidate count collapse: ${entries.length}/${current.entryCount}`,
      );
    }

    const previousByKey = new Map(current?.entries.map(entry => [entry.key, entry]) ?? []);
    const today = new Date(this.now()).toISOString().slice(0, 10);
    const nextEntries: StoredSitemapEntry[] = entries.map(entry => {
      const previous = previousByKey.get(entry.key);
      if (!previous) return entry;
      if (previous.semanticHash === entry.semanticHash) {
        return { ...entry, ...(previous.lastmod ? { lastmod: previous.lastmod } : {}) };
      }
      return { ...entry, lastmod: today };
    });

    if (current && JSON.stringify(current.entries) === JSON.stringify(nextEntries)) {
      const primary = this.readFile(this.filename);
      const recovery = this.readFile(this.recovery);
      if (recovery?.contentHash !== current.contentHash) {
        writeJsonAtomically(this.directory, this.recovery, current);
      }
      if (primary?.contentHash !== current.contentHash) {
        writeJsonAtomically(this.directory, this.filename, current);
      }
      return current;
    }

    const unsigned: Omit<SemanticSitemapDocument, 'contentHash'> = {
      schemaVersion: 1,
      segment: this.segment,
      updatedAt: new Date(this.now()).toISOString(),
      entryCount: nextEntries.length,
      entries: nextEntries,
    };
    const document: SemanticSitemapDocument = { ...unsigned, contentHash: sitemapContentHash(unsigned) };
    // Mirror the complete validated LKG before making it primary. A crash at
    // either rename leaves at least one complete, checksum-valid generation.
    writeJsonAtomically(this.directory, this.recovery, document);
    writeJsonAtomically(this.directory, this.filename, document);
    return document;
  }
}
