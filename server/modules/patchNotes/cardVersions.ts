import type { PatchNotesDetail, PatchNotesEntry } from './contract.js';
import { cardFacts, diffFacts, reconcileChanges, type VersionDiff } from './versionChanges.js';

/**
 * "Before" and "after" pictures of a changed card, from the card history of
 * the public data API: every version it observed carries an archived render
 * (`media.image_url` of a Constructed card, `media.card_image` of a
 * Battlegrounds card). A card gets a pair only when the history holds a
 * version on each side of the patch whose pictures differ; nothing is
 * painted or guessed.
 */

/** `diff`: what differs between the two versions' snapshots, `null` when either has none. */
export type CardVersionPair = { before: string; after: string; diff: VersionDiff | null };

/** The patch's own window: it came out at `from` and the next patch at `until` (`null`: none yet). */
export type PatchWindow = { from: number; until: number | null };

type Picture = { at: number; url: string; key: string; snapshot: unknown };

const ARCHIVE_PREFIX = '/uploads/card-history-media/';
const MAX_CONCURRENT = 4;
const COMPLETE_TTL_MS = 6 * 60 * 60_000;
const INCOMPLETE_RETRY_MS = 5 * 60_000;
const MAX_CACHED_PATCHES = 16;

/** `observed_at` is UTC without an offset: `2026-11-03 20:29:37.596806`. */
const observedAt = (value: unknown) => {
  const text = String(value ?? '').trim();
  if (!text) return NaN;
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text.replace(' ', 'T') : `${text.replace(' ', 'T')}Z`);
};

/** Archived pictures of the history, oldest first; an unarchived (mutable) URL is never a picture. */
function pictures(versions: unknown, mediaKey: string, origin: string): Picture[] {
  if (!Array.isArray(versions)) return [];
  const result: Picture[] = [];
  for (const version of versions) {
    const at = observedAt((version as { observed_at?: unknown })?.observed_at);
    const media = (version as { media?: Record<string, { archive_url?: unknown; sha256?: unknown } | undefined> })?.media?.[mediaKey];
    const path = typeof media?.archive_url === 'string' ? media.archive_url : '';
    if (!Number.isFinite(at) || !path.startsWith(ARCHIVE_PREFIX) || path.includes('..')) continue;
    result.push({
      at, url: `${origin}${path}`, key: typeof media?.sha256 === 'string' && media.sha256 ? media.sha256 : path,
      snapshot: (version as { snapshot?: unknown })?.snapshot,
    });
  }
  return result.sort((left, right) => left.at - right.at);
}

/**
 * "Before" is the last archived picture older than the patch; "after" is the
 * first one inside the patch's window whose picture differs from it; the
 * snapshots of those two versions say what changed.
 */
export function pickVersionPair(versions: unknown, mediaKey: string, window: PatchWindow, origin: string): CardVersionPair | null {
  const archive = pictures(versions, mediaKey, origin);
  const before = archive.filter(picture => picture.at < window.from).at(-1);
  if (!before) return null;
  const after = archive.find(picture => picture.at >= window.from && (window.until === null || picture.at < window.until)
    && picture.key !== before.key);
  if (!after) return null;
  const [left, right] = [cardFacts(before.snapshot, mediaKey === 'card_image'), cardFacts(after.snapshot, mediaKey === 'card_image')];
  return { before: before.url, after: after.url, diff: left && right ? diffFacts(left, right) : null };
}

export type CardVersionsDependencies = {
  /** Reads a path of the data API (`/card-history/…`); rejects on any failure. A 404 may carry `status: 404`. */
  fetchJson: (url: string) => Promise<unknown>;
  /** Data API base: `https://api.kolodahearthstone.com/api/v1`. */
  baseUrl: string;
  now?: () => number;
};

type Job = { pairs: Map<string, CardVersionPair>; complete: boolean; at: number; done: Promise<void> | null };

function historyRequest(entry: PatchNotesEntry): { path: string; mediaKey: string } | null {
  if (!entry.cardId) return null;
  const id = encodeURIComponent(entry.cardId);
  return entry.mode === 'battlegrounds'
    ? { path: `/card-history/card/${id}`, mediaKey: 'card_image' }
    : { path: `/card-history/constructed_card/${id}`, mediaKey: 'image_url' };
}

/**
 * Finds the pairs of one patch at a time, at most four requests in flight, and
 * keeps them: a patch does not change once it is out. A pair found is shown at
 * once while the rest is still being read; a failed read leaves its card
 * without a pair and the patch is read again after a few minutes.
 */
