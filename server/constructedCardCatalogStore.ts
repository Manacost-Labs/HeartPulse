import { createHash } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomically } from './durableJson.js';

export type ConstructedCardCatalogFormat = 'standard' | 'wild';
type JsonRecord = Record<string, any>;

export type ConstructedCardCatalogDocument = {
  schemaVersion: 1;
  format: ConstructedCardCatalogFormat;
  datasetVersion: string;
  sourceUpdatedAt: string | null;
  verifiedAt: string;
  publishedAt: string;
  count: number;
  cards: JsonRecord[];
};

export type ConstructedCardCatalogInspection = {
  state: 'fresh' | 'stale' | 'expired' | 'missing';
  document: ConstructedCardCatalogDocument | null;
  ageMs: number | null;
  repairWarning: string | null;
};

export class ConstructedCardCatalogCandidateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConstructedCardCatalogCandidateError';
  }
}

type StoreOptions = {
  stateDirectory: string;
  now?: () => number;
  maxStaleMs?: number;
  minimumContinuityRatio?: number;
  minimumCardCountByFormat?: Partial<Record<ConstructedCardCatalogFormat, number>>;
  freshWindowMs?: number;
  writeJson?: typeof writeJsonAtomically;
  removeFileDurably?: (dataDirectory: string, filename: string) => void;
};

type PublishMetadata = {
  expectedTotal?: number;
  sourceUpdatedAt?: string | null;
  controlledExpansion?: boolean;
};

const SCHEMA_VERSION = 1;
const STORE_DIRECTORY = 'constructed-card-catalog-v1';
const DATASET_VERSION_PATTERN = /^ccc1-sha256:[a-f0-9]{64}$/;
const CARD_ID_PATTERN = /^[A-Za-z0-9_]{2,80}$/;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const DEFAULT_MAX_STALE_MS = 48 * 60 * 60_000;
const MIN_MAX_STALE_MS = 60 * 60_000;
const MAX_MAX_STALE_MS = 7 * 24 * 60 * 60_000;
const MAX_CARDS = 20_000;
const MAX_SERIALIZED_CARDS_BYTES = 64 * 1024 * 1024;
const DEFAULT_MINIMUM_CARD_COUNT: Record<ConstructedCardCatalogFormat, number> = {
  standard: 500,
  wild: 1_000,
};
// Compare against the smaller membership set so a normal rotation can replace
// up to half of Standard while a same-size Standard/Wild swap still fails.
const MINIMUM_ID_OVERLAP_RATIO = 0.5;
// Normal releases stay well below +50%. Larger migrations require the
// server-internal controlledExpansion flag; it is never read from user input.
const MAXIMUM_WARM_GROWTH_RATIO = 1.5;
const AMBIGUOUS_COLD_WILD_MINIMUM = 3_000;
const REDUNDANCY_WARNING = 'Constructed card catalog redundancy is degraded';
const PRIVATE_CARD_KEYS = new Set([
  'stats', 'statistics', 'deck', 'decks', 'deckcode', 'deck_code',
  'entitlement', 'entitlements', 'subscription', 'subscriptions',
  'statsaccess', 'stats_access', 'user', 'users', 'session', 'email',
]);

function finiteTimestamp(value: unknown, now: number, nullable = false): string | null {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > now + MAX_FUTURE_SKEW_MS) return null;
  return new Date(parsed).toISOString();
}

function sanitizeRawValue(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.map(item => sanitizeRawValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => item !== undefined
        && (depth > 0 || !PRIVATE_CARD_KEYS.has(key.toLocaleLowerCase('en-US'))))
      .map(([key, item]) => [key, sanitizeRawValue(item, depth + 1)]));
  }
  return value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new ConstructedCardCatalogCandidateError('Constructed card catalog contains a non-finite number');
  }
  return value;
}

