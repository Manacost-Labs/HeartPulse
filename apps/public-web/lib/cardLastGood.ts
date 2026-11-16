const STORE_KEY = Symbol.for('hearthpulse.cardLastGood');
const LIMIT = 500;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
/** A projection larger than this is not kept; a card page then answers 503 in an outage. */
const MAX_PROJECTION_BYTES = 256 * 1024;

type Store = Map<string, { projection: unknown; storedAt: number }>;
const store = (): Store => {
  const holder = globalThis as unknown as { [STORE_KEY]?: Store };
  return holder[STORE_KEY] ??= new Map();
};

/**
 * Last good anonymous card projection per card, shared by `proxy.ts` and the
 * card page (bundled apart, so it hangs off `globalThis`). It is independent of
 * the 4 KiB request header that normally carries the projection to the page.
 */
export function rememberCardProjection(format: string, cardId: string, projection: unknown) {
  if (JSON.stringify(projection).length > MAX_PROJECTION_BYTES) return;
  const key = `${format}/${cardId}`;
  const entries = store();
  entries.delete(key);
  entries.set(key, { projection, storedAt: Date.now() });
  if (entries.size > LIMIT) entries.delete(entries.keys().next().value as string);
}

export function lastGoodCardProjection(format: string, cardId: string): unknown | undefined {
  const entry = store().get(`${format}/${cardId}`);
  return entry && Date.now() - entry.storedAt <= MAX_AGE_MS ? entry.projection : undefined;
}

export function forgetCardProjection(format: string, cardId: string) {
  store().delete(`${format}/${cardId}`);
}
