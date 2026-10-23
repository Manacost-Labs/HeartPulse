import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import {
  createPlayerGameRouter,
  createPlayerStatsRouter,
  createPlayerStatsService,
  createSqlitePlayerGameStore,
  initializePlayerGameStore,
  type GameUploadToken,
} from '../server/modules/playerGames/public.js';

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users(id) VALUES (\'user-1\');');
initializePlayerGameStore(() => database);
const store = createSqlitePlayerGameStore(() => database);

const tokens: Record<string, GameUploadToken> = {
  desktop: { userId: 'user-1', clientId: 'hearthpulse-desktop', scopes: ['openid', 'profile'] },
  reader: { userId: 'user-1', clientId: 'manacost-reader', scopes: ['openid'] },
};
const verified: string[] = [];
let entitled = false;
let globalCalls = 0;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1', createPlayerGameRouter({
  accessTokens: { verify: async value => { verified.push(value); return tokens[value] ?? null; } },
  store,
  setPrivateNoStore: response => response.set('Cache-Control', 'no-store'),
}));
app.use('/api', createPlayerStatsRouter({
  userAuth: request => (request.headers.cookie === 'session=1' ? { id: 'user-1' } : null),
  hasEntitlement: async () => entitled,
  service: createPlayerStatsService({
    store,
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
  }),
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

const client = { name: 'hearthpulse-desktop', version: '1.4.0' };
const bgGame = (id: string, placement: number, ratingAfter: number) => ({
  id, mode: 'battlegrounds', startedAt: `2026-10-2${placement % 3}T18:0${placement}:00Z`, durationSeconds: 1200, client,
  battlegrounds: { heroCardId: 'BG20_HERO_242', placement, ratingBefore: ratingAfter - 20, ratingAfter,
    finalBoard: [{ cardId: 'BG25_008', attack: 10, health: 12, golden: false }],
    combats: [{ turn: 1, result: 'win' }, { turn: 2, result: 'loss', damageTaken: 4 }],
    heroOptions: ['BG20_HERO_242', 'BG22_HERO_000'] },
});
const arenaGame = (id: string, result: string, gameNumber: number) => ({
  id, mode: 'arena', startedAt: `2026-10-22T1${gameNumber}:00:00Z`, durationSeconds: 600, result, client,
  arena: { runId: 'arena-run-0001', playerClass: 'PALADIN', opponentClass: 'ROGUE', gameNumber },
});
const post = (body: unknown, authorization = 'Bearer desktop') => fetch(`${origin}/api/v1/me/games`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: authorization },
  body: JSON.stringify(body),
});
const stats = (query: string, cookie = 'session=1') => fetch(`${origin}/api/account/game-stats?${query}`, { headers: { cookie } });

try {
  // Authorization at the route boundary.
  const anonymous = await post({ games: [bgGame('bg-game-0001', 1, 6400)] }, '');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get('www-authenticate'), 'Bearer realm="HearthPulse"');
  assert.equal(anonymous.headers.get('cache-control'), 'no-store');
  assert.deepEqual(verified, []);
  assert.equal((await post({ games: [bgGame('bg-game-0001', 1, 6400)] }, 'Bearer unknown')).status, 401);
  const reader = await post({ games: [bgGame('bg-game-0001', 1, 6400)] }, 'Bearer reader');
  assert.equal(reader.status, 403);
  assert.equal((await reader.json()).error.code, 'CLIENT_NOT_ALLOWED');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM player_games').get()?.count, 0);

  // Envelope validation happens before anything is written.
  assert.equal((await post({ games: [] })).status, 400);
  assert.equal((await post({ games: Array(51).fill(bgGame('bg-game-0001', 1, 6400)) })).status, 400);
  const missingId = await post({ games: [bgGame('bg-game-0001', 1, 6400), { mode: 'arena' }] });
  assert.equal(missingId.status, 400);
  assert.equal((await missingId.json()).error.code, 'INVALID_BATCH');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM player_games').get()?.count, 0);

  // Per-item results, idempotent replays.
  const batch = { games: [bgGame('bg-game-0001', 1, 6400), bgGame('bg-game-0002', 6, 6380), arenaGame('arena-game-01', 'win', 1),
    arenaGame('arena-game-02', 'loss', 2), { ...arenaGame('arena-game-03', 'win', 3), arena: { runId: 'x' } }] };
  const accepted = await post(batch);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { results: [
    { id: 'bg-game-0001', status: 'created' },
    { id: 'bg-game-0002', status: 'created' },
    { id: 'arena-game-01', status: 'created' },
    { id: 'arena-game-02', status: 'created' },
    { id: 'arena-game-03', status: 'rejected', code: 'INVALID_GAME', field: 'arena.runId' },
  ] });
  const replay = await (await post(batch)).json();
  assert.deepEqual(replay.results.slice(0, 4).map((result: { status: string }) => result.status),
    ['unchanged', 'unchanged', 'unchanged', 'unchanged']);

  // Sync listing with a cursor.
  const firstPage = await fetch(`${origin}/api/v1/me/games?limit=3`, { headers: { Authorization: 'Bearer desktop' } });
  assert.equal(firstPage.status, 200);
  const page = await firstPage.json();
  assert.equal(page.total, 4);
  assert.deepEqual(page.byMode, { battlegrounds: 2, standard: 0, wild: 0, arena: 2 });
  assert.equal(page.games.length, 3);
  const secondPage = await (await fetch(`${origin}/api/v1/me/games?limit=3&before=${page.nextBefore}`,
    { headers: { Authorization: 'Bearer desktop' } })).json();
  assert.equal(secondPage.games.length, 1);
  assert.equal(secondPage.nextBefore, null);
  assert.equal((await fetch(`${origin}/api/v1/me/games?before=%%%`, { headers: { Authorization: 'Bearer desktop' } })).status, 400);

  // Cookie statistics: no session, bad query, then subscription-gated comparisons.
  assert.equal((await stats('mode=battlegrounds', '')).status, 401);
  assert.equal((await stats('mode=mercenaries')).status, 400);
  const free = await (await stats('mode=battlegrounds')).json();
  assert.equal(free.games, 2);
  assert.equal(free.summary.highestRating, 6400);
  assert.equal(free.summary.averagePlacement, 3.5);
  assert.deepEqual(free.summary.placements, [1, 0, 0, 0, 0, 1, 0, 0]);
  assert.equal(free.global.availability, 'subscription');
  assert.equal(free.heroes[0].global, null);
  assert.equal(free.heroes[0].offered, 2);
  assert.equal(free.heroes[0].picked, 2);
  assert.deepEqual(free.heroes[0].combat, [{ turn: 1, winrate: 100, rounds: 2 }, { turn: 2, winrate: 0, rounds: 2 }]);
  assert.equal(free.cards.BG25_008, 'name:BG25_008');
  assert.equal(globalCalls, 0);

  entitled = true;
  const paid = await (await stats('mode=battlegrounds&mmr=TOP_20_PERCENT')).json();
  assert.equal(paid.global.availability, 'available');
  assert.equal(paid.heroes[0].global.averagePlacement, 4.1);
  assert.deepEqual(paid.heroes[0].global.combat, [{ turn: 1, winrate: 48.2 }]);
  await stats('mode=battlegrounds&mmr=TOP_20_PERCENT');
  assert.equal(globalCalls, 1, 'global heroes are cached per query');

  const duos = await (await stats('mode=battlegrounds&duos=1')).json();
  assert.equal(duos.games, 0);

  const arena = await (await stats('mode=arena')).json();
  assert.equal(arena.summary.runs, 1);
  assert.deepEqual({ wins: arena.runs[0].wins, losses: arena.runs[0].losses }, { wins: 1, losses: 1 });
  assert.equal(arena.global.availability, 'unavailable', 'a failing global source hides comparisons');

  const standard = await (await stats('mode=standard&period=7')).json();
  assert.equal(standard.games, 0);
} finally {
  server.close();
}

console.log('player games routes: ok');
