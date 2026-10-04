/** A relayed cover or variant with the validator it is served under. */
export type ArticleCoverEntry = { body: Buffer; contentType: string; etag: string };

/**
 * Bounded in-memory LRU for /api/article-cover (server/articleCoverRoutes.ts).
 * Entries expire after `ttlMs`; the least recently used ones are evicted once
 * the byte or entry budget is exceeded.
 */
export class ArticleCoverCache {
  private readonly entries = new Map<string, { entry: ArticleCoverEntry; expiresAt: number }>();
  private bytes = 0;

  constructor(
    private readonly limits: { ttlMs: number; maxBytes: number; maxEntries: number },
    private readonly now: () => number,
  ) {}

  get(key: string): ArticleCoverEntry | undefined {
    const stored = this.entries.get(key);
    if (!stored) return undefined;
    this.entries.delete(key);
    if (stored.expiresAt <= this.now()) {
      this.bytes -= stored.entry.body.byteLength;
      return undefined;
    }
    this.entries.set(key, stored);
    return stored.entry;
  }

  /** One entry may use at most an eighth of the budget, so a single large original cannot flush the cache. */
  set(key: string, entry: ArticleCoverEntry): void {
    if (entry.body.byteLength > this.limits.maxBytes / 8) return;
    const previous = this.entries.get(key);
    if (previous) {
      this.entries.delete(key);
      this.bytes -= previous.entry.body.byteLength;
    }
    this.entries.set(key, { entry, expiresAt: this.now() + this.limits.ttlMs });
    this.bytes += entry.body.byteLength;
    for (const [oldestKey, oldest] of this.entries) {
      if (this.bytes <= this.limits.maxBytes && this.entries.size <= this.limits.maxEntries) break;
      this.entries.delete(oldestKey);
      this.bytes -= oldest.entry.body.byteLength;
    }
  }
}
