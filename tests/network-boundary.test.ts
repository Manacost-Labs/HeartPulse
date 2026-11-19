import assert from 'node:assert/strict';
import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  createPublicDataScrapeGuard,
  parseScrapeGuardConfig,
  type BotDnsResolver,
} from '../server/publicDataScrapeGuard.js';
import {
  configureLoopbackProxyTrust,
  corsOriginAllowed,
  getTrustedClientIp,
} from '../server/networkBoundary.js';

assert.equal(corsOriginAllowed(
  'https://arena.hs-manacost.ru',
  'https://arena.hs-manacost.ru',
  false,
), true);
assert.equal(corsOriginAllowed(
  'http://arena.hs-manacost.ru',
  'https://arena.hs-manacost.ru',
  false,
), false);
assert.equal(corsOriginAllowed(
  'http://localhost:3000',
  'https://arena.hs-manacost.ru',
  false,
), false);
assert.equal(corsOriginAllowed(
  'http://localhost:3000',
  'https://arena.hs-manacost.ru',
  true,
), true);
assert.equal(corsOriginAllowed(
  'https://localhost:3000',
  'https://arena.hs-manacost.ru',
  true,
), false);
assert.equal(corsOriginAllowed('not an origin', 'https://arena.hs-manacost.ru', true), false);

const app = express();
configureLoopbackProxyTrust(app);
app.get('/client-ip', (req, res) => res.json({ ip: getTrustedClientIp(req), expressIp: req.ip }));
app.use('/limited', rateLimit({
  windowMs: 60_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.ip === '127.0.0.1' || req.ip === '::1',
}));
app.get('/limited', (_req, res) => res.json({ ok: true }));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const endpoint = `http://127.0.0.1:${address.port}/client-ip`;

  const direct = await fetch(endpoint);
  assert.equal(direct.status, 200);
  assert.equal((await direct.json()).ip, '127.0.0.1');

  const proxied = await fetch(endpoint, { headers: { 'X-Forwarded-For': '203.0.113.20' } });
  assert.equal(proxied.status, 200);
  assert.deepEqual(await proxied.json(), { ip: '203.0.113.20', expressIp: '203.0.113.20' });

  const spoofedLeftMost = await fetch(endpoint, {
    headers: { 'X-Forwarded-For': '198.51.100.7, 203.0.113.20' },
  });
  assert.equal(spoofedLeftMost.status, 200);
  assert.deepEqual(await spoofedLeftMost.json(), { ip: '203.0.113.20', expressIp: '203.0.113.20' });

  const firstLimited = await fetch(`${endpoint.replace('/client-ip', '/limited')}`, {
    headers: { 'X-Forwarded-For': '198.51.100.7, 203.0.113.21' },
  });
  assert.equal(firstLimited.status, 200);
  const spoofAttempt = await fetch(`${endpoint.replace('/client-ip', '/limited')}`, {
    headers: { 'X-Forwarded-For': '192.0.2.44, 203.0.113.21' },
  });
  assert.equal(spoofAttempt.status, 429);
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

