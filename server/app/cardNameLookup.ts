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
  // Deck codes name cards by dbf id; the year in review and chat commands read them through this map.
  let idsByDbf = new Map<number, string>();
  let dbfById = new Map<string, number>();
  let expiresAt = 0;
  let pending: Promise<Map<string, string>> | null = null;

  async function load(): Promise<Map<string, string>> {
    if (names && expiresAt > now()) return names;
    pending ??= fetchJson(options.url).then(payload => {
      const next = new Map<string, string>();
      const nextByDbf = new Map<number, string>();
      const nextDbfById = new Map<string, number>();
      for (const card of Array.isArray(payload) ? payload : []) {
        const id = (card as { id?: unknown })?.id;
        const name = (card as { name?: unknown })?.name;
        const dbfId = (card as { dbfId?: unknown })?.dbfId;
        if (typeof id === 'string' && CARD_ID.test(id) && typeof name === 'string' && name) {
          next.set(id, name);
          if (Number.isSafeInteger(dbfId) && (dbfId as number) > 0) {
            nextByDbf.set(dbfId as number, id);
            nextDbfById.set(id, dbfId as number);
          }
        }
      }
      names = next;
      idsByDbf = nextByDbf;
      dbfById = nextDbfById;
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

  const lookup = async (cardIds: string[]): Promise<Record<string, string>> => {
    const map = await load();
    return Object.fromEntries(cardIds.flatMap(id => (map.has(id) ? [[id, map.get(id) as string]] : [])));
  };
  /** Card ids of deck dbf ids (unknown ids are left out). */
  const cardIdsByDbf = async (dbfIds: number[]): Promise<Record<number, string>> => {
    await load();
    return Object.fromEntries(dbfIds.flatMap(dbfId => (idsByDbf.has(dbfId) ? [[dbfId, idsByDbf.get(dbfId) as string]] : [])));
  };
  /** The dbf id of a card id (a hero for a deck code), or null. */
  const dbfIdOf = async (cardId: string): Promise<number | null> => {
    await load();
    return dbfById.get(cardId) ?? null;
  };
  return Object.assign(lookup, { cardIdsByDbf, dbfIdOf });
}