export function createCardVersions({ fetchJson, baseUrl, now = Date.now }: CardVersionsDependencies) {
  const origin = new URL(baseUrl).origin;
  const jobs = new Map<string, Job>();

  const lookup = async (entry: PatchNotesEntry, window: PatchWindow, job: Job) => {
    const request = historyRequest(entry);
    if (!request) return;
    try {
      const payload = await fetchJson(`${baseUrl}${request.path}`);
      const pair = pickVersionPair((payload as { data?: { versions?: unknown } })?.data?.versions, request.mediaKey, window, origin);
      if (pair) job.pairs.set(entry.id, pair);
    } catch (error) {
      // A card the history does not know has no pair for good; any other failure is retried later.
      if ((error as { status?: unknown })?.status !== 404) job.complete = false;
    }
  };

  const start = (patch: PatchNotesDetail, window: PatchWindow, key: string): Job => {
    const job: Job = { pairs: new Map(), complete: true, at: now(), done: null };
    const queue = patch.entries.filter(entry => historyRequest(entry));
    const worker = async () => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) await lookup(entry, window, job);
    };
    job.done = Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, worker)).then(() => {
      job.done = null;
      job.at = now();
    });
    jobs.delete(key);
    jobs.set(key, job);
    if (jobs.size > MAX_CACHED_PATCHES) jobs.delete(jobs.keys().next().value as string);
    return job;
  };

  const jobFor = (patch: PatchNotesDetail, window: PatchWindow) => {
    // Cards the catalog resolved later are new lookups, so the key counts the cards with an id.
    const key = `${patch.build}@${window.until ?? ''}#${patch.entries.filter(entry => entry.cardId).length}`;
    const known = jobs.get(key);
    const age = known ? now() - known.at : 0;
    if (known && (known.done || age < (known.complete ? COMPLETE_TTL_MS : INCOMPLETE_RETRY_MS))) return known;
    return start(patch, window, key);
  };

  return {
    /** Begins reading a patch's history without waiting for it. */
    warm(patch: PatchNotesDetail, window: PatchWindow): void {
      jobFor(patch, window);
    },
    /**
     * The patch with the pairs found within `waitMs` (and every pair found
     * earlier); a card without a pair keeps `null`. Never rejects.
     */
    async attach(patch: PatchNotesDetail, window: PatchWindow, waitMs: number): Promise<PatchNotesDetail> {
      const job = jobFor(patch, window);
      if (job.done) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([job.done, new Promise(resolve => { timer = setTimeout(resolve, waitMs); })]);
        clearTimeout(timer);
      }
      if (!job.pairs.size) return patch;
      return {
        ...patch,
        entries: patch.entries.map(entry => {
          const pair = job.pairs.get(entry.id);
          if (!pair) return entry;
          const changes = pair.diff ? reconcileChanges(entry.changes, pair.diff, entry.mode === 'battlegrounds') : entry.changes;
          return { ...entry, beforeRenderUrl: pair.before, afterRenderUrl: pair.after, changes };
        }),
      };
    },
  };
}

/** How long a request waits for the pictures of a patch whose history has not been read yet. */
const WAIT_MS = 4_000;
/** The newest patches get their pictures read as soon as the archive is, so the first visitor rarely waits. */
const WARM_PATCHES = 2;

/** The window of a patch: from its release to the release of the next newer patch of the archive. */
function windowOf(patches: PatchNotesDetail[], patch: PatchNotesDetail): PatchWindow | null {
  const from = Date.parse(patch.publishedAt ?? '');
  if (!Number.isFinite(from)) return null;
  const until = Date.parse(patches[patches.indexOf(patch) - 1]?.publishedAt ?? '');
  return { from, until: Number.isFinite(until) ? until : null };
}

/** Card versions for the patches of an archive (newest first): warmed at refresh, attached per answer. */
export function createPatchCardVersions(dependencies: CardVersionsDependencies) {
  const versions = createCardVersions(dependencies);
  return {
    warm(patches: PatchNotesDetail[]): void {
      for (const patch of patches.filter(item => item.changeCount > 0).slice(0, WARM_PATCHES)) {
        const window = windowOf(patches, patch);
        if (window) versions.warm(patch, window);
      }
    },
    /** Never rejects: a patch whose history cannot be read keeps its `null` pairs. */
    attach(archive: PatchNotesDetail[], patches: PatchNotesDetail[]): Promise<PatchNotesDetail[]> {
      return Promise.all(patches.map(patch => {
        const window = windowOf(archive, patch);
        return window ? versions.attach(patch, window, WAIT_MS).catch(() => patch) : patch;
      }));
    },
  };
}
