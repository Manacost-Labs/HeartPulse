import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
import express from 'express';
import { registerReplaySharesRateLimit } from '../server/app/registerReplayShares.js';
import type { ApplicationAuthManager, ApplicationToken } from '../server/modules/applicationAuth/public.js';
import {
  createReplayShareRouter,
  createSqliteReplayShareRepository,
  initializeReplayShareRepository,
  REPLAY_KEEP_DAYS,
  sanitizeReplayText,
  type SanitizedReplay,
} from '../server/modules/replayShares/public.js';

// ---- the sanitizer on its own -------------------------------------------------------------------------------------

const known = new Set(['zoolock']);
const constructed = (summary: Record<string, unknown>, lines: string[]) =>
  ['HPR4', JSON.stringify({ kind: 'constructed', summary, localRank: 5, truncated: false, events: lines.length }), ...lines, ''].join('\n');
const battlegrounds = (summary: Record<string, unknown>, lines: string[], game: unknown) =>
  ['HPR4', JSON.stringify({ kind: 'battlegrounds', summary }), ...lines, `G ${JSON.stringify(game)}`, ''].join('\n');
const accepted = (text: string): SanitizedReplay => {
  const result = sanitizeReplayText(text, known);
  assert.ok(!('code' in result), `refused: ${JSON.stringify(result)}`);
  return result;
};
const refused = (text: string) => (sanitizeReplayText(text, known) as { code?: string }).code;
const summaryOf = (text: string) => accepted(text).header.summary as Record<string, unknown>;
const lines = (replay: SanitizedReplay) => replay.text.split('\n').slice(2).filter(Boolean);

const game = constructed({ mode: 'Ranked', result: 'Win', heroCardId: 'HERO_07', opponentArchetype: 'Zoolock', ratingBefore: 5000, playerName: 'Zulut' },
  ['T 1 L 0', 'E 1 O HAND 2 - - ORIGIN=start', 'E 5 L HAND 1 CS2_029 SPELL', 'B', 'P 5 -', 'N 1 42', 'K 42 CS2_032 3 played 0', 'R WON']);

const clean = accepted(game);
assert.equal(clean.events, 6);
// The post-game lines (opponent cards the log revealed) are never published.
assert.ok(!/\n[NK] /.test(clean.text));
// Ranks, ratings and names are not kept; a known archetype is.
assert.deepEqual(Object.keys(clean.header.summary as object).sort(), ['heroCardId', 'mode', 'opponentArchetype', 'result', 'seconds', 'turns']);
assert.equal((clean.header as Record<string, unknown>).localRank, undefined);
// Free text is refused; an unknown archetype is dropped.
assert.equal(refused(game.replace('R WON', 'R hello world')), 'INVALID_LINE');
assert.equal(summaryOf(game.replace('Zoolock', 'Bob from school')).opponentArchetype, undefined);
assert.equal(refused('HPR3\n{}\n'), 'UNSUPPORTED_FORMAT');

// Zones: only the app's (PLAY, GRAVEYARD, HAND, SECRET); a card in the opponent's deck is not a replay line.
assert.equal(refused(constructed({}, ['E 8 O DECK 9 CS2_032 SPELL'])), 'INVALID_LINE');
assert.equal(refused(constructed({}, ['E 8 L SETASIDE 1 CS2_032 SPELL'])), 'INVALID_LINE');
// The opponent's hand and secrets are card backs, and their tag changes go with them.
const backs = lines(accepted(constructed({}, [
  'E 7 O HAND 3 EX1_116 MINION', 'V 7 COST 5', 'E 9 O SECRET 1 EX1_130 SPELL', 'V 9 COST 2', 'E 4 O PLAY 1 CS2_120 MINION', 'V 4 ATK 3',
])));
assert.deepEqual(backs, ['E 7 O HAND 3 - -', 'E 9 O SECRET 1 - -', 'E 4 O PLAY 1 CS2_120 MINION', 'V 4 ATK 3']);
// Once the card is played it is seen, and its changes are kept again.
assert.deepEqual(lines(accepted(constructed({}, ['E 7 O HAND 3 EX1_116 MINION', 'E 7 O PLAY 1 EX1_116 MINION', 'V 7 ATK 3']))),
  ['E 7 O HAND 3 - -', 'E 7 O PLAY 1 EX1_116 MINION', 'V 7 ATK 3']);
// A word in a card's place is not a card id; the few real ids without an underscore are.
assert.equal(refused(constructed({}, ['E 5 L PLAY 1 Zulut MINION'])), 'INVALID_LINE');
assert.equal(refused(constructed({}, ['c Zulut1234'])), 'INVALID_LINE');
accepted(constructed({}, ['E 5 L PLAY 1 skele21 MINION']));

