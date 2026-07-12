import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MINIMUM_RETAINED_COLLECTION_RATIO = 0.5;
export const SNAPSHOT_SCHEMA_VERSION = 1;

type SnapshotDocument = Record<string, unknown>;

const SNAPSHOT_COLLECTIONS: Record<string, { collection: string; minimum: number; requireCards?: boolean }> = {
  'winrates.json': { collection: 'classes', minimum: 10 },
  'tierlist.json': { collection: 'sections', minimum: 1, requireCards: true },
  'legendaries.json': { collection: 'groups', minimum: 1 },
  'hsreplay_tierlist.json': { collection: 'sections', minimum: 1, requireCards: true },
};

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireUniqueId(
  records: unknown[],
  label: string,
  readId: (record: Record<string, unknown>) => unknown,
): void {
  const identifiers = new Set<string>();
  records.forEach((value, index) => {
    const record = requireRecord(value, `${label}[${index}]`);
    const id = String(readId(record) ?? '').trim();
    if (!id) throw new Error(`${label}[${index}]: id is missing`);
    if (identifiers.has(id)) throw new Error(`${label}: duplicate id ${id}`);
    identifiers.add(id);
  });
}

function validateSnapshotRecords(filename: string, document: SnapshotDocument): void {
  if (filename === 'winrates.json') {
    const classes = document.classes as unknown[];
    requireUniqueId(classes, 'winrates.json: classes', record => record.id);
    classes.forEach((value, index) => {
      const record = requireRecord(value, `winrates.json: classes[${index}]`);
      const winrate = record.winrate;
      if (typeof winrate !== 'number' || !Number.isFinite(winrate) || winrate < 0 || winrate > 100) {
        throw new Error(`winrates.json: classes[${index}]: winrate is invalid`);
      }
      if (record.games !== undefined
        && (typeof record.games !== 'number' || !Number.isFinite(record.games) || record.games < 0)) {
        throw new Error(`winrates.json: classes[${index}]: games is invalid`);
      }
    });
    return;
  }

  if (filename === 'tierlist.json' || filename === 'hsreplay_tierlist.json') {
    const sections = document.sections as unknown[];
    requireUniqueId(sections, `${filename}: sections`, record => record.id);
    let cardReferenceCount = 0;
    sections.forEach((value, sectionIndex) => {
      const section = requireRecord(value, `${filename}: sections[${sectionIndex}]`);
      if (!Array.isArray(section.tiers) || section.tiers.length === 0) {
        throw new Error(`${filename}: sections[${sectionIndex}]: tiers is empty`);
      }
      section.tiers.forEach((tierValue, tierIndex) => {
        const tier = requireRecord(tierValue, `${filename}: sections[${sectionIndex}].tiers[${tierIndex}]`);
        if (!Array.isArray(tier.cards) || tier.cards.length === 0) {
          throw new Error(`${filename}: sections[${sectionIndex}].tiers[${tierIndex}]: cards is empty`);
        }
        tier.cards.forEach((cardValue, cardIndex) => {
          const card = requireRecord(
            cardValue,
            `${filename}: sections[${sectionIndex}].tiers[${tierIndex}].cards[${cardIndex}]`,
          );
          if (!String(card.cardId ?? '').trim()) {
            throw new Error(
              `${filename}: sections[${sectionIndex}].tiers[${tierIndex}].cards[${cardIndex}]: cardId is missing`,
            );
          }
          cardReferenceCount += 1;
        });
      });
    });
    if (cardReferenceCount === 0) throw new Error(`${filename}: no tier card references`);
    return;
  }

  if (filename === 'legendaries.json') {
    const groups = document.groups as unknown[];
    requireUniqueId(groups, 'legendaries.json: groups', record => {
      const keyCard = requireRecord(record.keyCard, 'legendaries.json: keyCard');
      return keyCard.cardId;
    });
    groups.forEach((value, index) => {
      const group = requireRecord(value, `legendaries.json: groups[${index}]`);
      if (!Array.isArray(group.cards) || group.cards.length === 0) {
        throw new Error(`legendaries.json: groups[${index}]: cards is empty`);
      }
      if (group.winRate !== null && group.winRate !== undefined
        && (typeof group.winRate !== 'number'
          || !Number.isFinite(group.winRate)
          || group.winRate < 0
          || group.winRate > 100)) {
        throw new Error(`legendaries.json: groups[${index}]: winRate is invalid`);
      }
    });
  }
}

