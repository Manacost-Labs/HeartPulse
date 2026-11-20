import 'server-only';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/**
 * The last good open slice of a prerendered data page, kept apart from Next's own page cache. After a
 * restart that cache holds only the build's copy (the build has no Express, so it is the empty stub), and
 * a regeneration that cannot read its source either fails (a blocking one after `revalidatePath` is a 500
 * for the visitor) or publishes the stub for five minutes. With this copy a regeneration whose source is
 * down, busy or empty renders the last slice that passed the page's own checks.
 *
 * It lives in memory and in a file next to Express's state (`shared/server-data`, which survives releases
 * and restarts; `SERVER_DATA_DIR` or `PAGE_LAST_GOOD_DIR` override it). Only the
 * open slice the page already renders is kept: the model that the page's own allowlist parser made of the
 * answer (never the raw answer, which may carry fields the page drops), and on reading the page's `restore`
 * checks it again. A slice over `MAX_BYTES` or older than `MAX_AGE_MS` is not used. Files are replaced atomically.
 */
const MAX_BYTES = 512 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** A page regenerates every five minutes; a copy is written to disk at most once a minute per page. */
const WRITE_EVERY_MS = 60_000;
const FORMAT = 1;
const DIRECTORY = 'next-page-last-good-v1';
const KEY_PATTERN = /^[a-z0-9-]{1,64}$/;

type Entry = { raw: unknown; storedAt: number; writtenAt: number };
const STORE_KEY = Symbol.for('hearthpulse.pageLastGood');
// A page and the loader are bundled apart, so the store hangs off `globalThis`.
const store = (): Map<string, Entry> => {
  const holder = globalThis as unknown as { [STORE_KEY]?: Map<string, Entry> };
  return holder[STORE_KEY] ??= new Map();
};

let announced = false;
let warned = false;

/**
 * The directory of the files, or `null` where there is no persistent state (a build, a dev server). Order:
 * `PAGE_LAST_GOOD_DIR` (tests), `SERVER_DATA_DIR` (as Express's own state, when the process has it), else the
 * production layout `<root>/releases/<sha>` (the working directory) with `<root>/shared/server-data`.
 * Where the copy goes is logged once, the first time it is used (a page is first rendered after the start).
 */
function directory(): string | null {
  const root = process.env.PAGE_LAST_GOOD_DIR || process.env.SERVER_DATA_DIR;
  let target: string | null = null;
  if (root) target = join(root, DIRECTORY);
  else {
    const release = process.cwd();
    const shared = basename(dirname(release)) === 'releases' ? join(dirname(dirname(release)), 'shared', 'server-data') : '';
    if (shared && existsSync(shared)) target = join(shared, DIRECTORY);
  }
  if (!announced) {
    announced = true;
    console.info(target ? `[page-last-good] last good slices are kept in ${target}` : '[page-last-good] no state directory: last good slices are kept in memory only');
  }
  return target;
}

function writeFile(key: string, raw: unknown, storedAt: number) {
  const target = directory();
  if (!target) return;
  const temporary = join(target, `.${key}.${process.pid}.${randomUUID()}.tmp`);
  try {
    mkdirSync(target, { recursive: true });
    writeFileSync(temporary, JSON.stringify({ format: FORMAT, savedAt: storedAt, raw }), { mode: 0o640, flag: 'wx' });
    renameSync(temporary, join(target, `${key}.json`));
  } catch (error) {
    // A read-only or full disk only loses persistence across restarts; the memory copy still serves.
    // The cleanup itself may fail the same way (an unreadable directory): it must not reach the render.
    try {
      rmSync(temporary, { force: true });
    } catch {
      // Nothing was written that could be left behind, or it cannot be removed; either way the page renders.
    }
    if (!warned) {
      warned = true;
      console.warn(`[page-last-good] cannot write ${target}: ${error instanceof Error ? error.message : String(error)}; the copy is kept in memory only`);
    }
  }
}

function readFile(key: string): { raw: unknown; storedAt: number } | null {
  const source = directory();
  if (!source) return null;
  try {
    const document = JSON.parse(readFileSync(join(source, `${key}.json`), 'utf8')) as { format?: unknown; savedAt?: unknown; raw?: unknown } | null;
    if (document?.format !== FORMAT || typeof document.savedAt !== 'number' || document.raw === undefined) return null;
    return { raw: document.raw, storedAt: document.savedAt };
  } catch {
    return null;
  }
}

function remember(key: string, raw: unknown) {
  let size: number;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return;
  }
  if (size > MAX_BYTES) return;
  const now = Date.now();
  const previous = store().get(key);
  const writeNow = !previous || now - previous.writtenAt >= WRITE_EVERY_MS;
  store().set(key, { raw, storedAt: now, writtenAt: writeNow ? now : previous.writtenAt });
  if (writeNow) writeFile(key, raw, now);
}

function recall(key: string): unknown {
  const now = Date.now();
  let entry = store().get(key);
  if (!entry) {
    const stored = readFile(key);
    if (stored) {
      entry = { ...stored, writtenAt: stored.storedAt };
      store().set(key, entry);
    }
  }
  return entry && now - entry.storedAt <= MAX_AGE_MS ? entry.raw : null;
}

/**
 * The page's slice from its source, or, when the source gives nothing the page accepts, the last slice
 * that was accepted (this process's or the file's). `parse` is the page's allowlist parser of an answer and
 * its result is what is kept; `restore` is the page's own check of a kept model (a stored file is only
 * data), so a stored slice never skips a check. `null` only when there is no source and no usable copy.
 */
export async function loadWithLastGood<T>(
  key: string, read: () => Promise<unknown>, parse: (raw: unknown) => T | null, restore: (stored: unknown) => T | null,
): Promise<T | null> {
  if (!KEY_PATTERN.test(key)) throw new Error('Invalid last good key');
  const fresh = parse(await read());
  if (fresh !== null) {
    remember(key, fresh);
    return fresh;
  }
  return restore(recall(key));
}
