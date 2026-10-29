const HSGURU_HOSTS = new Set(['hsguru.com', 'www.hsguru.com']);

/**
 * HSGuru's own page named by a data source address, or `null`. Only an https
 * address on HSGuru counts: the visible data note labels the link «HSGuru» and
 * the JSON-LD names it as the origin of the data, so any other host stays out
 * of both.
 */
export function hsguruSourceUrl(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    return url.protocol === 'https:' && HSGURU_HOSTS.has(url.hostname) ? sourceUrl : null;
  } catch {
    return null;
  }
}