// Summary: modes, results, formats, game types and classes from fixed lists; the date without the time.
const scam = summaryOf(constructed({
  mode: 't.me/scam_channel', result: 'Zulut1234', format: 'FT_SCAM', gameType: 'GT_HELLO', playerClass: 'ZULUT',
  heroCardId: 'Zulut', startedAt: '2026-11-01T21:37:05Z', deckCode: 'aGVsbG8gd29ybGQ=',
}, ['R WON']));
assert.equal(scam.mode, 'Other');
assert.equal(scam.result, 'Unknown');
for (const key of ['format', 'gameType', 'playerClass', 'heroCardId', 'deckCode']) assert.equal(scam[key], undefined, key);
assert.equal(scam.startedAt, '2026-11-01T00:00:00Z');
const real = summaryOf(constructed({ mode: 'Casual', result: 'Loss', format: 'FT_WILD', gameType: 'GT_CASUAL', playerClass: 'MAGE',
  deckCode: 'AAEBAQcAAAA=' }, ['R LOST']));
assert.deepEqual([real.mode, real.result, real.format, real.gameType, real.playerClass, real.deckCode],
  ['Casual', 'Loss', 'FT_WILD', 'GT_CASUAL', 'MAGE', 'AAEBAQcAAAA=']);

// Battlegrounds G line: only the app's keys; a name under any other key does not survive.
const lobbyGame = { rounds: [{ turn: 1, tier: 1, health: 30, board: [], shop: ['BGS_004'], player: 'Zulut' }],
  lobby: [{ heroCardId: 'TB_BaconShop_HERO_01', place: 1, local: true, player: 'Zulut', tag: 'Zulut-2187' }], notes: 'Zulut' };
const bg = accepted(battlegrounds({ mode: 'Battlegrounds', placement: 3, tribes: ['BEAST', 'ZULUT'] }, ['T 1 0'], lobbyGame));
assert.ok(!bg.text.includes('Zulut') && bg.text.includes('TB_BaconShop_HERO_01'));
assert.deepEqual((bg.header.summary as Record<string, unknown>).tribes, ['BEAST']);
// A name where a card id goes refuses the file.
assert.equal(refused(battlegrounds({}, [], { rounds: [], lobby: [{ heroCardId: 'Zulut', place: 1, local: false }] })), 'INVALID_LINE');
assert.equal(refused(battlegrounds({}, [], { rounds: [{ turn: 1, opponentHero: 'Zulut' }], lobby: [] })), 'INVALID_LINE');
// Bob's offer leaves view when the combat starts; the combat opponent is seen only in the combat.
const view = lines(accepted(battlegrounds({}, [
  'T 1 0', 'E 20 B PLAY 1 BGS_004 MINION', 'E 30 O PLAY 1 BGS_039 MINION', 'V 30 ATK 4', 'F 1 0', 'E 21 B PLAY 1 BGS_004 MINION',
  'E 31 O PLAY 1 BGS_039 MINION', 'f WIN 0 3', 'T 2 0',
], { rounds: [], lobby: [] }))).filter(line => !line.startsWith('G '));
assert.deepEqual(view, ['T 1 0', 'E 20 B PLAY 1 BGS_004 MINION', 'F 1 0', 'X 20', 'E 31 O PLAY 1 BGS_039 MINION', 'f WIN 0 3', 'X 31', 'T 2 0']);

// ---- upload and read limits -------------------------------------------------------------------------------------------

