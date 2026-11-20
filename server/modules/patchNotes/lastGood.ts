import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PatchNotesDetail } from './contract.js';

/** The parsed archive as the service keeps it (`PatchNotesSnapshot`). */
type PatchNotesSnapshot = { patches: PatchNotesDetail[]; updatedAt: string };

/** The last archive built in full, kept so that a restarted server answers at once while it rebuilds. */
export type PatchNotesLastGoodStorage = {
  /** The stored copy, or `null` when there is none or it cannot be read. */
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
    try {
      const document = JSON.parse(readFileSync(join(this.directory, FILENAME), 'utf8')) as { format?: unknown; snapshot?: Partial<PatchNotesSnapshot> };
      const snapshot = document?.snapshot;
      if (document?.format !== FORMAT || !Array.isArray(snapshot?.patches) || typeof snapshot?.updatedAt !== 'string') return null;
      return { patches: snapshot.patches, updatedAt: snapshot.updatedAt };
    } catch {
      // No copy yet (first start) or a damaged one: the archive is read from the source as before.
      return null;
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
 * The service's side of the copy: read once per process, recognised while it is
 * still the snapshot, written one write after another (an older copy never
 * replaces a newer one). An archive without any patch with changes is not stored.
 */
export function createLastGoodCopy(storage: PatchNotesLastGoodStorage | undefined, onError?: (error: unknown) => void) {
  const restored = new WeakSet<PatchNotesSnapshot>();
  let tried = false;
  let refreshes = 0;
  let saving: Promise<void> = Promise.resolve();
  const save = (value: PatchNotesSnapshot) => {
    if (!storage || !value.patches.some(patch => patch.changeCount > 0)) return saving;
    saving = saving.then(() => storage.write(value)).catch(error => onError?.(error));
    return saving;
  };
  return {
    /** The stored copy on the first call of the process, else `null`. */
    restore(): PatchNotesSnapshot | null {
      if (tried || !storage) return null;
      tried = true;
      const copy = storage.read();
      if (copy) restored.add(copy);
      return copy;
    },
    isRestored: (snapshot: PatchNotesSnapshot) => restored.has(snapshot),
    save,
    /**
     * After a refresh: stores the copy again once `picture` has added the before/after pictures of the
     * newest patches of `value`, into the snapshot `current` then holds, unless a newer refresh came first.
     */
    async savePictured(value: PatchNotesSnapshot, current: () => PatchNotesSnapshot | null,
      picture: (newest: PatchNotesDetail[]) => Promise<PatchNotesDetail[]>): Promise<void> {
      const refresh = ++refreshes;
      if (!storage) return;
      const newest: PatchNotesDetail[] | null = await picture(value.patches.filter(patch => patch.changeCount > 0).slice(0, PICTURED_PATCHES))
        .catch((error: unknown) => {
          onError?.(error);
          return null;
        });
      const latest = current();
      if (!newest || refresh !== refreshes || !latest) return;
      const pictured = new Map<string, PatchNotesDetail>(newest.map(patch => [patch.version, patch]));
      await save({ ...latest, patches: latest.patches.map(patch => pictured.get(patch.version) ?? patch) });
    },
  };
}
