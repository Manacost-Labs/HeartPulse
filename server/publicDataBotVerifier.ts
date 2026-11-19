import { promises as dnsPromises } from 'node:dns';
import { isIP } from 'node:net';
import { ipKeyGenerator } from 'express-rate-limit';

export interface BotVerifierOptions {
  dnsTimeoutMs: number;
  positiveTtlSeconds: number;
  negativeTtlSeconds: number;
  errorTtlSeconds: number;
  cacheSize: number;
}

export interface BotFamily {
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
  return value === '::1' || value === 'localhost' || value.startsWith('127.');
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
  options: BotVerifierOptions,
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
