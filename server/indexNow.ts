import type { SemanticSitemapDocument } from './entitySitemapTypes.js';

/**
 * IndexNow (docs/specs/seo-entity-indexing.md, «IndexNow»): after a sitemap
 * segment is rebuilt from its source, the site tells Yandex (and through the
 * shared protocol Bing, Seznam, Naver) which of its addresses changed. Google
 * does not take part. The key is public by protocol: search engines read it
 * from `/<key>.txt` to confirm the host, so it lives in the repository.
 */
export type IndexNowConfig = {
  enabled: boolean;
  key: string;
  endpoint: string;
  /** Requests per UTC day, retries included: a runaway rebuild loop cannot flood the endpoint. */
  maxRequestsPerDay: number;
};

/** Protocol limit of one request. */
export const INDEXNOW_MAX_URLS_PER_REQUEST = 10_000;

/**
 * Addresses that are new or changed in `next` against `previous`, and those that
 * left the segment (now noindex or gone, which a search engine should learn too).
 * Without a previous state nothing changed: a first build announces nothing.
 */
export function changedSitemapLocations(
  previous: SemanticSitemapDocument | null,
  next: SemanticSitemapDocument,
): string[] {
  if (!previous) return [];
  const before = new Map(previous.entries.map(entry => [entry.key, entry]));
  const kept = new Set<string>();
  const changed = new Set<string>();
  for (const entry of next.entries) {
    kept.add(entry.key);
    const old = before.get(entry.key);
    if (!old || old.semanticHash !== entry.semanticHash || old.location !== entry.location) changed.add(entry.location);
  }
  for (const entry of previous.entries) if (!kept.has(entry.key)) changed.add(entry.location);
  return [...changed];
}

export type IndexNowNotifier = (urls: string[]) => Promise<void>;

type NotifierOptions = {
  config: IndexNowConfig;
  /** Canonical origin; only its own addresses are sent. */
  origin: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** One line per request; never contains the key. */
  log?: (line: string) => void;
  timeoutMs?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * A notifier that posts changed addresses in batches of at most 10 000, retries
 * a 429/5xx/network failure once, and stops at the daily limit. It never throws:
 * a failure costs only the announcement, never the sitemap.
 */
export function createIndexNowNotifier(options: NotifierOptions): IndexNowNotifier {
  const { config } = options;
  const origin = new URL(options.origin).origin;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const log = options.log ?? (line => console.log(line));
  const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const body = (urlList: string[]) => JSON.stringify({
    host: new URL(origin).host, key: config.key, keyLocation: `${origin}/${config.key}.txt`, urlList,
  });
  let day = '';
  let sent = 0;
  const take = (): boolean => {
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) { day = today; sent = 0; }
    if (sent >= config.maxRequestsPerDay) return false;
    sent += 1;
    return true;
  };
  const post = async (urlList: string[]): Promise<void> => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      if (!take()) {
        log(`[indexnow] daily limit ${config.maxRequestsPerDay} reached: ${urlList.length} URL not sent`);
        return;
      }
      let outcome: string;
      try {
        const response = await fetchImpl(config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: body(urlList),
          signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
        });
        if (response.ok) { log(`[indexnow] ${response.status}: ${urlList.length} URL sent`); return; }
        outcome = `HTTP ${response.status}`;
        // Only overload and server errors may pass on a retry; 400/403/422 mean the request itself is wrong.
        if (response.status !== 429 && response.status < 500) {
          log(`[indexnow] rejected (${outcome}): ${urlList.length} URL`);
          return;
        }
      } catch (error) {
        outcome = error instanceof Error ? error.name : 'error';
      }
      log(`[indexnow] attempt ${attempt} failed (${outcome}): ${urlList.length} URL`);
      if (attempt === 1) await sleep(options.retryDelayMs ?? 30_000);
    }
  };
  return async urls => {
    if (!config.enabled) return;
    const own = [...new Set(urls)].filter(url => {
      try { return new URL(url).origin === origin; } catch { return false; }
    });
    for (let start = 0; start < own.length; start += INDEXNOW_MAX_URLS_PER_REQUEST) {
      await post(own.slice(start, start + INDEXNOW_MAX_URLS_PER_REQUEST));
    }
  };
}

/**
 * The site's IndexNow settings. The key must equal the name and the content of
 * `public/<key>.txt`. The server turns the notifier on only in production
 * (`NODE_ENV=production`); setting `enabled` to false switches it off everywhere.
 */
export const INDEXNOW_CONFIG: IndexNowConfig = {
  enabled: true,
  key: '58284b575f81b49cc64477a6413fe046',
  endpoint: 'https://yandex.com/indexnow',
  maxRequestsPerDay: 100,
};