// --- Public data scrape guard (#479) ---------------------------------------
{
  const GOOGLE_IP = '66.249.66.1';
  const YANDEX_IP = '95.108.213.1';
  const GOOGLE_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
  const YANDEX_UA = 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)';
  const ptr = new Map<string, string[]>([
    [GOOGLE_IP, ['crawl-66-249-66-1.googlebot.com.']],
    [YANDEX_IP, ['95-108-213-1.spider.yandex.com']],
    ['203.0.113.77', ['evil.example.net']],
    ['203.0.113.78', ['crawl-fake.googlebot.com']],
  ]);
  const forward = new Map<string, string[]>([
    ['crawl-66-249-66-1.googlebot.com', [GOOGLE_IP]],
    ['95-108-213-1.spider.yandex.com', [YANDEX_IP]],
    ['crawl-fake.googlebot.com', ['198.51.100.200']],
  ]);
  let reverseCalls = 0;
  const resolver: BotDnsResolver = {
    reverse: async ip => { reverseCalls += 1; return ptr.get(ip) ?? []; },
    forward: async host => forward.get(host) ?? [],
  };

  async function withGuard(
    overrides: Record<string, unknown>,
    run: (call: (path: string, headers?: Record<string, string>) => Promise<Response>, ctx: { advance(ms: number): void; logs: string[] }) => Promise<void>,
    guardResolver: BotDnsResolver = resolver,
  ): Promise<void> {
    let clock = 1_000_000;
    const logs: string[] = [];
    const guardApp = express();
    configureLoopbackProxyTrust(guardApp);
    const guard = createPublicDataScrapeGuard({
      config: parseScrapeGuardConfig({ mode: 'enforce', shortWindowSeconds: 60, shortMax: 3, longWindowSeconds: 3600, longMax: 5, ...overrides }),
      resolver: guardResolver,
      now: () => clock,
      log: line => logs.push(line),
      resolveAccountKey: req => (req.headers['x-test-account'] ? String(req.headers['x-test-account']) : null),
    });
    if (typeof overrides.apiLimiterMax === 'number') {
      guardApp.use('/api/', rateLimit({
        windowMs: 60_000,
        max: overrides.apiLimiterMax,
        standardHeaders: true,
        legacyHeaders: false,
        skip: req => guard.ownsBudget(req) || req.ip === '127.0.0.1',
      }));
    }
    guardApp.use('/api/', guard.middleware);
    guardApp.get('/api/legendaries/public', (_req, res) => res.json({ ok: true }));
    guardApp.get('/api/bg/library/public/minion/:id', (_req, res) => res.json({ ok: true }));
    guardApp.get('/api/Legendaries/Public', (_req, res) => res.json({ ok: true }));
    guardApp.get('/api/standard-meta', (_req, res) => res.json({ ok: true }));
    const guardServer = guardApp.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => guardServer.once('listening', resolve));
    try {
      const addr = guardServer.address();
      assert.ok(addr && typeof addr === 'object');
      await run(
        (path, headers = {}) => fetch(`http://127.0.0.1:${addr.port}${path}`, { headers }),
        { advance: ms => { clock += ms; }, logs },
      );
    } finally {
      await new Promise<void>((resolve, reject) => guardServer.close(error => error ? reject(error) : resolve()));
    }
  }
  const xff = (ip: string, extra: Record<string, string> = {}) => ({ 'X-Forwarded-For': ip, ...extra });

  // Over budget -> 429 with Retry-After and no-store; the window then reopens.
  await withGuard({ shortMax: 3, longMax: 100 }, async (call, ctx) => {
    for (let i = 0; i < 3; i += 1) assert.equal((await call('/api/bg/library/public/minion/' + i, xff('203.0.113.10'))).status, 200);
    const limited = await call('/api/bg/library/public/minion/9', xff('203.0.113.10'));
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) >= 1 && Number(limited.headers.get('retry-after')) <= 60);
    assert.equal(limited.headers.get('cache-control'), 'no-store');
    assert.equal((await call('/api/bg/library/public/minion/9', xff('203.0.113.11'))).status, 200, 'another client is unaffected');
    ctx.advance(61_000);
    assert.equal((await call('/api/bg/library/public/minion/9', xff('203.0.113.10'))).status, 200, 'reopens after the window');
    assert.equal(ctx.logs.filter(line => line.includes('limit_exceeded')).length, 1);
    assert.ok(!ctx.logs.join('').includes('minion/9'), 'log carries a route template, not ids');
  });

  // The long window stops slow scraping that the short window lets through.
  await withGuard({ shortMax: 100, longMax: 5 }, async (call, ctx) => {
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await call('/api/legendaries/public', xff('203.0.113.12'))).status, 200);
      ctx.advance(1000);
    }
    const limited = await call('/api/legendaries/public', xff('203.0.113.12'));
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 60, 'long window Retry-After');
  });

  // Spoofed left-most X-Forwarded-For does not buy a new budget; internal callers are exempt.
  await withGuard({ shortMax: 2, longMax: 100 }, async call => {
    assert.equal((await call('/api/legendaries/public', xff('1.1.1.1, 203.0.113.13'))).status, 200);
    assert.equal((await call('/api/legendaries/public', xff('2.2.2.2, 203.0.113.13'))).status, 200);
    assert.equal((await call('/api/legendaries/public', xff('3.3.3.3, 203.0.113.13'))).status, 429);
    for (let i = 0; i < 10; i += 1) assert.equal((await call('/api/legendaries/public')).status, 200, 'loopback SSR is not limited');
    for (let i = 0; i < 10; i += 1) assert.equal((await call('/api/legendaries/public', xff('127.0.0.1'))).status, 200);
  });

  // IPv6 addresses of one /64 share a budget; another /64 does not.
  await withGuard({ shortMax: 2, longMax: 100 }, async call => {
    assert.equal((await call('/api/legendaries/public', xff('2001:db8:1:2::1'))).status, 200);
    assert.equal((await call('/api/legendaries/public', xff('2001:db8:1:2:aaaa:bbbb:cccc:dddd'))).status, 200);
    assert.equal((await call('/api/legendaries/public', xff('2001:db8:1:2::ffff'))).status, 429);
    assert.equal((await call('/api/legendaries/public', xff('2001:db8:1:3::1'))).status, 200);
  });

  // Non-public paths and accounts: other API stays out of scope; an account gets its own larger budget.
  await withGuard({ shortMax: 2, longMax: 100, accountMultiplier: 3 }, async call => {
    for (let i = 0; i < 10; i += 1) assert.equal((await call('/api/standard-meta', xff('203.0.113.14'))).status, 200);
    for (let i = 0; i < 6; i += 1) assert.equal((await call('/api/legendaries/public', xff('203.0.113.15', { 'x-test-account': 'u1' }))).status, 200);
    assert.equal((await call('/api/legendaries/public', xff('203.0.113.15', { 'x-test-account': 'u1' }))).status, 429);
    assert.equal((await call('/api/legendaries/public', xff('203.0.113.16', { 'x-test-account': 'u1' }))).status, 429, 'account budget follows the account across IPs');
  });

  // Verified search bots pass without limit; DNS runs lazily and is cached.
  await withGuard({ shortMax: 2, longMax: 100 }, async call => {
    reverseCalls = 0;
    assert.equal((await call('/api/legendaries/public', xff(GOOGLE_IP, { 'User-Agent': GOOGLE_UA }))).status, 200);
    assert.equal((await call('/api/legendaries/public', xff(GOOGLE_IP, { 'User-Agent': GOOGLE_UA }))).status, 200);
    assert.equal(reverseCalls, 0, 'no DNS while under budget');
    for (let i = 0; i < 10; i += 1) assert.equal((await call('/api/legendaries/public', xff(GOOGLE_IP, { 'User-Agent': GOOGLE_UA }))).status, 200);
    assert.equal(reverseCalls, 1, 'one DNS verification, then cache');
    for (let i = 0; i < 10; i += 1) assert.equal((await call('/api/legendaries/public', xff(YANDEX_IP, { 'User-Agent': YANDEX_UA }))).status, 200);
  });

  // Forged UA: no PTR in the bot domain, or a PTR whose forward lookup misses the IP -> ordinary client.
  await withGuard({ shortMax: 2, longMax: 100 }, async call => {
    for (const ip of ['203.0.113.77', '203.0.113.78', '203.0.113.79']) {
      assert.equal((await call('/api/legendaries/public', xff(ip, { 'User-Agent': GOOGLE_UA }))).status, 200);
      assert.equal((await call('/api/legendaries/public', xff(ip, { 'User-Agent': GOOGLE_UA }))).status, 200);
      assert.equal((await call('/api/legendaries/public', xff(ip, { 'User-Agent': GOOGLE_UA }))).status, 429, `forged bot ${ip}`);
    }
    // A Yandex PTR does not validate a Googlebot claim.
    assert.equal((await call('/api/legendaries/public', xff(YANDEX_IP, { 'User-Agent': GOOGLE_UA }))).status, 200);
    assert.equal((await call('/api/legendaries/public', xff(YANDEX_IP, { 'User-Agent': GOOGLE_UA }))).status, 200);
    assert.equal((await call('/api/legendaries/public', xff(YANDEX_IP, { 'User-Agent': GOOGLE_UA }))).status, 429);
  });

  // A hanging DNS does not hold the response beyond the timeout.
  await withGuard({ shortMax: 1, longMax: 100, bots: { dnsTimeoutMs: 50 } }, async call => {
    const started = Date.now();
    await call('/api/legendaries/public', xff('203.0.113.80', { 'User-Agent': GOOGLE_UA }));
    const limited = await call('/api/legendaries/public', xff('203.0.113.80', { 'User-Agent': GOOGLE_UA }));
    assert.equal(limited.status, 429);
    assert.ok(Date.now() - started < 1500);
  }, { reverse: () => new Promise<string[]>(() => {}), forward: async () => [] });

  // With the generic API limiter mounted first: in enforce mode the guard is the only budget
  // (verified bot and account are not cut by the 120/min style limiter); in log mode the
  // generic limiter stays as the protective ceiling.
  await withGuard({ mode: 'enforce', shortMax: 50, longMax: 500, apiLimiterMax: 3 }, async call => {
    for (let i = 0; i < 12; i += 1) assert.equal((await call('/api/legendaries/public', xff(GOOGLE_IP, { 'User-Agent': GOOGLE_UA }))).status, 200, 'bot under both middleware');
    for (let i = 0; i < 12; i += 1) assert.equal((await call('/api/legendaries/public', xff('203.0.113.30', { 'x-test-account': 'u9' }))).status, 200, 'account under both middleware');
    for (let i = 0; i < 3; i += 1) assert.equal((await call('/api/standard-meta', xff('203.0.113.31'))).status, 200);
    assert.equal((await call('/api/standard-meta', xff('203.0.113.31'))).status, 429, 'non-public API still uses the generic limiter');
  });
  await withGuard({ mode: 'log', shortMax: 50, longMax: 500, apiLimiterMax: 3 }, async call => {
    for (let i = 0; i < 3; i += 1) assert.equal((await call('/api/legendaries/public', xff('203.0.113.32'))).status, 200);
    assert.equal((await call('/api/legendaries/public', xff('203.0.113.32'))).status, 429, 'log mode keeps the generic ceiling');
  });

  // Case-variant paths are the same Express route and count against the same budget.
  await withGuard({ shortMax: 2, longMax: 100 }, async call => {
    assert.equal((await call('/api/legendaries/public', xff('203.0.113.33'))).status, 200);
    assert.equal((await call('/api/Legendaries/Public', xff('203.0.113.33'))).status, 200);
    assert.equal((await call('/api/legendaries/PUBLIC', xff('203.0.113.33'))).status, 429);
  });

  // Several accounts on one IP do not add budget: the IP ceiling is raised x3 once.
  await withGuard({ shortMax: 2, longMax: 100, accountMultiplier: 3 }, async call => {
    let ok = 0;
    for (let i = 0; i < 12; i += 1) {
      if ((await call('/api/legendaries/public', xff('203.0.113.34', { 'x-test-account': `acc${i % 3}` }))).status === 200) ok += 1;
    }
    assert.equal(ok, 6, 'IP total capped at shortMax x multiplier');
  });

  // Log mode never blocks, but still records the excess.
  await withGuard({ mode: 'log', shortMax: 2, longMax: 100 }, async (call, ctx) => {
    for (let i = 0; i < 8; i += 1) assert.equal((await call('/api/legendaries/public', xff('203.0.113.17'))).status, 200);
    const exceeded = ctx.logs.filter(line => line.includes('limit_exceeded'));
    assert.equal(exceeded.length, 1);
    assert.equal(JSON.parse(exceeded[0]).mode, 'log');
  });

  // Config: unknown mode falls back to the safe log mode.
  assert.equal(parseScrapeGuardConfig({ mode: 'bogus' }).mode, 'log');
  assert.equal(parseScrapeGuardConfig({ mode: 'enforce', shortMax: -4 }).shortMax, 60);
}

console.log('network trust boundary tests passed');