function normalizedCards(rawCards: unknown): JsonRecord[] {
  if (!Array.isArray(rawCards) || rawCards.length === 0) {
    throw new ConstructedCardCatalogCandidateError('Constructed card catalog candidate is empty');
  }
  const ids = new Set<string>();
  const dbfs = new Set<number>();
  const cards = rawCards.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ConstructedCardCatalogCandidateError('Constructed card catalog contains an invalid card');
    }
    const canonical = canonicalize(sanitizeRawValue(raw)) as JsonRecord;
    const cardId = String(canonical.card_id ?? '').trim();
    if (!CARD_ID_PATTERN.test(cardId)) {
      throw new ConstructedCardCatalogCandidateError('Constructed card catalog contains an empty or invalid identity');
    }
    const normalizedId = cardId.toUpperCase();
    if (ids.has(normalizedId)) {
      throw new ConstructedCardCatalogCandidateError(`Constructed card catalog contains duplicate card ID ${cardId}`);
    }
    ids.add(normalizedId);
    const dbf = Number(canonical.dbf);
    if (canonical.dbf !== null && canonical.dbf !== undefined && canonical.dbf !== '') {
      if (!Number.isSafeInteger(dbf) || dbf <= 0) {
        throw new ConstructedCardCatalogCandidateError(`Constructed card catalog contains an invalid DBF for ${cardId}`);
      }
      if (dbfs.has(dbf)) {
        throw new ConstructedCardCatalogCandidateError(`Constructed card catalog contains duplicate DBF ${dbf}`);
      }
      dbfs.add(dbf);
    }
    return { ...canonical, card_id: cardId };
  });
  const sorted = cards.sort((left, right) => String(left.card_id).localeCompare(String(right.card_id), 'en', {
    numeric: true,
    sensitivity: 'base',
  }));
  if (sorted.length > MAX_CARDS) {
    throw new ConstructedCardCatalogCandidateError(`Constructed card catalog exceeds ${MAX_CARDS} cards`);
  }
  if (Buffer.byteLength(JSON.stringify(sorted), 'utf8') > MAX_SERIALIZED_CARDS_BYTES) {
    throw new ConstructedCardCatalogCandidateError('Constructed card catalog exceeds the 64 MiB raw snapshot limit');
  }
  return sorted;
}

function datasetVersion(cards: JsonRecord[]): string {
  const digest = createHash('sha256').update(JSON.stringify(cards)).digest('hex');
  return `ccc1-sha256:${digest}`;
}

function collectFormatEvidence(value: unknown, evidence: Set<ConstructedCardCatalogFormat>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectFormatEvidence(item, evidence);
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['slug', 'name', 'id', 'name_en', 'name_ru']) {
      collectFormatEvidence(record[key], evidence);
    }
    return;
  }
  if (typeof value === 'number') {
    if (value === 1) evidence.add('wild');
    if (value === 2) evidence.add('standard');
    return;
  }
  const normalized = String(value ?? '').trim().toLocaleLowerCase('en-US');
  if (normalized === '1' || normalized === 'wild' || normalized === 'вольный') evidence.add('wild');
  if (normalized === '2' || normalized === 'standard' || normalized === 'стандарт' || normalized === 'стандартный') {
    evidence.add('standard');
  }
}

function formatEvidence(card: JsonRecord): Set<ConstructedCardCatalogFormat> {
  const evidence = new Set<ConstructedCardCatalogFormat>();
  collectFormatEvidence(card?.format, evidence);
  collectFormatEvidence(card?.game_format, evidence);
  collectFormatEvidence(card?.formats, evidence);
  return evidence;
}

function removeFileDurably(dataDirectory: string, filename: string): void {
  const pathname = join(dataDirectory, filename);
  try {
    unlinkSync(pathname);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const directoryDescriptor = openSync(dataDirectory, 'r');
  try {
    fsyncSync(directoryDescriptor);
  } finally {
    closeSync(directoryDescriptor);
  }
}

function sameDocument(
  left: ConstructedCardCatalogDocument | null,
  right: ConstructedCardCatalogDocument | null,
): boolean {
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
}

function validateDocument(
  raw: unknown,
  expectedFormat: ConstructedCardCatalogFormat,
  now: number,
  minimumCardCount: number,
): ConstructedCardCatalogDocument | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== SCHEMA_VERSION || value.format !== expectedFormat) return null;
  if (!DATASET_VERSION_PATTERN.test(String(value.datasetVersion ?? ''))) return null;
  const verifiedAt = finiteTimestamp(value.verifiedAt, now);
  const publishedAt = finiteTimestamp(value.publishedAt, now);
  const sourceUpdatedAt = finiteTimestamp(value.sourceUpdatedAt, now, true);
  if (!verifiedAt || !publishedAt || (value.sourceUpdatedAt !== null && !sourceUpdatedAt)) return null;
  if (Date.parse(publishedAt) > Date.parse(verifiedAt) + MAX_FUTURE_SKEW_MS) return null;
  let cards: JsonRecord[];
  try {
    cards = normalizedCards(value.cards);
  } catch {
    return null;
  }
  if (cards.length < minimumCardCount) return null;
  if (value.count !== cards.length) return null;
  const expectedVersion = datasetVersion(cards);
  if (value.datasetVersion !== expectedVersion) return null;
  return {
    schemaVersion: SCHEMA_VERSION,
    format: expectedFormat,
    datasetVersion: expectedVersion,
    sourceUpdatedAt,
    verifiedAt,
    publishedAt,
    count: cards.length,
    cards,
  };
}

