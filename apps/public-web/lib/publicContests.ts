import 'server-only';
import { contestsFromResponse } from '../../../src/modules/contests/public';

/** Fetches only the anonymous projection; viewer entries never enter shared SSR state. */
export async function loadPublicContests() {
  const origin = new URL(process.env.LEGACY_WEB_ORIGIN ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(origin.protocol)
    || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid legacy origin');
  }
  const response = await fetch(new URL('/api/contests', origin), {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Public contests temporarily unavailable');
  return contestsFromResponse(await response.json());
}
