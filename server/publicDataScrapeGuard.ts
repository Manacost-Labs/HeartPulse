import { readFileSync } from 'node:fs';
import { promises as dnsPromises } from 'node:dns';
import { isIP } from 'node:net';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { isPublicDataApiRequest, publicDataRouteTemplate } from './apiRateLimitPolicy.js';
import { getTrustedClientIp } from './networkBoundary.js';

export type ScrapeGuardMode = 'enforce' | 'log';

export interface ScrapeGuardConfig {
  mode: ScrapeGuardMode;
  shortWindowSeconds: number;
  shortMax: number;
  longWindowSeconds: number;
  longMax: number;
  accountMultiplier: number;
  maxTrackedClients: number;
  bots: {
    dnsTimeoutMs: number;
    positiveTtlSeconds: number;
    negativeTtlSeconds: number;
    errorTtlSeconds: number;
    cacheSize: number;
  };
}

export const DEFAULT_SCRAPE_GUARD_CONFIG: ScrapeGuardConfig = {
  mode: 'log',
  shortWindowSeconds: 60,
  shortMax: 60,
  longWindowSeconds: 3600,
  longMax: 1500,
  accountMultiplier: 3,
  maxTrackedClients: 50_000,
  bots: {
    dnsTimeoutMs: 1000,
    positiveTtlSeconds: 86_400,
    negativeTtlSeconds: 3600,
    errorTtlSeconds: 60,
    cacheSize: 5000,
  },
};

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Merges a parsed JSON document over the defaults; invalid fields keep the default. */
export function parseScrapeGuardConfig(raw: unknown): ScrapeGuardConfig {
  const d = DEFAULT_SCRAPE_GUARD_CONFIG;
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const bots = (src.bots && typeof src.bots === 'object' ? src.bots : {}) as Record<string, unknown>;
  return {
    mode: src.mode === 'enforce' ? 'enforce' : 'log',
    shortWindowSeconds: positiveNumber(src.shortWindowSeconds, d.shortWindowSeconds),
    shortMax: positiveNumber(src.shortMax, d.shortMax),
    longWindowSeconds: positiveNumber(src.longWindowSeconds, d.longWindowSeconds),
    longMax: positiveNumber(src.longMax, d.longMax),
    accountMultiplier: Math.max(1, positiveNumber(src.accountMultiplier, d.accountMultiplier)),
    maxTrackedClients: positiveNumber(src.maxTrackedClients, d.maxTrackedClients),
    bots: {
      dnsTimeoutMs: positiveNumber(bots.dnsTimeoutMs, d.bots.dnsTimeoutMs),
      positiveTtlSeconds: positiveNumber(bots.positiveTtlSeconds, d.bots.positiveTtlSeconds),
      negativeTtlSeconds: positiveNumber(bots.negativeTtlSeconds, d.bots.negativeTtlSeconds),
      errorTtlSeconds: positiveNumber(bots.errorTtlSeconds, d.bots.errorTtlSeconds),
      cacheSize: positiveNumber(bots.cacheSize, d.bots.cacheSize),
    },
  };
}

/** A missing or broken file falls back to the defaults, which run in log mode. */
export function loadScrapeGuardConfig(filePath: string): ScrapeGuardConfig {
  try {
    return parseScrapeGuardConfig(JSON.parse(readFileSync(filePath, 'utf8')));
  } catch (error) {
    console.warn('[public-data-guard] config unreadable, using log-mode defaults:', (error as Error)?.message ?? error);
    return DEFAULT_SCRAPE_GUARD_CONFIG;
  }
}

interface BotFamily {
  name: string;
  userAgent: RegExp;
  hostSuffixes: string[];
}

const BOT_FAMILIES: BotFamily[] = [
  { name: 'google', userAgent: /googlebot|google-inspectiontool/i, hostSuffixes: ['googlebot.com', 'google.com'] },
  { name: 'yandex', userAgent: /yandex(bot|images|metrika|direct|accessibilitybot|mobilebot|favicons|webmaster)/i, hostSuffixes: ['yandex.ru', 'yandex.net', 'yandex.com'] },
  { name: 'bing', userAgent: /bingbot/i, hostSuffixes: ['search.msn.com'] },
];