function configuredMaxStaleMs(explicit: number | undefined): number {
  const envHours = Number(process.env.CONSTRUCTED_CARD_CATALOG_MAX_STALE_HOURS);
  const requested = Number.isFinite(explicit)
    ? explicit!
    : Number.isFinite(envHours) ? envHours * 60 * 60_000 : DEFAULT_MAX_STALE_MS;
  return Math.max(MIN_MAX_STALE_MS, Math.min(MAX_MAX_STALE_MS, Math.floor(requested)));
}

export class ConstructedCardCatalogStore {
  private readonly directory: string;
  private readonly now: () => number;
  private readonly maxStaleMs: number;
  private readonly continuityRatio: number;
  private readonly minimumCardCount: Record<ConstructedCardCatalogFormat, number>;
  private readonly freshWindowMs: number;
  private readonly writeJson: typeof writeJsonAtomically;
  private readonly removeFileDurably: (dataDirectory: string, filename: string) => void;
  private readonly ambiguousColdWildMinimum: number;
  private readonly transientDegradedFormats = new Set<ConstructedCardCatalogFormat>();

  constructor(options: StoreOptions) {
    this.directory = join(options.stateDirectory, STORE_DIRECTORY);
    this.now = options.now ?? Date.now;
    this.maxStaleMs = configuredMaxStaleMs(options.maxStaleMs);
    this.continuityRatio = Math.max(0.7, Math.min(0.95, options.minimumContinuityRatio ?? 0.7));
    this.minimumCardCount = {
      standard: Math.max(1, Math.min(MAX_CARDS, Math.floor(
        options.minimumCardCountByFormat?.standard ?? DEFAULT_MINIMUM_CARD_COUNT.standard,
      ))),
      wild: Math.max(1, Math.min(MAX_CARDS, Math.floor(
        options.minimumCardCountByFormat?.wild ?? DEFAULT_MINIMUM_CARD_COUNT.wild,
      ))),
    };
    this.freshWindowMs = Math.max(1_000, Math.min(15 * 60_000, Math.floor(options.freshWindowMs ?? 5 * 60_000)));
    this.writeJson = options.writeJson ?? writeJsonAtomically;
    this.removeFileDurably = options.removeFileDurably ?? removeFileDurably;
    this.ambiguousColdWildMinimum = options.minimumCardCountByFormat?.wild === undefined
      ? AMBIGUOUS_COLD_WILD_MINIMUM
      : this.minimumCardCount.wild;
  }

  private filename(format: ConstructedCardCatalogFormat): string {
    return `${format}.json`;
  }

  private recoveryFilename(format: ConstructedCardCatalogFormat): string {
    return `${format}.lkg.json`;
  }

  private markerFilename(format: ConstructedCardCatalogFormat): string {
    return `${format}.degraded.json`;
  }

  private markerExistsOnDisk(format: ConstructedCardCatalogFormat): boolean {
    return existsSync(join(this.directory, this.markerFilename(format)));
  }

  private hasDegradedMarker(format: ConstructedCardCatalogFormat): boolean {
    return this.markerExistsOnDisk(format) || this.transientDegradedFormats.has(format);
  }

  private markerDocument(format: ConstructedCardCatalogFormat, document: ConstructedCardCatalogDocument): JsonRecord {
    return {
      schemaVersion: SCHEMA_VERSION,
      format,
      datasetVersion: document.datasetVersion,
      createdAt: new Date(this.now()).toISOString(),
    };
  }

  private writeDegradedMarker(format: ConstructedCardCatalogFormat, document: ConstructedCardCatalogDocument): void {
    this.writeJson(this.directory, this.markerFilename(format), this.markerDocument(format, document));
  }

