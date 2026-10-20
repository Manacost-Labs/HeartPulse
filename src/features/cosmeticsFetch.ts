import { fetchWithDeadline } from '../shared/http/fetchWithDeadline';

/**
 * Answers this visit already received, by address: revalidated with their ETag,
 * and shown at once (no skeleton flash) when a view asks for the same address again.
 */
const requestCache = new Map<string, { etag: string | null; payload: unknown }>();

export function cachedCosmetics<T>(url: string): T | null {
  return (requestCache.get(url)?.payload as T | undefined) ?? null;
}

/** A stalled request ends at the shared request deadline, so the view can offer a retry. */
export async function fetchCosmetics<T>(url: string, signal: AbortSignal): Promise<T> {
  const cached = requestCache.get(url);
  const response = await fetchWithDeadline(url, {
    signal,
    headers: cached?.etag ? { 'If-None-Match': cached.etag } : undefined,
  });
  if (response.status === 304 && cached) return cached.payload as T;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  const payload = await response.json() as T;
  requestCache.set(url, { etag: response.headers.get('etag'), payload });
  return payload;
}
