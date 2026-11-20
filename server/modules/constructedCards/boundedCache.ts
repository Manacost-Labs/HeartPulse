/**
 * A map that keeps at most `maxEntries` values and drops the least recently used one.
 * Both `get` and `set` count as a use, so a card read again stays while one read once goes.
 * It bounds the enriched card details of `constructedCardRoutes.ts` (`detailCacheMaxEntries`,
 * 2 000 by default): server-rendered card pages read every card's detail, so one crawl of the
 * catalog kept all of them unbounded (~200 KB each, 1.4 GB seen 2026-11-20).
 */
export class BoundedCache<V> {
  readonly #entries = new Map<string, V>();
  readonly #maxEntries: number;

  constructor(maxEntries: number) {
    this.#maxEntries = Math.max(1, Math.floor(maxEntries));
  }

  get(key: string): V | undefined {
    const value = this.#entries.get(key);
    if (value !== undefined) this.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value as string;
      this.#entries.delete(oldest);
    }
  }

  clear(): void {
    this.#entries.clear();
  }
}
