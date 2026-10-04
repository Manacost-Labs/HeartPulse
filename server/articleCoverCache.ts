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

const CACHEABLE_PATH = /^\/(?:wp-content\/)?uploads\/(?:[^/]+\/)*[^/]+\.(?:avif|gif|jpe?g|png|webp)$/i;

/**
 * The one URL a cover is fetched from and cached under, or null when the
 * source must be relayed uncached. Only HTTPS image files under an uploads
 * directory, without a port and without any `?` or `#` in the requested
 * string, qualify. Spelling variants of one file share one entry: `www.` is
 * dropped when the allowlist also allows the bare host, and every path
 * segment is decoded and re-encoded with empty segments removed. Fetching
 * this canonical URL (not the requested spelling) keeps an entry's bytes
 * identical to what its key names.
 */
export function canonicalArticleCoverUrl(requested: string, target: URL, allowedHosts: ReadonlySet<string>): URL | null {
  if (/[?#]/.test(requested) || target.protocol !== 'https:' || target.port) return null;
  let path: string;
  try {
    path = `/${target.pathname.split('/').filter(Boolean).map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/')}`;
  } catch {
    return null;
  }
  if (!CACHEABLE_PATH.test(path)) return null;
  const bareHost = target.hostname.replace(/^www\./, '');
  return new URL(`https://${allowedHosts.has(bareHost) ? bareHost : target.hostname}${path}`);
}
