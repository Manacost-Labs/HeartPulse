import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import type { ApplicationAuthManager, ApplicationToken } from '../server/modules/applicationAuth/public.js';
import {
  appUsageConfig,
  BG_POOL_STATS,
  createAppUsageRouter,
  createSqliteAppUsageRepository,
  initializeAppUsageRepository,
  usageDay,
  type AppUsageConfig,
} from '../server/modules/appUsage/public.js';

// ---- configuration ------------------------------------------------------------------------------------------------

assert.equal(appUsageConfig({}).enabled, false, 'off unless switched on');
assert.deepEqual(appUsageConfig({ APP_USAGE_LIMITS_ENABLED: '1' }).features, [{ key: BG_POOL_STATS, section: 'battlegrounds', freePerDay: 3 }]);
assert.equal(appUsageConfig({ APP_USAGE_LIMITS_ENABLED: '1', APP_USAGE_FREE_PER_DAY: '5' }).features[0].freePerDay, 5);
assert.equal(appUsageConfig({ APP_USAGE_FREE_PER_DAY: 'lots' }).features[0].freePerDay, 3);
assert.deepEqual(usageDay(Date.UTC(2026, 10, 2, 23, 59)), { day: '2026-11-02', resetsAt: '2026-11-03T00:00:00.000Z' });

// ---- routes -------------------------------------------------------------------------------------------------------

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users(id) VALUES (\'free\'), (\'paid\'), (\'other\');');
initializeAppUsageRepository(() => database);
const repository = createSqliteAppUsageRepository(() => database);
const token = (userId: string, scopes: ApplicationToken['scopes'] = ['subscription.read']): ApplicationToken => ({
  id: `token-${userId}`, familyId: 'family', clientId: 'manacost-tracker', userId, scopes, accessTokenHash: 'unused',
  refreshTokenHash: 'unused', accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 60_000, createdAt: Date.now(),
  revokedAt: null, replacedById: null,
});
const accessTokens = {
  authenticate: (value: unknown, scopes: string[]) => {
    if (value === 'narrow') return scopes.includes('subscription.read') ? 'FORBIDDEN' : token('free', ['tracker.write']);
    return value === 'free' || value === 'paid' || value === 'other' ? token(value) : null;
  },
} as unknown as Pick<ApplicationAuthManager, 'authenticate'>;
let clock = Date.UTC(2026, 10, 2, 12);

