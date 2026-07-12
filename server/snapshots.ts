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

type SnapshotDocument = Record<string, unknown>;

const SNAPSHOT_COLLECTIONS: Record<string, { collection: string; minimum: number; requireCards?: boolean }> = {
  'winrates.json': { collection: 'classes', minimum: 10 },
  'tierlist.json': { collection: 'sections', minimum: 1, requireCards: true },
  'legendaries.json': { collection: 'groups', minimum: 1 },
  'hsreplay_tierlist.json': { collection: 'sections', minimum: 1, requireCards: true },
};

export function validateSnapshot(filename: string, data: unknown, now = Date.now()): asserts data is SnapshotDocument {
  const specification = SNAPSHOT_COLLECTIONS[filename];
  if (!specification) throw new Error(`unsupported snapshot: ${filename}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${filename}: expected object`);
  const document = data as SnapshotDocument;
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
}

function validateSnapshotContinuity(
  dataDirectory: string,
  filename: string,
  replacement: SnapshotDocument,
  now = Date.now(),
): void {
  const existing = loadSnapshot(dataDirectory, filename);
  try {
    validateSnapshot(filename, existing, now);
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
