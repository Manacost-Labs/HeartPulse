/**
 * The report's two reads, started before its chunk has loaded. The page
 * renders the report only for a viewer with access, and the chunk is a
 * download of its own; without this the reads would wait for that download
 * (chunk → summary → builds). The page starts them while the chunk loads and
 * the report takes them once, on mount; anything older than `FRESH_MS` or
 * already taken is read again by the report itself.
 */
import { fetchWithDeadline } from '../../shared/http/fetchWithDeadline';

type Requests = { summary: Promise<Response>; builds: Promise<Response>; at: number };

const FRESH_MS = 30_000;
let started: Requests | null = null;

const read = (url: string) => fetchWithDeadline(url, { headers: { Accept: 'application/json' } });

export function startViciousGoldRequests(): void {
  if (started && performance.now() - started.at < FRESH_MS) return;
  started = { summary: read('/api/vicious-syndicate-gold'), builds: read('/api/vicious-syndicate-gold/builds'), at: performance.now() };
  // The report reads both; a failure here must not surface as an unhandled rejection before it does.
  started.summary.catch(() => undefined);
  started.builds.catch(() => undefined);
}

/** The started reads for the report's first load, or null; each start is handed out once. */
export function takeViciousGoldRequests(): Omit<Requests, 'at'> | null {
  const taken = started && performance.now() - started.at < FRESH_MS ? started : null;
  started = null;
  return taken;
}
