import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  createSqlitePlayerGameStore,
  ingestGameBatch,
  initializePlayerGameStore,
  validatePlayerGame,
} from '../server/modules/playerGames/public.js';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const client = { name: 'hearthpulse-desktop', version: '1.4.0' };

const battlegrounds = (id = 'bg-game-0001', overrides: Record<string, unknown> = {}) => ({
  id,
  mode: 'battlegrounds',
  startedAt: '2026-10-22T18:04:11+03:00',
  durationSeconds: 1260,
  turns: 13,
  client,
  battlegrounds: {
    heroCardId: 'BG20_HERO_242',
    placement: 2,
    ratingBefore: 6412,
    ratingAfter: 6451,
    races: ['UNDEAD', 'BEAST', 'BEAST'],
    finalBoard: [{ cardId: 'BG25_008', attack: 48, health: 51, golden: true }],
    combats: [{ turn: 1, result: 'tie', damageDealt: 0, damageTaken: 0 }],
    heroOptions: ['BG20_HERO_242', 'BG22_HERO_000'],
    ...overrides,
  },
  unknownField: 'dropped',
});

const constructed = (id = 'std-game-0001') => ({
  id,
  mode: 'standard',
  startedAt: '2026-10-22T19:10:00Z',
  durationSeconds: 540,
  result: 'win',
  client,
  constructed: {
    playerClass: 'DEATHKNIGHT',
    opponentClass: 'MAGE',
    deckCode: 'AAECAfHhBAA=',
    wentFirst: false,
    rankBefore: { starLevel: 51, legendRank: 812 },
    rankAfter: { starLevel: 51, legendRank: 790 },
  },
});

// Battlegrounds: the server derives the result and normalizes lists.
const bg = validatePlayerGame(battlegrounds(), NOW);
assert.equal(bg.ok, true);
if (bg.ok === true && bg.game.mode === 'battlegrounds') {
  assert.equal(bg.game.result, 'win');
  assert.deepEqual(bg.game.battlegrounds.races, ['BEAST', 'UNDEAD']);
  assert.equal(bg.game.battlegrounds.duos, false);
  assert.equal('unknownField' in bg.game, false);
  assert.equal(bg.game.startedAt, Date.parse('2026-10-22T15:04:11Z'));
}
assert.deepEqual(
  validatePlayerGame(battlegrounds('bg-game-0002', { duos: true, placement: 5 }), NOW),
  { ok: false, id: 'bg-game-0002', code: 'INVALID_GAME', field: 'battlegrounds.placement' },
);
assert.deepEqual(
  validatePlayerGame(battlegrounds('bg-game-0003', { finalBoard: Array(8).fill({ cardId: 'BG25_008', attack: 1, health: 1 }) }), NOW),
  { ok: false, id: 'bg-game-0003', code: 'INVALID_GAME', field: 'battlegrounds.finalBoard' },
);

// Constructed and arena.
assert.equal(validatePlayerGame(constructed(), NOW).ok, true);
const legendOutsideLegend = constructed('std-game-0002');
legendOutsideLegend.constructed.rankAfter = { starLevel: 50, legendRank: 10 };
assert.deepEqual(validatePlayerGame(legendOutsideLegend, NOW),
  { ok: false, id: 'std-game-0002', code: 'INVALID_GAME', field: 'constructed.rankAfter.legendRank' });
const missingResult: Record<string, unknown> = constructed('std-game-0003');
delete missingResult.result;
assert.equal((validatePlayerGame(missingResult, NOW) as { field?: string }).field, 'result');
assert.equal(validatePlayerGame({ ...constructed('arena-game-01'), mode: 'arena', arena: {
  runId: 'run-00000001', playerClass: 'PALADIN', opponentClass: 'ROGUE', gameNumber: 5,
} }, NOW).ok, true);

// Envelope rules.
assert.deepEqual(validatePlayerGame({ ...constructed(), id: 'short' }, NOW),
  { ok: false, id: null, code: 'INVALID_GAME', field: 'id' });
assert.deepEqual(validatePlayerGame({ ...constructed('merc-game-01'), mode: 'mercenaries' }, NOW),
  { ok: false, id: 'merc-game-01', code: 'UNSUPPORTED_MODE', field: 'mode' });
assert.equal((validatePlayerGame({ ...constructed('future-game-01'), startedAt: '2026-10-25T12:00:00Z' }, NOW) as { field?: string }).field, 'startedAt');
assert.equal((validatePlayerGame({ ...constructed('huge-game-001'), padding: 'x'.repeat(17_000) }, NOW) as { code?: string }).code, 'GAME_TOO_LARGE');
assert.equal((validatePlayerGame({ ...constructed('ctrl-game-001'), constructed: { ...constructed().constructed, deckName: 'a\u0000b' } }, NOW) as { field?: string }).field, 'constructed.deckName');

// Storage: idempotent replays, updates and per-batch duplicates.
const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users(id) VALUES (\'user-1\'), (\'user-2\');');
initializePlayerGameStore(() => database);
initializePlayerGameStore(() => database);
const store = createSqlitePlayerGameStore(() => database);

assert.deepEqual(ingestGameBatch(store, 'user-1', [battlegrounds(), constructed(), battlegrounds()], NOW), [
  { id: 'bg-game-0001', status: 'created' },
  { id: 'std-game-0001', status: 'created' },
  { id: 'bg-game-0001', status: 'rejected', code: 'DUPLICATE_ID' },
]);
assert.deepEqual(ingestGameBatch(store, 'user-1', [battlegrounds()], NOW + 1), [{ id: 'bg-game-0001', status: 'unchanged' }]);
assert.deepEqual(ingestGameBatch(store, 'user-1', [battlegrounds('bg-game-0001', { ratingAfter: 6470 })], NOW + 2),
  [{ id: 'bg-game-0001', status: 'updated' }]);
assert.deepEqual(ingestGameBatch(store, 'user-2', [battlegrounds()], NOW), [{ id: 'bg-game-0001', status: 'created' }]);

const stored = store.loadGames('user-1', { mode: 'battlegrounds', since: null, limit: 10 });
assert.equal(stored.length, 1);
assert.equal(stored[0].mode === 'battlegrounds' && stored[0].battlegrounds.ratingAfter, 6470);
const row = database.prepare('SELECT rank_after, legend_rank_after FROM player_games WHERE client_game_id = ?').get('std-game-0001');
assert.deepEqual({ ...row }, { rank_after: 204, legend_rank_after: 790 });

const page = store.listGames('user-1', { limit: 1, since: null, before: null });
assert.equal(page.total, 2);
assert.deepEqual(page.byMode, { battlegrounds: 1, standard: 1, wild: 0, arena: 0 });
assert.equal(page.games[0].id, 'std-game-0001');
assert.ok(page.next);
const second = store.listGames('user-1', { limit: 1, since: null, before: page.next });
assert.equal(second.games[0].id, 'bg-game-0001');
assert.equal(second.next, null);

database.exec("DELETE FROM users WHERE id = 'user-2'");
assert.equal(store.countGames('user-2'), 0);

console.log('player games schema: ok');