  private clearDegradedMarker(format: ConstructedCardCatalogFormat, document: ConstructedCardCatalogDocument): boolean {
    try {
      this.removeFileDurably(this.directory, this.markerFilename(format));
      this.transientDegradedFormats.delete(format);
      return true;
    } catch {
      this.transientDegradedFormats.add(format);
      // An injected/default remover may fail after unlink. Restore the marker
      // atomically so a restart cannot silently report the uncertain commit as fresh.
      if (!this.markerExistsOnDisk(format)) {
        try {
          this.writeDegradedMarker(format, document);
        } catch {
          // The transient flag keeps this process degraded; the durable marker
          // remains the primary restart contract whenever the filesystem permits.
        }
      }
      return false;
    }
  }

  private readFile(format: ConstructedCardCatalogFormat, filename: string): ConstructedCardCatalogDocument | null {
    const pathname = join(this.directory, filename);
    if (!existsSync(pathname)) return null;
    try {
      return validateDocument(
        JSON.parse(readFileSync(pathname, 'utf8')),
        format,
        this.now(),
        this.minimumCardCount[format],
      );
    } catch {
      return null;
    }
  }

  private readCopies(format: ConstructedCardCatalogFormat): {
    primary: ConstructedCardCatalogDocument | null;
    recovery: ConstructedCardCatalogDocument | null;
  } {
    return {
      primary: this.readFile(format, this.filename(format)),
      recovery: this.readFile(format, this.recoveryFilename(format)),
    };
  }

  private readAuthoritative(format: ConstructedCardCatalogFormat): ConstructedCardCatalogDocument | null {
    const { primary, recovery } = this.readCopies(format);
    return primary ?? recovery;
  }

  private redundancyWarning(
    format: ConstructedCardCatalogFormat,
    primary: ConstructedCardCatalogDocument | null,
    recovery: ConstructedCardCatalogDocument | null,
  ): string | null {
    return this.hasDegradedMarker(format) || !sameDocument(primary, recovery)
      ? REDUNDANCY_WARNING
      : null;
  }

  inspect(format: ConstructedCardCatalogFormat): ConstructedCardCatalogInspection {
    const { primary, recovery } = this.readCopies(format);
    const document = primary ?? recovery;
    if (!document) return { state: 'missing', document: null, ageMs: null, repairWarning: null };
    const repairWarning = this.redundancyWarning(format, primary, recovery);
    const ageMs = Math.max(0, this.now() - Date.parse(document.verifiedAt));
    if (ageMs > this.maxStaleMs) return { state: 'expired', document, ageMs, repairWarning };
    return {
      state: repairWarning || ageMs > this.freshWindowMs ? 'stale' : 'fresh',
      document,
      ageMs,
      repairWarning,
    };
  }

  readUsable(format: ConstructedCardCatalogFormat): {
    document: ConstructedCardCatalogDocument;
    ageMs: number;
    repairWarning: string | null;
  } | null {
    const { primary, recovery } = this.readCopies(format);
    const document = primary ?? recovery;
    if (!document) return null;
    const ageMs = Math.max(0, this.now() - Date.parse(document.verifiedAt));
    if (ageMs > this.maxStaleMs) return null;
    let repairFailed = false;
    const repairNeeded = this.hasDegradedMarker(format) || !sameDocument(primary, recovery);
    if (repairNeeded && !this.markerExistsOnDisk(format)) {
      try {
        this.writeDegradedMarker(format, document);
      } catch {
        // Serving can continue from a checksum-valid copy. If repair also
        // fails, the mismatched copies remain a durable degradation signal.
      }
    }
    if (!sameDocument(primary, document)) {
      try {
        this.writeJson(this.directory, this.filename(format), document);
      } catch {
        const repairedPrimary = this.readFile(format, this.filename(format));
        if (!sameDocument(repairedPrimary, document)) repairFailed = true;
      }
    }
    if (!sameDocument(recovery, document)) {
      try {
        this.writeJson(this.directory, this.recoveryFilename(format), document);
      } catch {
        const repairedRecovery = this.readFile(format, this.recoveryFilename(format));
        if (!sameDocument(repairedRecovery, document)) repairFailed = true;
      }
    }
    const repairedCopies = this.readCopies(format);
    if (!sameDocument(repairedCopies.primary, repairedCopies.recovery)) repairFailed = true;
    if (!repairFailed && repairNeeded && !this.clearDegradedMarker(format, document)) repairFailed = true;
    const repairWarning = repairFailed || this.hasDegradedMarker(format) ? REDUNDANCY_WARNING : null;
    return { document, ageMs, repairWarning };
  }

