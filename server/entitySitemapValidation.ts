import { createHash } from 'node:crypto';
import type {
  SemanticSitemapDocument,
  SitemapSegment,
  SitemapSemanticEntry,
  StoredSitemapEntry,
} from './entitySitemapTypes.js';

export const MAX_SITEMAP_ENTRIES = 50_000;
const SCHEMA_VERSION = 1;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const KEY_PATTERN = /^[A-Za-z0-9_]{2,80}$/;
const LASTMOD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class SitemapCandidateRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SitemapCandidateRejectedError';
  }
}

export function sitemapContentHash(
  document: Omit<SemanticSitemapDocument, 'contentHash'>,
): string {
  return createHash('sha256').update(JSON.stringify(document)).digest('hex');
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

export function normalizeSitemapCandidate(
  entries: SitemapSemanticEntry[],
  origin: string,
  segment: SitemapSegment,
): SitemapSemanticEntry[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new SitemapCandidateRejectedError('Sitemap candidate is empty or partial');
  }
  if (entries.length > MAX_SITEMAP_ENTRIES) {
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

export function validateSitemapDocument(
  value: unknown,
  origin: string,
  segment: SitemapSegment,
): SemanticSitemapDocument | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== SCHEMA_VERSION || candidate.segment !== segment) return null;
  if (!validIsoTimestamp(candidate.updatedAt)) return null;
  if (!Array.isArray(candidate.entries) || candidate.entries.length === 0
    || candidate.entries.length > MAX_SITEMAP_ENTRIES) return null;
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
    if (!KEY_PATTERN.test(key) || !entryLocationIsValid(location, origin, key, segment)
      || !HASH_PATTERN.test(semanticHash)) return null;
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
    updatedAt: candidate.updatedAt as string,
    entryCount: entries.length,
    entries,
  };
  const expectedHash = sitemapContentHash(unsigned);
  if (candidate.contentHash !== expectedHash) return null;
  return { ...unsigned, contentHash: expectedHash };
}