async function serve(config: AppUsageConfig) {
  const app = express();
  app.use(express.json());
  app.use('/api', createAppUsageRouter({
    accessTokens, repository, config, setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
    hasSection: (userId, section) => userId === 'paid' && section === 'battlegrounds', now: () => clock,
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return { server, base: `http://127.0.0.1:${address.port}/api/v1/usage` };
}

const on = appUsageConfig({ APP_USAGE_LIMITS_ENABLED: '1' });
const { server, base } = await serve(on);
const claim = (bearer: string, body: unknown) => fetch(`${base}/claim`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: JSON.stringify(body),
});
type Claim = { allowed: boolean; unlimited: boolean; used: number; limit: number; resetsAt: string };

try {
  // Public limits, before any sign-in.
  const limits = await (await fetch(`${base}/limits`)).json() as { enabled: boolean; day: string; features: Record<string, { freePerDay: number }> };
  assert.equal(limits.enabled, true);
  assert.equal(limits.day, '2026-11-02');
  assert.equal(limits.features[BG_POOL_STATS].freePerDay, 3);

  // Sign-in and body checks.
  assert.equal((await claim('nope', { feature: BG_POOL_STATS, gameId: randomUUID() })).status, 401);
  assert.equal((await claim('narrow', { feature: BG_POOL_STATS, gameId: randomUUID() })).status, 403);
  assert.equal((await claim('free', { feature: 'mulligan', gameId: randomUUID() })).status, 400, 'only known features');
  assert.equal((await claim('free', { feature: BG_POOL_STATS, gameId: '2026-11-02T12:00' })).status, 400, 'a game id is a UUID, not a time');

  // A free account: three games a day, a game counts once, the fourth is refused.
  const games = [randomUUID(), randomUUID(), randomUUID()];
  for (const [index, gameId] of games.entries()) {
    const answer = await (await claim('free', { feature: BG_POOL_STATS, gameId })).json() as Claim;
    assert.deepEqual([answer.allowed, answer.unlimited, answer.used, answer.limit], [true, false, index + 1, 3]);
  }
  const again = await (await claim('free', { feature: BG_POOL_STATS, gameId: games[0] })).json() as Claim;
  assert.deepEqual([again.allowed, again.used], [true, 3], 'the same game again does not count');
  const fourth = await (await claim('free', { feature: BG_POOL_STATS, gameId: randomUUID() })).json() as Claim;
  assert.deepEqual([fourth.allowed, fourth.used, fourth.resetsAt], [false, 3, '2026-11-03T00:00:00.000Z']);
  const today = await (await fetch(base, { headers: { authorization: 'Bearer free' } })).json() as { usage: Record<string, { used: number; unlimited: boolean }> };
  assert.deepEqual(today.usage[BG_POOL_STATS], { unlimited: false, used: 3, limit: 3 });
  // The count and the insert are one statement: at the limit nothing more is counted, whoever asks.
  assert.equal(repository.claimWithin('free', '2026-11-02', BG_POOL_STATS, randomUUID(), 3, clock), false);
  assert.equal(repository.used('free', '2026-11-02', BG_POOL_STATS), 3);
  // The account's own data export carries its claims (day, feature, random game id, time).
  const exported = [...repository.exportRows('free')].map(row => JSON.parse(row) as { day: string; feature: string; gameId: string });
  assert.deepEqual(exported.map(row => row.gameId).sort(), [...games].sort());
  assert.ok(exported.every(row => row.day === '2026-11-02' && row.feature === BG_POOL_STATS));

  // Another account has its own count; a subscriber of the section has no limit and nothing is stored.
  assert.equal(((await (await claim('other', { feature: BG_POOL_STATS, gameId: randomUUID() })).json()) as Claim).used, 1);
  for (let i = 0; i < 5; i++) {
    const paid = await (await claim('paid', { feature: BG_POOL_STATS, gameId: randomUUID() })).json() as Claim;
    assert.deepEqual([paid.allowed, paid.unlimited], [true, true]);
  }
  assert.equal(Number((database.prepare("SELECT COUNT(*) AS n FROM app_usage_claims WHERE user_id = 'paid'").get() as { n: number }).n), 0);

  // The next UTC day starts again; old claims are pruned after a week.
  clock += 86_400_000;
  assert.equal(((await (await claim('free', { feature: BG_POOL_STATS, gameId: randomUUID() })).json()) as Claim).used, 1);
  clock += 8 * 86_400_000;
  assert.ok(repository.prune(clock) >= 5);
  assert.equal(Number((database.prepare('SELECT COUNT(*) AS n FROM app_usage_claims').get() as { n: number }).n), 0);

  // Deleting the account deletes its claims.
  repository.claim('other', '2026-11-11', BG_POOL_STATS, randomUUID(), clock);
  database.exec("DELETE FROM users WHERE id = 'other'");
  assert.equal(Number((database.prepare("SELECT COUNT(*) AS n FROM app_usage_claims WHERE user_id = 'other'").get() as { n: number }).n), 0);
} finally {
  server.close();
}

// Switched off: every claim is allowed and nothing is stored.
const off = await serve(appUsageConfig({}));
try {
  const before = Number((database.prepare('SELECT COUNT(*) AS n FROM app_usage_claims').get() as { n: number }).n);
  for (let i = 0; i < 5; i++) {
    const answer = await (await fetch(`${off.base}/claim`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer free' },
      body: JSON.stringify({ feature: BG_POOL_STATS, gameId: randomUUID() }),
    })).json() as Claim;
    assert.deepEqual([answer.allowed, answer.unlimited], [true, true]);
  }
  assert.equal(Number((database.prepare('SELECT COUNT(*) AS n FROM app_usage_claims').get() as { n: number }).n), before);
  assert.equal(((await (await fetch(`${off.base}/limits`)).json()) as { enabled: boolean }).enabled, false);
} finally {
  off.server.close();
}
console.log('app usage routes: ok');
