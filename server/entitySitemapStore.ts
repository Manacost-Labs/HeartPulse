import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { writeJsonAtomically } from './durableJson.js';

const SCHEMA_VERSION = 1;
const MAX_ENTRIES = 50_000;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const KEY_PATTERN = /^[A-Za-z0-9_]{2,80}$/;
const LASTMOD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

export class SitemapCandidateRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SitemapCandidateRejectedError';
  }
}

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

function canonicalPayload(document: Omit<SemanticSitemapDocument, 'contentHash'>): string {
  return JSON.stringify(document);
}

function contentHash(document: Omit<SemanticSitemapDocument, 'contentHash'>): string {
  return createHash('sha256').update(canonicalPayload(document)).digest('hex');
}

function validIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function entryPathIsValid(pathname: string, key: string, segment: SitemapSegment): boolean {
  if (segment === 'standard-cards') {
    return pathname === `/standard/cards/standard/${encodeURIComponent(key)}/`;
  }
  if (segment === 'wild-cards') {
    return pathname === `/standard/cards/wild/${encodeURIComponent(key)}/`;
  }
  if (segment === 'battleground-heroes') return pathname === `/heroes/${key}/`;
  const libraryKind = segment === 'battleground-minions' ? 'minions' : 'spells';
  return pathname.startsWith(`/library/${libraryKind}/`)
    && pathname.endsWith(`-${key}/`)
    && pathname.length > `/library/${libraryKind}/-${key}/`.length;
}

function entryLocationIsValid(
  value: unknown,
  origin: string,
  key: string,
  segment: SitemapSegment,
): value is string {
  if (typeof value !== 'string' || value.length > 2_000) return false;
  try {
    const parsed = new URL(value);
    return parsed.origin === origin
      && entryPathIsValid(parsed.pathname, key, segment)
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

function normalizeCandidate(
  entries: SitemapSemanticEntry[],
  origin: string,
  segment: SitemapSegment,
): SitemapSemanticEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new SitemapCandidateRejectedError('Sitemap candidate is empty or partial');
  }
  if (entries.length > MAX_ENTRIES) {
    throw new SitemapCandidateRejectedError('Sitemap candidate exceeds 50,000 entries');
  }
  const keys = new Set<string>();
  const locations = new Set<string>();
  const normalized = entries.map(entry => ({
    key: String(entry?.key ?? ''),
    location: String(entry?.location ?? ''),
    semanticHash: String(entry?.semanticHash ?? ''),
  }));
  for (const entry of normalized) {
    if (!KEY_PATTERN.test(entry.key)) throw new SitemapCandidateRejectedError('Sitemap candidate has an invalid entity key');
    if (!entryLocationIsValid(entry.location, origin, entry.key, segment)) {
      throw new SitemapCandidateRejectedError('Sitemap candidate has an invalid canonical location');
    }
    if (!HASH_PATTERN.test(entry.semanticHash)) {
      throw new SitemapCandidateRejectedError('Sitemap candidate has an invalid semantic hash');
    }
    if (keys.has(entry.key) || locations.has(entry.location)) {
      throw new SitemapCandidateRejectedError('Sitemap candidate contains a duplicate entity');
    }
    keys.add(entry.key);
    locations.add(entry.location);
  }
  return normalized.sort((left, right) => left.key.localeCompare(right.key, 'en'));
}

function validateDocument(
  value: unknown,
  origin: string,
  segment: SitemapSegment,
): SemanticSitemapDocument | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== SCHEMA_VERSION || candidate.segment !== segment) return null;
  if (!validIsoTimestamp(candidate.updatedAt)) return null;
  if (!Array.isArray(candidate.entries) || candidate.entries.length === 0 || candidate.entries.length > MAX_ENTRIES) return null;
  if (candidate.entryCount !== candidate.entries.length) return null;

  const keys = new Set<string>();
  const locations = new Set<string>();
  const entries: StoredSitemapEntry[] = [];
  for (const rawEntry of candidate.entries) {
    if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return null;
    const raw = rawEntry as Record<string, unknown>;
    const key = typeof raw.key === 'string' ? raw.key : '';
    const location = typeof raw.location === 'string' ? raw.location : '';
    const semanticHash = typeof raw.semanticHash === 'string' ? raw.semanticHash : '';
    const lastmod = raw.lastmod;
    if (!KEY_PATTERN.test(key) || !entryLocationIsValid(location, origin, key, segment) || !HASH_PATTERN.test(semanticHash)) return null;
    if (lastmod !== undefined && (typeof lastmod !== 'string' || !LASTMOD_PATTERN.test(lastmod)
      || !Number.isFinite(Date.parse(`${lastmod}T00:00:00.000Z`)))) return null;
    if (keys.has(key) || locations.has(location)) return null;
    keys.add(key);
    locations.add(location);
    entries.push({
      key,
      location,
      semanticHash,
      ...(typeof lastmod === 'string' && lastmod ? { lastmod } : {}),
    });
  }
  const sorted = [...entries].sort((left, right) => left.key.localeCompare(right.key, 'en'));
  if (JSON.stringify(entries) !== JSON.stringify(sorted)) return null;

  const unsigned: Omit<SemanticSitemapDocument, 'contentHash'> = {
    schemaVersion: SCHEMA_VERSION,
    segment,
    updatedAt: candidate.updatedAt,
    entryCount: entries.length,
    entries,
  };
  const expectedHash = contentHash(unsigned);
  if (candidate.contentHash !== expectedHash) return null;
  return { ...unsigned, contentHash: expectedHash };
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
    this.minimumEntryCount = Math.max(1, Math.min(MAX_ENTRIES, Math.floor(options.minimumEntryCount ?? 1)));
  }

  private readFile(filename: string): SemanticSitemapDocument | null {
    const pathname = `${this.directory}/${filename}`;
    if (!existsSync(pathname)) return null;
    try {
      return validateDocument(JSON.parse(readFileSync(pathname, 'utf8')), this.origin, this.segment);
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
    const entries = normalizeCandidate(candidateEntries, this.origin, this.segment);
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
      schemaVersion: SCHEMA_VERSION,
      segment: this.segment,
      updatedAt: new Date(this.now()).toISOString(),
      entryCount: nextEntries.length,
      entries: nextEntries,
    };
    const document: SemanticSitemapDocument = { ...unsigned, contentHash: contentHash(unsigned) };
    // Mirror the complete validated LKG before making it primary. A crash at
    // either rename leaves at least one complete, checksum-valid generation.
    writeJsonAtomically(this.directory, this.recovery, document);
    writeJsonAtomically(this.directory, this.filename, document);
    return document;
  }
}
