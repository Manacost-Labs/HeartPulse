import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PatchNotesDetail } from './contract.js';
import { isStoredPatch } from './lastGoodShape.js';

/** The parsed archive as the service keeps it (`PatchNotesSnapshot`). */
type PatchNotesSnapshot = { patches: PatchNotesDetail[]; updatedAt: string };

/** The last archive built in full, kept so that a restarted server answers at once while it rebuilds. */
export type PatchNotesLastGoodStorage = {
  /** The stored copy, or `null` when there is none; throws on a damaged one. */
  read(): PatchNotesSnapshot | null;
  write(snapshot: PatchNotesSnapshot): Promise<void>;
};

const DIRECTORY = 'patch-notes-v1';
/** The newest patches with changes (the page's `/recent`) whose before/after pictures the copy keeps. */
const PICTURED_PATCHES = 2;
const FILENAME = 'last-good.json';
const FORMAT = 1;

/** One JSON file `<stateDirectory>/patch-notes-v1/last-good.json`, replaced atomically. */
export class PatchNotesLastGoodFile implements PatchNotesLastGoodStorage {
  private readonly directory: string;

  constructor(options: { stateDirectory: string }) {
    this.directory = join(options.stateDirectory, DIRECTORY);
  }

  read(): PatchNotesSnapshot | null {
    this.removeStaleTemporaries();
    let text: string;
    try {
      text = readFileSync(join(this.directory, FILENAME), 'utf8');
    } catch (error) {
      // No copy yet (first start): the archive is read from the source as before.
      if ((error as { code?: unknown })?.code === 'ENOENT') return null;
      throw error;
    }
    const document = JSON.parse(text) as { format?: unknown; snapshot?: { patches?: unknown; updatedAt?: unknown } } | null;
    const snapshot = document?.snapshot;
    if (document?.format !== FORMAT || typeof snapshot?.updatedAt !== 'string'
      || !Array.isArray(snapshot.patches) || !snapshot.patches.every(isStoredPatch)) {
      throw new Error('Stored patch notes copy is damaged; reading the archive from the source');
    }
    return { patches: snapshot.patches, updatedAt: snapshot.updatedAt };
  }

  /** Half-written copies left by a process killed mid-write (`.last-good.json.<pid>.<uuid>.tmp`); this process's own are kept. */
  private removeStaleTemporaries(): void {
    let names: string[];
    try {
      names = readdirSync(this.directory);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.startsWith(`.${FILENAME}.`) || !name.endsWith('.tmp') || name.startsWith(`.${FILENAME}.${process.pid}.`)) continue;
      try {
        rmSync(join(this.directory, name), { force: true });
      } catch {
        // Another start removed it first, or the directory is read-only: the copy is still read.
      }
    }
  }

  async write(snapshot: PatchNotesSnapshot): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporary = join(this.directory, `.${FILENAME}.${process.pid}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify({ format: FORMAT, snapshot }), { mode: 0o640, flag: 'wx' });
      await rename(temporary, join(this.directory, FILENAME));
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}

/**
 * The service's side of the copy: read once per process (a damaged copy goes to
 * `onError` and is not served), recognised while it is still the snapshot,
 * written one write after another. Each new build starts a generation: from then
 * on the pictures of an older build are never written over it. An archive
 * without any patch with changes is not stored.
 */
export function createLastGoodCopy(storage: PatchNotesLastGoodStorage | undefined, onError?: (error: unknown) => void) {
  const restored = new WeakSet<PatchNotesSnapshot>();
  let tried = false;
  let generation = 0;
  let saving: Promise<void> = Promise.resolve();
  /** Queues a write that still runs only if no newer build has started by then. */
  const enqueue = (value: PatchNotesSnapshot, own: number) => {
    if (!storage || !value.patches.some(patch => patch.changeCount > 0)) return saving;
    saving = saving.then(() => (own === generation ? storage.write(value) : undefined)).catch(error => onError?.(error));
    return saving;
  };
  return {
    /** The stored copy on the first call of the process, else `null`. */
    restore(): PatchNotesSnapshot | null {
      if (tried || !storage) return null;
      tried = true;
      try {
        const copy = storage.read();
        if (copy) restored.add(copy);
        return copy;
      } catch (error) {
        onError?.(error);
        return null;
      }
    },
    isRestored: (snapshot: PatchNotesSnapshot) => restored.has(snapshot),
    /** Stores a new build; pictures of older builds still on their way are dropped from now on. */
    save: (value: PatchNotesSnapshot) => enqueue(value, ++generation),
    /**
     * After `save(value)`: stores the copy again once `picture` has added the before/after pictures of the
     * newest patches of `value`, into the snapshot `current` then holds, unless a newer build started first.
     */
    async savePictured(value: PatchNotesSnapshot, current: () => PatchNotesSnapshot | null,
      picture: (newest: PatchNotesDetail[]) => Promise<PatchNotesDetail[]>): Promise<void> {
      const own = generation;
      if (!storage) return;
      const newest: PatchNotesDetail[] | null = await picture(value.patches.filter(patch => patch.changeCount > 0).slice(0, PICTURED_PATCHES))
        .catch((error: unknown) => {
          onError?.(error);
          return null;
        });
      const latest = current();
      if (!newest || own !== generation || !latest) return;
      const pictured = new Map<string, PatchNotesDetail>(newest.map(patch => [patch.version, patch]));
      await enqueue({ ...latest, patches: latest.patches.map(patch => pictured.get(patch.version) ?? patch) }, own);
    },
  };
}