function validateSnapshotDocument(
  filename: string,
  data: unknown,
  now: number,
  allowLegacySchema: boolean,
): asserts data is SnapshotDocument {
  const specification = SNAPSHOT_COLLECTIONS[filename];
  if (!specification) throw new Error(`unsupported snapshot: ${filename}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${filename}: expected object`);
  const document = data as SnapshotDocument;
  if (document.schemaVersion !== SNAPSHOT_SCHEMA_VERSION
    && !(allowLegacySchema && document.schemaVersion === undefined)) {
    throw new Error(`${filename}: unsupported schema version`);
  }
  const collection = document[specification.collection];
  if (!Array.isArray(collection) || collection.length < specification.minimum) {
    throw new Error(`${filename}: ${specification.collection} is empty or incomplete`);
  }
  const updatedAt = Date.parse(String(document.updatedAt ?? ''));
  if (!Number.isFinite(updatedAt) || updatedAt > now + MAX_FUTURE_SKEW_MS) {
    throw new Error(`${filename}: updatedAt is invalid`);
  }
  if (!String(document.source ?? '').trim()) throw new Error(`${filename}: source is missing`);
  if (specification.requireCards) {
    const cards = document.cards;
    if (!cards || typeof cards !== 'object' || Array.isArray(cards) || Object.keys(cards).length === 0) {
      throw new Error(`${filename}: cards index is empty`);
    }
  }
  validateSnapshotRecords(filename, document);
}

export function validateSnapshot(filename: string, data: unknown, now = Date.now()): asserts data is SnapshotDocument {
  validateSnapshotDocument(filename, data, now, false);
}

function validateSnapshotContinuity(
  dataDirectory: string,
  filename: string,
  replacement: SnapshotDocument,
  now = Date.now(),
): void {
  const existing = loadSnapshot(dataDirectory, filename);
  try {
    validateSnapshotDocument(filename, existing, now, true);
  } catch {
    // A missing or already-invalid destination must not prevent recovery with a
    // structurally valid replacement.
    return;
  }

  const specification = SNAPSHOT_COLLECTIONS[filename];
  const current = existing as SnapshotDocument;
  const currentUpdatedAt = Date.parse(String(current.updatedAt));
  const replacementUpdatedAt = Date.parse(String(replacement.updatedAt));
  if (replacementUpdatedAt < currentUpdatedAt) {
    throw new Error(`${filename}: replacement is older than the published snapshot`);
  }

  const currentCollection = current[specification.collection] as unknown[];
  const replacementCollection = replacement[specification.collection] as unknown[];
  const minimumCollectionSize = Math.ceil(
    currentCollection.length * MINIMUM_RETAINED_COLLECTION_RATIO,
  );
  if (replacementCollection.length < minimumCollectionSize) {
    throw new Error(
      `${filename}: ${specification.collection} shrank unexpectedly `
      + `(${currentCollection.length} -> ${replacementCollection.length})`,
    );
  }

  if (specification.requireCards) {
    const currentCardCount = Object.keys(current.cards as Record<string, unknown>).length;
    const replacementCardCount = Object.keys(replacement.cards as Record<string, unknown>).length;
    const minimumCardCount = Math.ceil(currentCardCount * MINIMUM_RETAINED_COLLECTION_RATIO);
    if (replacementCardCount < minimumCardCount) {
      throw new Error(
        `${filename}: cards index shrank unexpectedly (${currentCardCount} -> ${replacementCardCount})`,
      );
    }
  }
}

export function publishSnapshot(dataDirectory: string, filename: string, data: unknown): string {
  validateSnapshot(filename, data);
  const safeFilename = basename(filename);
  if (safeFilename !== filename) throw new Error('snapshot filename must not contain a path');
  mkdirSync(dataDirectory, { recursive: true });
  validateSnapshotContinuity(dataDirectory, safeFilename, data);
  const destination = join(dataDirectory, safeFilename);
  const temporary = join(dataDirectory, `.${safeFilename}.${process.pid}.${randomUUID()}.tmp`);
  const markerTemporary = join(dataDirectory, `.snapshots-published.${process.pid}.${randomUUID()}.tmp`);
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporary, 'wx', 0o640);
    writeFileSync(descriptor, serialized, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporary, destination);
    const markerDescriptor = openSync(markerTemporary, 'wx', 0o640);
    try {
      writeFileSync(markerDescriptor, `${new Date().toISOString()} ${safeFilename}\n`, 'utf8');
      fsyncSync(markerDescriptor);
    } finally {
      closeSync(markerDescriptor);
    }
    renameSync(markerTemporary, join(dataDirectory, '.snapshots-published'));
    const directoryDescriptor = openSync(dataDirectory, 'r');
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
    return destination;
  } catch (error) {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
    if (existsSync(markerTemporary)) unlinkSync(markerTemporary);
    throw error;
  }
}

export function loadSnapshot(dataDirectory: string, filename: string): unknown | null {
  try {
    return JSON.parse(readFileSync(join(dataDirectory, filename), 'utf8'));
  } catch {
    return null;
  }
}
