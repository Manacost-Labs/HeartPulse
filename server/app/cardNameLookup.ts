const CACHE_TTL_MS = 24 * 60 * 60_000;
const FAILURE_RETRY_MS = 10 * 60_000;
const CARD_ID = /^[A-Za-z0-9_]{2,64}$/;

/**
 * Russian card names by card id from HearthstoneJSON, loaded once a day on
 * first use. Only the id-to-name map stays in memory; a failed download is
 * retried after ten minutes and meanwhile answers with no names.
 */
export function createCardNameLookup(options: { url: string; fetchJson?: (url: string) => Promise<unknown>; now?: () => number }) {
  const now = options.now ?? Date.now;
  const fetchJson = options.fetchJson ?? (async (url: string) => {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HearthstoneJSON returned HTTP ${response.status}`);
    return response.json();
  });
  let names: Map<string, string> | null = null;
  let expiresAt = 0;
  let pending: Promise<Map<string, string>> | null = null;

  async function load(): Promise<Map<string, string>> {
    if (names && expiresAt > now()) return names;
    pending ??= fetchJson(options.url).then(payload => {
      const next = new Map<string, string>();
      for (const card of Array.isArray(payload) ? payload : []) {
        const id = (card as { id?: unknown })?.id;
        const name = (card as { name?: unknown })?.name;
        if (typeof id === 'string' && CARD_ID.test(id) && typeof name === 'string' && name) next.set(id, name);
      }
      names = next;
      expiresAt = now() + CACHE_TTL_MS;
      return next;
    }).catch(() => {
      names = names ?? new Map();
      expiresAt = now() + FAILURE_RETRY_MS;
      return names;
    }).finally(() => {
      pending = null;
    });
    return pending;
  }

  return async (cardIds: string[]): Promise<Record<string, string>> => {
    const map = await load();
    return Object.fromEntries(cardIds.flatMap(id => (map.has(id) ? [[id, map.get(id) as string]] : [])));
  };
}