  publish(
    format: ConstructedCardCatalogFormat,
    candidateCards: unknown[],
    metadata: PublishMetadata = {},
  ): ConstructedCardCatalogDocument {
    const cards = normalizedCards(candidateCards);
    const cardFormatEvidence = cards.map(formatEvidence);
    if (cardFormatEvidence.some(evidence => evidence.size > 0 && !evidence.has(format))) {
      throw new ConstructedCardCatalogCandidateError(
        `Constructed card catalog format evidence contradicts the requested ${format} format`,
      );
    }
    if (cards.length < this.minimumCardCount[format]) {
      throw new ConstructedCardCatalogCandidateError(
        `Constructed card catalog is implausibly small: ${cards.length}/${this.minimumCardCount[format]} minimum`,
      );
    }
    if (metadata.expectedTotal !== undefined
      && (!Number.isSafeInteger(metadata.expectedTotal) || metadata.expectedTotal < 1 || metadata.expectedTotal !== cards.length)) {
      throw new ConstructedCardCatalogCandidateError(
        `Constructed card catalog total mismatch: ${cards.length}/${String(metadata.expectedTotal)}`,
      );
    }
    const current = this.readAuthoritative(format);
    if (!current && format === 'wild' && cards.length < this.ambiguousColdWildMinimum) {
      throw new ConstructedCardCatalogCandidateError(
        `Constructed card catalog is an ambiguous Wild cold start: ${cards.length}/${this.ambiguousColdWildMinimum}`,
      );
    }
    if (current && cards.length < Math.ceil(current.count * this.continuityRatio)) {
      throw new ConstructedCardCatalogCandidateError(
        `Constructed card catalog count collapse: ${cards.length}/${current.count}`,
      );
    }
    if (current) {
      const currentIds = new Set(current.cards.map(card => String(card.card_id).toUpperCase()));
      const overlap = cards.reduce((count, card) => count + (currentIds.has(String(card.card_id).toUpperCase()) ? 1 : 0), 0);
      const overlapRatio = overlap / Math.max(1, Math.min(current.count, cards.length));
      if (overlapRatio < MINIMUM_ID_OVERLAP_RATIO) {
        throw new ConstructedCardCatalogCandidateError(
          `Constructed card catalog ID overlap is too small: ${overlap}/${Math.min(current.count, cards.length)}`,
        );
      }
      if (!metadata.controlledExpansion && cards.length > Math.ceil(current.count * MAXIMUM_WARM_GROWTH_RATIO)) {
        throw new ConstructedCardCatalogCandidateError(
          `Constructed card catalog growth is implausible: ${cards.length}/${current.count}`,
        );
      }
    }
    const currentTime = this.now();
    const verifiedAt = new Date(currentTime).toISOString();
    const sourceUpdatedAt = metadata.sourceUpdatedAt
      ? finiteTimestamp(metadata.sourceUpdatedAt, currentTime)
      : current?.sourceUpdatedAt ?? null;
    if (metadata.sourceUpdatedAt && !sourceUpdatedAt) {
      throw new ConstructedCardCatalogCandidateError('Constructed card catalog source timestamp is invalid or in the future');
    }
    const version = datasetVersion(cards);
    const document: ConstructedCardCatalogDocument = {
      schemaVersion: SCHEMA_VERSION,
      format,
      datasetVersion: version,
      sourceUpdatedAt,
      verifiedAt,
      publishedAt: current?.datasetVersion === version ? current.publishedAt : verifiedAt,
      count: cards.length,
      cards,
    };
    // A durable marker must exist before the authoritative primary can change.
    // Failure here aborts with the prior primary/recovery pair untouched.
    this.writeDegradedMarker(format, document);

    // The primary file is the commit point. If its atomic rename fails before
    // becoming readable, the prior primary remains authoritative.
    try {
      this.writeJson(this.directory, this.filename(format), document);
    } catch (error) {
      // writeJsonAtomically can fail while fsyncing the directory after rename.
      // In that case the new primary is already the readable commit point.
      const readablePrimary = this.readFile(format, this.filename(format));
      if (!sameDocument(readablePrimary, document)) throw error;
    }
    try {
      this.writeJson(this.directory, this.recoveryFilename(format), document);
    } catch {
      // The new primary is committed and the durable marker remains. A later
      // read-repair will reconcile the mirror and clear the marker.
      return document;
    }
    this.clearDegradedMarker(format, document);
    return document;
  }
}