export function botFamilyForUserAgent(userAgent: unknown): BotFamily | null {
  const ua = String(userAgent ?? '');
  return BOT_FAMILIES.find(family => family.userAgent.test(ua)) ?? null;
}

export interface BotDnsResolver {
  reverse(ip: string): Promise<string[]>;
  forward(hostname: string): Promise<string[]>;
}

export const systemBotDnsResolver: BotDnsResolver = {
  reverse: ip => dnsPromises.reverse(ip),
  async forward(hostname) {
    const [v4, v6] = await Promise.all([
      dnsPromises.resolve4(hostname).catch(() => [] as string[]),
      dnsPromises.resolve6(hostname).catch(() => [] as string[]),
    ]);
    return [...v4, ...v6];
  },
};

export function canonicalIp(ip: string): string {
  const raw = String(ip).trim().replace(/^::ffff:/i, '');
  const family = isIP(raw);
  if (family === 4) return raw;
  if (family === 6) {
    try {
      return new URL(`http://[${raw}]/`).hostname.slice(1, -1);
    } catch {
      return raw.toLowerCase();
    }
  }
  return raw.toLowerCase();
}

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function isLoopbackIp(ip: string): boolean {
  const value = canonicalIp(ip);
  return value === '::1' || value === 'localhost' || /^127\./.test(value);
}

/** Per-client key: IPv4 as is, IPv6 by its /64 prefix (same as the nginx map). */
export function scrapeGuardClientKey(ip: string): string {
  return ipKeyGenerator(canonicalIp(ip) || 'unknown', 64);
}

interface CacheEntry { verified: boolean; expiresAt: number }

export interface BotVerifier {
  /** Cached verdict without any DNS work: true/false, or null when unknown. */
  peek(ip: string, family: BotFamily): boolean | null;
  verify(ip: string, family: BotFamily): Promise<boolean>;
}

export function createBotVerifier(
  options: ScrapeGuardConfig['bots'],
  resolver: BotDnsResolver = systemBotDnsResolver,
  now: () => number = Date.now,
): BotVerifier {
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<boolean>>();
  const cacheKey = (ip: string, family: BotFamily) => `${family.name}|${canonicalIp(ip)}`;

  function remember(key: string, verified: boolean, ttlSeconds: number): void {
    cache.delete(key);
    cache.set(key, { verified, expiresAt: now() + ttlSeconds * 1000 });
    while (cache.size > options.cacheSize) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  async function lookup(ip: string, family: BotFamily): Promise<{ verified: boolean; failed: boolean }> {
    const target = canonicalIp(ip);
    const hosts = (await resolver.reverse(target))
      .map(host => host.trim().toLowerCase().replace(/\.$/, ''))
      .filter(host => family.hostSuffixes.some(suffix => hostMatchesSuffix(host, suffix)));
    for (const host of hosts.slice(0, 3)) {
      const addresses = await resolver.forward(host);
      if (addresses.some(address => canonicalIp(address) === target)) return { verified: true, failed: false };
    }
    return { verified: false, failed: false };
  }

  return {
    peek(ip, family) {
      const key = cacheKey(ip, family);
      const entry = cache.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        cache.delete(key);
        return null;
      }
      return entry.verified;
    },
    verify(ip, family) {
      const key = cacheKey(ip, family);
      const cached = this.peek(ip, family);
      if (cached !== null) return Promise.resolve(cached);
      const pending = inFlight.get(key);
      if (pending) return pending;
      const task = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const timeout = new Promise<{ verified: boolean; failed: boolean }>(resolve => {
            timer = setTimeout(() => resolve({ verified: false, failed: true }), options.dnsTimeoutMs);
          });
          const result = await Promise.race([lookup(ip, family), timeout]);
          remember(key, result.verified, result.verified
            ? options.positiveTtlSeconds
            : result.failed ? options.errorTtlSeconds : options.negativeTtlSeconds);
          return result.verified;
        } catch {
          remember(key, false, options.errorTtlSeconds);
          return false;
        } finally {
          if (timer) clearTimeout(timer);
          inFlight.delete(key);
        }
      })();
      inFlight.set(key, task);
      return task;
    },
  };
}

