import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import express from 'express';
import type { ApplicationAuthManager, ApplicationToken } from '../server/modules/applicationAuth/public.js';
import {
  createReplayShareRouter,
  createSqliteReplayShareRepository,
  initializeReplayShareRepository,
  REPLAY_KEEP_DAYS,
  sanitizeReplayText,
} from '../server/modules/replayShares/public.js';

// ---- the sanitizer on its own -------------------------------------------------------------------------------------

const known = new Set(['zoolock']);
const constructed = (summary: Record<string, unknown>, lines: string[]) =>
  ['HPR4', JSON.stringify({ kind: 'constructed', summary, localRank: 5, truncated: false, events: lines.length }), ...lines, ''].join('\n');
const game = constructed({ mode: 'Ranked', heroCardId: 'HERO_07', opponentArchetype: 'Zoolock', ratingBefore: 5000, playerName: 'Zulut' },
  ['T 1 L 0', 'E 1 O HAND 2 - - ORIGIN=start', 'E 5 L HAND 1 CS2_029 SPELL', 'B', 'P 5 -', 'N 1 42', 'K 42 CS2_032 3 played 0', 'R WON']);

const clean = sanitizeReplayText(game, known);
assert.ok(!('code' in clean));
assert.equal(clean.events, 6);
// The post-game lines (opponent cards the log revealed) are never published.
assert.ok(!/\n[NK] /.test(clean.text));
// Ranks, ratings and names are not kept; a known archetype is.
assert.deepEqual(Object.keys(clean.header.summary as object).sort(), ['heroCardId', 'mode', 'opponentArchetype']);
assert.equal((clean.header as Record<string, unknown>).localRank, undefined);
// Free text is refused; an unknown archetype is dropped.
assert.equal((sanitizeReplayText(game.replace('R WON', 'R hello world'), known) as { code: string }).code, 'INVALID_LINE');
assert.equal(((sanitizeReplayText(game.replace('Zoolock', 'Bob from school'), known) as { header: { summary: Record<string, unknown> } })
  .header.summary.opponentArchetype), undefined);
// A Battlegrounds G line keeps ids and numbers, never a name.
const bg = ['HPR4', JSON.stringify({ kind: 'battlegrounds', summary: { placement: 3 } }), 'T 1 0',
  'G {"lobby":[{"hero":"TB_BaconShop_HERO_01","place":1,"playerName":"Zulut"}]}', ''].join('\n');
const bgClean = sanitizeReplayText(bg, known);
assert.ok(!('code' in bgClean) && !bgClean.text.includes('Zulut') && bgClean.text.includes('TB_BaconShop_HERO_01'));
assert.equal((sanitizeReplayText('HPR3\n{}\n', known) as { code: string }).code, 'UNSUPPORTED_FORMAT');

// ---- the routes -------------------------------------------------------------------------------------------------------

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users(id) VALUES (\'user-1\'), (\'user-2\');');
initializeReplayShareRepository(() => database);
const repository = createSqliteReplayShareRepository(() => database);
const token = (userId: string): ApplicationToken => ({
  id: `token-${userId}`, familyId: 'family', clientId: 'manacost-tracker', userId, scopes: ['tracker.write'], accessTokenHash: 'unused',
  refreshTokenHash: 'unused', accessExpiresAt: Date.now() + 60_000, refreshExpiresAt: Date.now() + 60_000, createdAt: Date.now(),
  revokedAt: null, replacedById: null,
});
const accessTokens = {
  authenticate: (value: unknown) => value === 'token-1' ? token('user-1') : value === 'token-2' ? token('user-2') : null,
} as Pick<ApplicationAuthManager, 'authenticate'>;
let clock = Date.now();
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api', createReplayShareRouter({
  accessTokens, repository, knownArchetypes: known, setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  userAuth: request => request.headers.cookie === 'session=user-1' ? { id: 'user-1' } : null, publicOrigin: 'https://hearthpulse.net',
  now: () => clock,
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api`;
const upload = (body: unknown, bearer = 'token-1') => fetch(`${base}/v1/tracker/replays`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` }, body: JSON.stringify(body),
});
const hpr = (text: string) => ({ v: 1, hpr: gzipSync(text).toString('base64') });

try {
  assert.equal((await upload(hpr(game), 'nope')).status, 401);
  assert.equal((await upload({ v: 1, hpr: 'not base64!' })).status, 400);
  assert.equal((await upload(hpr(game.replace('R WON', 'R hello world')))).status, 400);

  const created = await upload(hpr(game));
  assert.equal(created.status, 201);
  const { id, url, deleteToken } = await created.json() as { id: string; url: string; deleteToken: string };
  assert.equal(url, `https://hearthpulse.net/replay/${id}`);

  const read = await fetch(`${base}/v1/replays/${id}`);
  assert.equal(read.status, 200);
  const body = await read.json() as { kind: string; text: string };
  assert.equal(body.kind, 'constructed');
  assert.ok(!body.text.includes('\nK ') && !body.text.includes('Zulut'));

  // The account page lists it; another account cannot delete it; the link's token can.
  const listed = await fetch(`${base}/account/replays`, { headers: { cookie: 'session=user-1' } });
  assert.equal(((await listed.json()) as { replays: unknown[] }).replays.length, 1);
  assert.equal((await fetch(`${base}/v1/tracker/replays/${id}`, { method: 'DELETE', headers: { authorization: 'Bearer token-2' } })).status, 404);
  assert.equal((await fetch(`${base}/v1/tracker/replays/${id}`, { method: 'DELETE', headers: { 'x-delete-token': deleteToken } })).status, 204);
  assert.equal((await fetch(`${base}/v1/replays/${id}`)).status, 404);

  // Deleting from the account page, and the retention.
  const second = await (await upload(hpr(game))).json() as { id: string };
  assert.equal((await fetch(`${base}/account/replays/${second.id}`, { method: 'DELETE', headers: { cookie: 'session=user-1' } })).status, 204);
  const old = await (await upload(hpr(game))).json() as { id: string };
  clock += (REPLAY_KEEP_DAYS + 1) * 86_400_000;
  assert.equal((await fetch(`${base}/v1/replays/${old.id}`)).status, 404);
  await upload(hpr(game));
  assert.equal(Number((database.prepare('SELECT COUNT(*) AS n FROM replay_shares').get() as { n: number }).n), 1);
} finally {
  server.close();
}
console.log('replay shares: ok');
