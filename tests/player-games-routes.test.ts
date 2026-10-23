import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import type { ApplicationAuthManager, ApplicationToken } from '../server/modules/applicationAuth/public.js';
import { createPlayerStatsRouter, createPlayerStatsService, validateStatisticsPayload } from '../server/modules/playerGames/public.js';
import { registerPlayerGames } from '../server/app/registerPlayerGames.js';
import {
  createSqliteTrackerEventRepository,
  createTrackerIngestionRouter,
  initializeTrackerEventRepository,
} from '../server/modules/trackerIngestion/public.js';

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users(id) VALUES (\'user-1\'), (\'user-2\');');
initializeTrackerEventRepository(() => database);
const repository = createSqliteTrackerEventRepository(() => database);
const token = (userId: string): ApplicationToken => ({
  id: `token-${userId}`, familyId: 'family', clientId: 'manacost-tracker', userId, scopes: ['tracker.write'],
  accessTokenHash: 'unused', refreshTokenHash: 'unused', accessExpiresAt: Date.now() + 60_000,
  refreshExpiresAt: Date.now() + 60_000, createdAt: Date.now(), revokedAt: null, replacedById: null,
});
let entitled = false;
let globalCalls = 0;

const service = createPlayerStatsService({
  loadEvents: repository.listEvents,
  countEvents: repository.countEvents,
  global: {
    battlegroundsHeroes: async () => {
      globalCalls += 1;
      return [{ heroId: '1', cardId: 'BG20_HERO_242', averagePlacement: 4.1, pickRatePercent: 31.5,
        placementPercent: [14, 13, 13, 12, 12, 12, 12, 12] }];
    },
    battlegroundsHeroCombat: async () => [{ turn: 1, winrate: 48.2 }],
    arenaClasses: async () => { throw new Error('upstream down'); },
  },
  resolveCardNames: async ids => Object.fromEntries(ids.map(id => [id, `name:${id}`])),
  now: () => Date.parse('2026-10-23T12:00:00Z'),
});
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api/v1', createTrackerIngestionRouter({
  accessTokens: { authenticate: (value: unknown) => (value === 'one' ? token('user-1') : value === 'two' ? token('user-2') : null) } as
    Pick<ApplicationAuthManager, 'authenticate'>,
  repository,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  validatePayload: validateStatisticsPayload,
  onStored: service.invalidate,
  now: () => Date.parse('2026-10-23T12:00:00Z'),
}));
app.use('/api', createPlayerStatsRouter({
  userAuth: request => (request.headers.cookie === 'session=1' ? { id: 'user-1' } : null),
  hasEntitlement: async () => entitled,
  service,
  setPrivateNoStore: response => response.set('Cache-Control', 'no-store'),
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const origin = `http://127.0.0.1:${address.port}`;

const event = (type: string, occurredAt: string, payload: Record<string, unknown>, schemaVersion = 2) =>
  ({ eventId: randomUUID(), type, schemaVersion, occurredAt, payload });
const bg = (day: number, placement: number, ratingAfter: number) => event('battlegrounds_match', `2026-10-${day}T18:00:00Z`, {
  durationSeconds: 1200, heroCardId: 'BG20_HERO_242', placement, ratingBefore: ratingAfter - 20, ratingAfter,
  finalBoard: { minions: [{ cardId: 'BG25_008', attack: 10, health: 12, golden: false }] },
  combats: [{ turn: 1, result: 'win' }, { turn: 2, result: 'loss', damageTaken: 4 }],
  heroOptions: ['BG20_HERO_242', 'BG22_HERO_000'],
});
const arena = (game: number, result: string) => event('arena_match', `2026-10-22T1${game}:00:00Z`, {
  durationSeconds: 600, result, runId: 'arena-run-0001', playerClass: 'PALADIN', opponentClass: 'ROGUE', gameNumber: game,
});
const upload = (events: unknown[], authorization = 'Bearer one') => fetch(`${origin}/api/v1/tracker/events/batch`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization }, body: JSON.stringify({ events }),
});
const stats = (query: string, cookie = 'session=1') => fetch(`${origin}/api/account/game-stats?${query}`, { headers: { cookie } });

try {
  assert.equal((await fetch(`${origin}/api/account/game-stats/modes`, { headers: { cookie: 'session=1' } })).status, 200);
  assert.deepEqual((await (await fetch(`${origin}/api/account/game-stats/modes`, { headers: { cookie: 'session=1' } })).json()).modes,
    { battlegrounds: 0, standard: 0, wild: 0, arena: 0 }, 'no events: the page shows no section');
  const games = [bg(20, 1, 6400), bg(21, 6, 6380), arena(1, 'win'), arena(2, 'loss'),
    event('constructed_match', '2026-10-01T10:00:00Z', { matchId: 'legacy-v1', turns: 8 }, 1)];
  const accepted = await (await upload(games)).json();
  assert.equal(accepted.accepted.length, 5);
  assert.equal((await (await upload(games)).json()).accepted.length, 5, 'a replay is acknowledged, not duplicated');
  await upload([bg(22, 8, 1000)], 'Bearer two');

  // Cookie session only, own events only.
  const anonymous = await stats('mode=battlegrounds', '');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get('cache-control'), 'no-store');
  assert.equal((await stats('mode=mercenaries')).status, 400);
  assert.equal((await stats('mode=battlegrounds&period=year')).status, 400);

  assert.deepEqual((await (await fetch(`${origin}/api/account/game-stats/modes`, { headers: { cookie: 'session=1' } })).json()).modes,
    { battlegrounds: 2, standard: 0, wild: 0, arena: 2 }, 'opaque v1 events do not open a tab');
  assert.equal((await fetch(`${origin}/api/account/game-stats/modes`)).status, 401);

  const free = await (await stats('mode=battlegrounds')).json();
  assert.equal(free.games, 2);
  assert.equal(free.summary.highestRating, 6400);
  assert.equal(free.summary.averagePlacement, 3.5);
  assert.deepEqual(free.summary.placements, [1, 0, 0, 0, 0, 1, 0, 0]);
  assert.deepEqual(free.ratingSeries.map((point: { rating: number }) => point.rating), [6400, 6380]);
  assert.equal(free.global.availability, 'subscription');
  assert.equal(free.heroes[0].global, null);
  assert.deepEqual([free.heroes[0].offered, free.heroes[0].picked], [2, 2]);
  assert.deepEqual(free.heroes[0].combat, [{ turn: 1, winrate: 100, rounds: 2 }, { turn: 2, winrate: 0, rounds: 2 }]);
  assert.equal(free.cards.BG25_008, 'name:BG25_008');
  assert.equal(globalCalls, 0, 'paid global data is not even requested without the entitlement');

  entitled = true;
  const paid = await (await stats('mode=battlegrounds&mmr=TOP_20_PERCENT')).json();
  assert.equal(paid.global.availability, 'available');
  assert.equal(paid.heroes[0].global.averagePlacement, 4.1);
  assert.deepEqual(paid.heroes[0].global.combat, [{ turn: 1, winrate: 48.2 }]);
  await stats('mode=battlegrounds&mmr=TOP_20_PERCENT');
  assert.equal(globalCalls, 1, 'global heroes are cached per query');

  assert.equal((await (await stats('mode=battlegrounds&duos=1')).json()).games, 0);
  assert.equal((await (await stats('mode=battlegrounds&period=7')).json()).games, 2);
  assert.equal((await (await stats('mode=battlegrounds')).json()).games, 2, 'served from the cache');

  // Answers are cached per account and query, and a new upload drops the account's cache.
  await upload([bg(22, 3, 6420)]);
  assert.equal((await (await stats('mode=battlegrounds&duos=0')).json()).games, 3);

  const arenaStats = await (await stats('mode=arena')).json();
  assert.equal(arenaStats.summary.runs, 1);
  assert.deepEqual([arenaStats.runs[0].wins, arenaStats.runs[0].losses], [1, 1]);
  assert.equal(arenaStats.global.availability, 'unavailable', 'a failing global source hides comparisons');

  // The final arena_run record is the run's score, even before every game was uploaded.
  await upload([event('arena_run', '2026-10-22T19:00:00Z', { runId: 'arena-run-0001', playerClass: 'PALADIN', wins: 5, losses: 3 })]);
  const recorded = await (await stats('mode=arena')).json();
  assert.deepEqual([recorded.runs[0].wins, recorded.runs[0].losses, recorded.runs[0].complete], [5, 3, true]);

  const standard = await (await stats('mode=standard')).json();
  assert.equal(standard.games, 0, 'an opaque v1 constructed event has no statistics');
} finally {
  server.close();
}

// Switched off unless PLAYER_STATS_ENABLED=1: no routes, nothing for the page to show.
const disabled = express();
const off = registerPlayerGames({ app: disabled, loadEvents: () => [], countEvents: () => ({}), userAuth: () => ({ id: 'user-1' }),
  hasEntitlement: async () => false, global: {}, setPrivateNoStore: () => {}, environment: {} });
off.invalidate('user-1');
const disabledServer = disabled.listen(0, '127.0.0.1');
await new Promise<void>(resolve => disabledServer.once('listening', resolve));
const disabledAddress = disabledServer.address();
assert.ok(disabledAddress && typeof disabledAddress === 'object');
assert.equal((await fetch(`http://127.0.0.1:${disabledAddress.port}/api/account/game-stats/modes`)).status, 404);
disabledServer.close();

console.log('player games routes: ok');