const limited = express();
registerReplaySharesRateLimit(limited);
limited.all('/api/v1/tracker/replays/:id?', (_request, response) => { response.status(204).end(); });
limited.get('/api/v1/replays/:id', (_request, response) => { response.status(204).end(); });
const limitServer = limited.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => { limitServer.once('listening', resolve); limitServer.once('error', reject); });
try {
  const limitAddress = limitServer.address();
  assert.ok(limitAddress && typeof limitAddress === 'object');
  const limitBase = `http://127.0.0.1:${limitAddress.port}/api/v1`;
  for (let i = 0; i < 20; i++) assert.equal((await fetch(`${limitBase}/tracker/replays`, { method: 'POST' })).status, 204);
  assert.equal((await fetch(`${limitBase}/tracker/replays`, { method: 'POST' })).status, 429);
  // Deleting is not an upload: it works after the upload limit.
  assert.equal((await fetch(`${limitBase}/tracker/replays/abcDEF1234`, { method: 'DELETE' })).status, 204);
  // The site's own page reads over loopback: every viewer, so it is not limited.
  for (let i = 0; i < 125; i++) assert.equal((await fetch(`${limitBase}/replays/abcDEF1234`)).status, 204);
} finally {
  limitServer.close();
}

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
const router = createReplayShareRouter({
  accessTokens, repository, knownArchetypes: known, setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  userAuth: request => request.headers.cookie === 'session=user-1' ? { id: 'user-1' } : null, publicOrigin: 'https://hearthpulse.net',
  resolveCardNames: async ids => Object.fromEntries(ids.filter(id => id === 'CS2_029').map(id => [id, 'Огненный шар'])),
  now: () => clock,
});
app.use('/api', router);
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

  // Public and not cached by proxies; read twice (the second from the server's own cache).
  for (let i = 0; i < 2; i++) {
    const read = await fetch(`${base}/v1/replays/${id}`);
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('cache-control'), 'private, no-store');
    assert.equal(read.headers.get('x-robots-tag'), 'noindex');
    const body = await read.json() as { kind: string; text: string; cardNames: Record<string, string> };
    assert.equal(body.kind, 'constructed');
    assert.ok(!body.text.includes('\nK ') && !body.text.includes('Zulut'));
    assert.deepEqual(body.cardNames, { CS2_029: 'Огненный шар' });
  }

  // The account page lists it; the data export carries it; another account cannot delete it; the link's token can,
  // and the replay is gone at once (not served from the read cache).
  const listed = await fetch(`${base}/account/replays`, { headers: { cookie: 'session=user-1' } });
  assert.equal(((await listed.json()) as { replays: unknown[] }).replays.length, 1);
  const exported = [...repository.exportRows('user-1', clock)].map(row => JSON.parse(row) as { id: string; text: string });
  assert.deepEqual(exported.map(row => row.id), [id]);
  assert.ok(exported[0].text.startsWith('HPR4\n'));
  assert.equal([...repository.exportRows('user-2', clock)].length, 0);
  assert.equal((await fetch(`${base}/v1/tracker/replays/${id}`, { method: 'DELETE', headers: { authorization: 'Bearer token-2' } })).status, 404);
  assert.equal((await fetch(`${base}/v1/tracker/replays/${id}`, { method: 'DELETE', headers: { 'x-delete-token': deleteToken } })).status, 204);
  assert.equal((await fetch(`${base}/v1/replays/${id}`)).status, 404);

  // The game's event id links the replay in the profile's game list (plan 2.3): only a UUID, never published.
  const gameId = '6f1d2c1e-4b5a-5f0e-9a51-3c7b8d2e9f10';
  assert.equal((await upload({ ...hpr(game), gameId: 'Zulut-2187' })).status, 400);
  const withGame = await (await upload({ ...hpr(game), gameId })).json() as { id: string; deleteToken: string };
  const publicRead = await (await fetch(`${base}/v1/replays/${withGame.id}`)).json() as Record<string, unknown>;
  assert.ok(!JSON.stringify(publicRead).includes(gameId));
  assert.deepEqual(repository.replaysOfGames('user-1', [gameId, 'other'], clock), { [gameId]: withGame.id });
  // The account's own data export carries it.
  const exportedGame = [...repository.exportRows('user-1', clock)].map(row => JSON.parse(row) as { id: string; gameId: string | null })
    .find(row => row.id === withGame.id);
  assert.equal(exportedGame?.gameId, gameId);
  assert.deepEqual(repository.replaysOfGames('user-2', [gameId], clock), {});
  assert.equal((await fetch(`${base}/v1/tracker/replays/${withGame.id}`, { method: 'DELETE', headers: { 'x-delete-token': withGame.deleteToken } })).status, 204);
  assert.deepEqual(repository.replaysOfGames('user-1', [gameId], clock), {});

  // Deleting from the account page, and the retention: the prune runs on its own (the daily timer), without an upload.
  const second = await (await upload(hpr(game))).json() as { id: string };
  assert.equal((await fetch(`${base}/v1/replays/${second.id}`)).status, 200);
  assert.equal((await fetch(`${base}/account/replays/${second.id}`, { method: 'DELETE', headers: { cookie: 'session=user-1' } })).status, 204);
  assert.equal((await fetch(`${base}/v1/replays/${second.id}`)).status, 404);
  await upload(hpr(game));
  clock += (REPLAY_KEEP_DAYS + 1) * 86_400_000;
  router.prune();
  assert.equal(Number((database.prepare('SELECT COUNT(*) AS n FROM replay_shares').get() as { n: number }).n), 0);
} finally {
  server.close();
}
console.log('replay shares: ok');