interface Bucket { start: number; count: number }
interface ClientBuckets { short: Bucket; long: Bucket }

export interface ScrapeGuardOptions {
  config: ScrapeGuardConfig;
  /** Stable account id for a request with a live session, or null for a guest. */
  resolveAccountKey?: (req: Request) => string | null;
  resolver?: BotDnsResolver;
  now?: () => number;
  log?: (line: string) => void;
}

export interface ScrapeGuard {
  middleware: RequestHandler;
  /** Exposed for tests and admin tooling. */
  trackedClients(): number;
}

export function createPublicDataScrapeGuard(options: ScrapeGuardOptions): ScrapeGuard {
  const { config } = options;
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.warn(line));
  const verifier = createBotVerifier(config.bots, options.resolver, now);
  const clients = new Map<string, ClientBuckets>();
  const shortMs = config.shortWindowSeconds * 1000;
  const longMs = config.longWindowSeconds * 1000;

  function touch(key: string, time: number): ClientBuckets {
    let entry = clients.get(key);
    if (entry) clients.delete(key);
    if (!entry) entry = { short: { start: time, count: 0 }, long: { start: time, count: 0 } };
    if (time - entry.short.start >= shortMs) entry.short = { start: time, count: 0 };
    if (time - entry.long.start >= longMs) entry.long = { start: time, count: 0 };
    clients.set(key, entry);
    while (clients.size > config.maxTrackedClients) {
      const oldest = clients.keys().next().value;
      if (oldest === undefined) break;
      clients.delete(oldest);
    }
    return entry;
  }

  function emit(event: Record<string, unknown>): void {
    log(JSON.stringify({ event: 'public_data_scrape_guard', mode: config.mode, ...event }));
  }

  const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (!isPublicDataApiRequest(req.method, req.path)) return next();
    const ip = getTrustedClientIp(req);
    // Next SSR, warm-up and other internal callers reach Express over loopback.
    if (!ip || isLoopbackIp(ip)) return next();

    const family = botFamilyForUserAgent(req.headers['user-agent']);
    if (family && verifier.peek(ip, family) === true) return next();

    let accountKey: string | null = null;
    try {
      accountKey = options.resolveAccountKey?.(req) ?? null;
    } catch {
      accountKey = null;
    }
    const prefix = scrapeGuardClientKey(ip);
    const key = accountKey ? `account:${accountKey}` : `ip:${prefix}`;
    const factor = accountKey ? config.accountMultiplier : 1;
    const time = now();
    const entry = touch(key, time);
    entry.short.count += 1;
    entry.long.count += 1;

    const shortLimit = config.shortMax * factor;
    const longLimit = config.longMax * factor;
    const shortOver = entry.short.count > shortLimit;
    const longOver = entry.long.count > longLimit;
    if (!shortOver && !longOver) return next();

    const exceeded = longOver ? { name: 'long', bucket: entry.long, ms: longMs, limit: longLimit }
      : { name: 'short', bucket: entry.short, ms: shortMs, limit: shortLimit };
    const route = publicDataRouteTemplate(req.path);
    const retryAfter = Math.max(1, Math.ceil((exceeded.bucket.start + exceeded.ms - time) / 1000));
    const logExceeded = () => {
      if (exceeded.bucket.count === exceeded.limit + 1) {
        emit({
          type: 'limit_exceeded',
          window: exceeded.name,
          client: accountKey ? 'account' : prefix,
          route,
          count: exceeded.bucket.count,
          limit: exceeded.limit,
          botClaim: family?.name ?? null,
        });
      }
    };
    const reject = () => {
      logExceeded();
      if (config.mode !== 'enforce') return next();
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('Cache-Control', 'no-store');
      res.status(429).json({ error: 'Слишком много запросов к открытым данным. Попробуйте позже.', retryAfterSeconds: retryAfter });
    };

    if (!family) return reject();
    // Claimed search bot over budget: verify by reverse and forward DNS, once per cache window.
    void verifier.verify(ip, family).then(verified => {
      if (verified) {
        emit({ type: 'bot_verified', bot: family.name, client: prefix, route });
        return next();
      }
      return reject();
    }, () => reject());
  };

  return { middleware, trackedClients: () => clients.size };
}
