export type ReaderSignInSite = { name: string; host: string };

const uidPattern = /^[A-Za-z0-9_-]{20,128}$/;
const hostPattern = /^[A-Za-z0-9.-]{1,253}$/;

function asSignInSite(value: unknown): ReaderSignInSite | null {
  if (typeof value !== 'object' || value === null) return null;
  const { name, host } = value as Record<string, unknown>;
  if (typeof name !== 'string' || typeof host !== 'string') return null;
  if (name.length < 1 || name.length > 200 || !hostPattern.test(host)) return null;
  return { name, host };
}

/** The site this browser's live interaction signs in for. The server decides; every failure means "no context". */
export async function fetchReaderSignInSite(uid: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<ReaderSignInSite | null> {
  if (!uidPattern.test(uid)) return null;
  try {
    const response = await fetchImpl(`/identity/interaction/${uid}/client`, { credentials: 'same-origin', cache: 'no-store', signal });
    return response.ok ? asSignInSite(await response.json()) : null;
  } catch { return null; }
}
