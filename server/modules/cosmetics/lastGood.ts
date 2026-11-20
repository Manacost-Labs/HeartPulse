import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIRECTORY = 'cosmetics-last-good-v1';
const FORMAT = 1;
/** A copy older than this is not served: a week-old catalog is a wrong one, not a slow one. */
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const LISTS = /\/(?:hero-skins|coins|pets)$/;

type Options = {
  /** `SERVER_DATA_DIR`: survives restarts and releases. */
  stateDirectory: string;
  apiBaseUrl: string;
  localizedCardsUrl: string;
  /** How long a caller waits for the source before it gets the saved copy. */
  answerWithinMs?: number;
  now?: () => number;
  /** A failed write or a failed refresh behind a served copy; the caller already has its answer. */
  onError?: (error: unknown) => void;
};

type Stored = { format: number; url: string; storedAt: number; payload: unknown };

/**
 * Keeps the last good answer of the cosmetics catalog sources on disk and
 * answers from it when the source is slow or failing. A restarted server reads
 * every list from the data API again; under the load of a fresh start that
 * took longer than the public page waits, which then answered 503 (#630).
 *
 * Kept: the unfiltered lists of hero skins, coins and pets (a search would
 * grow the copies without bound) and the localized card names.
 */
export function withCosmeticsLastGood(
  fetchJson: (url: string) => Promise<any>,
  options: Options,
): (url: string) => Promise<any> {
  const directory = join(options.stateDirectory, DIRECTORY);
  const answerWithinMs = options.answerWithinMs ?? 700;
  const now = options.now ?? Date.now;
  const onError = options.onError ?? ((error: unknown) => console.warn('[cosmetics] catalog copy:', error instanceof Error ? error.message : error));
  const listPrefix = options.apiBaseUrl.replace(/\/$/, '');

  const kept = (url: string): boolean => {
    if (url === options.localizedCardsUrl) return true;
    let parsed: URL;
    try { parsed = new URL(url); } catch { return false; }
    return `${parsed.origin}${parsed.pathname}`.startsWith(listPrefix)
      && LISTS.test(parsed.pathname) && !parsed.searchParams.has('q');
  };
  const fileOf = (url: string) => join(directory, `${createHash('sha256').update(url).digest('hex')}.json`);

  const read = (url: string): { payload: unknown } | null => {
    try {
      const stored = JSON.parse(readFileSync(fileOf(url), 'utf8')) as Stored;
      if (stored?.format !== FORMAT || stored.url !== url || !Number.isFinite(stored.storedAt)) return null;
      return now() - stored.storedAt <= MAX_AGE_MS ? { payload: stored.payload } : null;
    } catch {
      // No copy yet, or a damaged one: the source answers as before.
      return null;
    }
  };

  const write = async (url: string, payload: unknown) => {
    await mkdir(directory, { recursive: true });
    const temporary = `${fileOf(url)}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ format: FORMAT, url, storedAt: now(), payload } satisfies Stored), { mode: 0o640, flag: 'wx' });
      await rename(temporary, fileOf(url));
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  };

  return async (url: string) => {
    if (!kept(url)) return fetchJson(url);
    const live = fetchJson(url).then(payload => {
      write(url, payload).catch(error => onError(error));
      return payload;
    });
    const copy = read(url);
    if (!copy) return live;
    // The source keeps going and refreshes the copy; the caller does not wait for it.
    live.catch(error => onError(error));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<{ payload: unknown }>(resolve => { timer = setTimeout(() => resolve(copy), answerWithinMs); });
    try {
      return await Promise.race([live, late.then(saved => saved.payload)]);
    } catch {
      return copy.payload;
    } finally {
      clearTimeout(timer);
    }
  };
}
