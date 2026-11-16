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
const KEY_PATTERN = /^(?:[A-Za-z0-9_]{2,80}|blizzard:[1-9][0-9]{0,18})$/;
const LASTMOD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// Editorial segments key by URL slug rather than a card ID; both stay URL-safe.
const COSMETICS_KEY_PATTERN = /^(?:heroes|coins|pets)\/[A-Za-z0-9_-]{1,100}$/;
const GUIDE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,159}$/;
// Archetype pages are keyed by their slug, exactly as the page route accepts it.
const ARCHETYPE_KEY_PATTERN = /^[a-z0-9-]{1,90}$/;

function keyIsValid(key: string, segment: SitemapSegment): boolean {
  if (segment === 'cosmetics') return COSMETICS_KEY_PATTERN.test(key);
  if (segment === 'guides-archive') return GUIDE_KEY_PATTERN.test(key);
  if (segment === 'archetypes') return ARCHETYPE_KEY_PATTERN.test(key);
  return KEY_PATTERN.test(key);
}

function validDataDate(value: unknown): value is string {
  return typeof value === 'string' && LASTMOD_PATTERN.test(value)
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

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
  if (segment === 'cosmetics') return pathname === `/cosmetics/${key}/`;
  if (segment === 'guides-archive') return pathname === `/guides-archive/${key}/`;
  if (segment === 'archetypes') return pathname === `/standard/archetypes/standard/${key}/`;
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
  const normalized: SitemapSemanticEntry[] = entries.map(entry => ({
    key: String(entry?.key ?? ''),
    location: String(entry?.location ?? ''),
    semanticHash: String(entry?.semanticHash ?? ''),
    ...(entry?.dataDate === undefined ? {} : { dataDate: entry.dataDate }),
  }));
  for (const entry of normalized) {
    if (entry.dataDate !== undefined && !validDataDate(entry.dataDate)) {
      throw new SitemapCandidateRejectedError('Sitemap candidate has an invalid data date');
    }
    if (!keyIsValid(entry.key, segment)) throw new SitemapCandidateRejectedError('Sitemap candidate has an invalid entity key');
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
    if (!keyIsValid(key, segment) || !entryLocationIsValid(location, origin, key, segment)
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
