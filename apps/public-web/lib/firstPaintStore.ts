import { fetchPublicExpress } from './expressApi';
import { CatalogUnavailableError, PublicDataMissingError, createDefaultCatalogCache } from './publicCatalogCache';
import { FIRST_PAINT_READ_BUDGET_MS } from './publicFirstPaintRead';

/**
 * Last good anonymous projections of the data pages, one per Express path
 * (the query string included, so a filtered or paged list has its own copy).
 *
 * Only anonymous reads end up here: `fetchPublicExpress` sends no cookie and
 * no authorization, and the paid layer never leaves Express in these answers.
 * So the key (the path) cannot tell a guest from a subscriber, and a copy
 * stored while a subscriber looked at the page is the same open layer.
 *
 * A visitor waits for Express as long as before (`FIRST_PAINT_READ_BUDGET_MS`)
 * when a copy can answer instead. With no copy the `patient` caller (the proxy,
 * which decides between the page and a 503) waits `COLD_READ_WAIT_MS`; a page
 * waits only until the read has run for the first-paint budget, so it does not
 * wait again after the proxy. The read itself goes on in the background and
 * warms the copy for the next visit.
 * A copy is kept for `STALE_LIMIT_MS` at most, 200 copies and 16 Mi characters
 * of JSON text; the oldest idle one goes first. Streamer profiles are the
 * numerous ones (hundreds): at the estimated 60-100 KB of a profile the
 * limit keeps the 160-270 most recently read, which is where the traffic is. JSON is kept as text
 * and parsed on every read, so no page can change a stored copy.
 */
export const COLD_READ_WAIT_MS = 2_000;
export const STORE_MAX_ENTRIES = 200;
/** Characters of JSON text, two bytes each at worst (Cyrillic): 32 MiB of heap at most. */
export const STORE_MAX_CHARS = 16 * 1024 * 1024;
const STALE_LIMIT_MS = 6 * 60 * 60 * 1000;
/** A page asks Express a few times (proxy, metadata, page); within this they share one answer. */
const FRESH_MS = 2_000;
const STORE_KEY = Symbol.for('hearthpulse.firstPaintStore');

async function readText(path: string, signal: AbortSignal): Promise<string> {
  const response = await fetchPublicExpress(path, signal);
  // A refused or unknown request is the page's own state, not an outage; 408 and 429 are the source's trouble.
  if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
    await response.body?.cancel();
    throw new PublicDataMissingError(response.status);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new CatalogUnavailableError();
  }
  const text = await response.text();
  JSON.parse(text);
  return text;
}

function store() {
  // `proxy.ts` and the pages are bundled apart and must share the copies, so the store hangs off `globalThis`.
  const holder = globalThis as unknown as { [STORE_KEY]?: (path: string, patient?: boolean) => Promise<string> };
  holder[STORE_KEY] ??= createDefaultCatalogCache<string>(readText, Date.now, value => value, {
    deadlineMs: FIRST_PAINT_READ_BUDGET_MS, coldDeadlineMs: COLD_READ_WAIT_MS, freshMs: FRESH_MS, retryBackoffMs: 1_000, missBackoffMs: 1_000, coldFromStart: true, coldFailureMs: 1_000,
    joinMs: 3_000, maxEntries: STORE_MAX_ENTRIES, maxBytes: STORE_MAX_CHARS, staleLimitMs: STALE_LIMIT_MS,
    size: value => (value as string).length,
  });
  return holder[STORE_KEY];
}

/**
 * The parsed JSON of an anonymous Express path: the fresh answer, else the
 * last good one. Throws `CatalogUnavailableError` when there is neither and
 * `PublicDataMissingError` (with the status) when Express refuses the request: 404, 400.
 */
export async function readPublicJson(path: string, patient = false): Promise<unknown> {
  return JSON.parse(await store()(path, patient));
}

/** `readPublicJson`, or `null` when the data is not there at all (a page that is useful without it renders without). */
export async function readPublicJsonOrNull(path: string, patient = false): Promise<unknown> {
  try {
    return await readPublicJson(path, patient);
  } catch {
    return null;
  }
}
