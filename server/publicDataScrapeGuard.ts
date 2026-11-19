import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isPublicDataApiRequest, publicDataRouteTemplate } from './apiRateLimitPolicy.js';
import { getTrustedClientIp } from './networkBoundary.js';
import {
  botFamilyForUserAgent,
  createBotVerifier,
  isLoopbackIp,
  scrapeGuardClientKey,
  type BotDnsResolver,
} from './publicDataBotVerifier.js';

export { botFamilyForUserAgent, type BotDnsResolver } from './publicDataBotVerifier.js';

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
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
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

/** Account id of the first live session token; `lookup` reads the sessions table by token hash. */
export function sessionAccountKey(
  tokens: string[],
  lookup: (tokenHash: string, nowMs: number) => string | number | null | undefined,
): string | null {
  for (const token of tokens) {
    const userId = lookup(createHash('sha256').update(token).digest('hex'), Date.now());
    if (userId) return String(userId);
  }
  return null;
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
  /** True when this guard alone budgets the request, so the generic API limiter must skip it. */
  ownsBudget(req: Request): boolean;
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
    const time = now();
    // The IP budget always counts; a live session only raises it, so extra accounts
    // on one IP cannot add budget. The account has its own budget across IPs.
    const factor = accountKey ? config.accountMultiplier : 1;
    const checks = [{ key: `ip:${prefix}`, factor }];
    if (accountKey) checks.push({ key: `account:${accountKey}`, factor });
    let exceeded: { name: string; bucket: Bucket; ms: number; limit: number } | null = null;
    for (const check of checks) {
      const entry = touch(check.key, time);
      entry.short.count += 1;
      entry.long.count += 1;
      const longLimit = config.longMax * check.factor;
      const shortLimit = config.shortMax * check.factor;
      if (entry.long.count > longLimit) exceeded = { name: 'long', bucket: entry.long, ms: longMs, limit: longLimit };
      else if (!exceeded && entry.short.count > shortLimit) exceeded = { name: 'short', bucket: entry.short, ms: shortMs, limit: shortLimit };
    }
    if (!exceeded) return next();
    const over = exceeded;
    const route = publicDataRouteTemplate(req.path);
    const retryAfter = Math.max(1, Math.ceil((over.bucket.start + over.ms - time) / 1000));
    const logExceeded = () => {
      if (over.bucket.count === over.limit + 1) {
        emit({
          type: 'limit_exceeded',
          window: over.name,
          client: accountKey ? 'account' : prefix,
          route,
          count: over.bucket.count,
          limit: over.limit,
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

  return {
    middleware,
    ownsBudget: req => config.mode === 'enforce' && isPublicDataApiRequest(req.method, req.path),
    trackedClients: () => clients.size,
  };
}
