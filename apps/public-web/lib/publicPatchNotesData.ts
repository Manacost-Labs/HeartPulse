import type { PatchNotesDetail, PatchNotesSummary } from '@/src/modules/patchNotes/public';
import { readFirstPaintJson, withinDeadline } from './publicFirstPaintRead';

export type PublicPatchNotes = { patch: PatchNotesDetail | null; archive: PatchNotesSummary[] | null };

export function patchDetail(value: unknown): PatchNotesDetail | null {
  const patch = value as PatchNotesDetail | null;
  return patch && typeof patch.version === 'string' && typeof patch.title === 'string' && Array.isArray(patch.entries)
    ? patch : null;
}

export function patchArchive(value: unknown): PatchNotesSummary[] | null {
  const patches = (value as { patches?: unknown } | null)?.patches;
  return Array.isArray(patches) && patches.every(item => typeof item?.version === 'string') ? patches : null;
}

export type PatchNotesReaderOptions = {
  /** One anonymous Express request; the signal ends it at the refresh budget. */
  request: (path: string, signal: AbortSignal) => Promise<Response>;
  /** Clock of the cache ages (tests); deadlines always use the wall clock. */
  now?: () => number;
  /** A copy younger than this is served without asking Express. */
  freshMs?: number;
  /** How long a background refresh may wait for Express. */
  refreshBudgetMs?: number;
  /** Paths kept; the least recently served is dropped first. */
  maxEntries?: number;
};

/**
 * Patch notes for the server render, kept in the Next process. Express can
 * stall for seconds (a restart, a 4 MB archive refresh), and a document that
 * misses the first-paint budget ships without the patch — the regional edge
 * then caches that copy for a minute, bots included. So the last good answer
 * of each path is served at once, refreshed in the background when older than
 * `freshMs`; only a path never read waits, up to the caller's deadline, and
 * its read keeps running past it to fill the cache for the next request.
 * Failed, `404` and malformed answers are not kept, so unknown versions cannot
 * grow the cache and the last good copy outlives an Express outage.
 */
export function createPatchNotesReader({
  request, now = Date.now, freshMs = 5 * 60_000, refreshBudgetMs = 10_000, maxEntries = 48,
}: PatchNotesReaderOptions) {
  const entries = new Map<string, { value: unknown; at: number }>();
  const pending = new Map<string, Promise<unknown>>();

  function refresh(path: string, parse: (value: unknown) => unknown): Promise<unknown> {
    let read = pending.get(path);
    if (!read) {
      read = readFirstPaintJson(signal => request(path, signal), Date.now() + refreshBudgetMs)
        .then(raw => {
          const value = parse(raw);
          if (value !== null) {
            entries.delete(path);
            entries.set(path, { value, at: now() });
            if (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
          }
          return value;
        })
        .finally(() => pending.delete(path));
      pending.set(path, read);
    }
    return read;
  }

  async function read<T>(path: string, parse: (value: unknown) => T | null, deadline: number): Promise<T | null> {
    const hit = entries.get(path);
    if (!hit) return (await withinDeadline(refresh(path, parse), deadline)) as T | null;
    entries.delete(path);
    entries.set(path, hit);
    if (now() - hit.at >= freshMs) void refresh(path, parse);
    return hit.value as T;
  }

  /** The patch (`null` for the newest) and the archive, each `null` when not read in time. */
  return async function load(version: string | null, deadline: number): Promise<PublicPatchNotes> {
    const [patch, archive] = await Promise.all([
      read(`/api/patch-notes/${encodeURIComponent(version ?? 'latest')}`, patchDetail, deadline),
      read('/api/patch-notes', patchArchive, deadline),
    ]);
    return { patch, archive };
  };
}
