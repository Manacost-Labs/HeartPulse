import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ConstructedCardHistoryStore } from '../server/constructedCardHistoryStore.js';

const directory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-history-'));
let now = Date.parse('2026-07-27T12:00:00.000Z');

try {
  const store = new ConstructedCardHistoryStore({
    stateDirectory: directory,
    now: () => now,
    retentionDays: 30,
  });

  const cards = [{
    card_id: 'CARD_1',
    stats: {
      deckPopularity: 12.5,
      deckWinrate: 54.3,
      averageCopies: 1.4,
      timesPlayed: 240,
      winrateWhenPlayed: 57.2,
      winrateWhenDrawn: 55.1,
      keepPercentage: 43.2,
      openingHandWinrate: 52.4,
      averageTurnsInHand: 2.8,
      averageTurnPlayed: 4.1,
    },
  }, {
    card_id: 'CARD_WITHOUT_STATS',
    stats: null,
  }];

  assert.equal(store.recordSnapshot('standard', '1d', 'legend', '2026-07-27T10:00:00.000Z', cards), 1);
  assert.equal(
    store.recordSnapshot('standard', '1d', 'legend', '2026-07-27T10:00:00.000Z', cards),
    0,
    'the same upstream snapshot must be idempotent',
  );
  assert.equal(store.read('standard', '1d', 'legend', 'CARD_1', 90).length, 1);
  assert.deepEqual(store.read('standard', '1d', 'legend', 'CARD_1', 90)[0], {
    recordedAt: '2026-07-27T10:00:00.000Z',
    deckPopularity: 12.5,
    deckWinrate: 54.3,
    averageCopies: 1.4,
    timesPlayed: 240,
    winrateWhenPlayed: 57.2,
    winrateWhenDrawn: 55.1,
    keepPercentage: 43.2,
    openingHandWinrate: 52.4,
    averageTurnsInHand: 2.8,
    averageTurnPlayed: 4.1,
  });
  assert.deepEqual(store.read('wild', '1d', 'legend', 'CARD_1', 90), []);
  assert.deepEqual(store.read('standard', '7d', 'legend', 'CARD_1', 90), []);
  assert.deepEqual(store.read('standard', '1d', 'diamond', 'CARD_1', 90), []);
  assert.deepEqual(store.read('standard', '1d', 'legend', 'CARD_WITHOUT_STATS', 90), []);
  assert.equal(
    store.recordSnapshot('standard', '1d', 'diamond', '2026-07-27T10:00:00.000Z', cards),
    1,
    'rank slices must keep independent snapshots even at the same timestamp',
  );
  assert.equal(store.read('standard', '1d', 'diamond', 'CARD_1', 90).length, 1);

  store.close();
  const restarted = new ConstructedCardHistoryStore({
    stateDirectory: directory,
    now: () => now,
    retentionDays: 30,
  });
  assert.equal(restarted.read('standard', '1d', 'legend', 'card_1', 90).length, 1,
    'history must survive process restarts and card ID casing');

  now = Date.parse('2026-08-28T12:00:00.000Z');
  restarted.recordSnapshot('standard', '1d', 'legend', '2026-08-28T10:00:00.000Z', cards);
  assert.deepEqual(
    restarted.read('standard', '1d', 'legend', 'CARD_1', 90).map(point => point.recordedAt),
    ['2026-08-28T10:00:00.000Z'],
    'snapshots older than the configured retention window must be removed',
  );
  restarted.close();

  const legacyDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-history-legacy-'));
  try {
    const legacyStateDirectory = join(legacyDirectory, 'constructed-card-history-v1');
    mkdirSync(legacyStateDirectory, { recursive: true });
    const legacyDatabase = new DatabaseSync(join(legacyStateDirectory, 'history.sqlite'));
    legacyDatabase.exec(`
      CREATE TABLE card_stat_history (
        format TEXT NOT NULL,
        period TEXT NOT NULL,
        card_id TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        deck_popularity REAL,
        deck_winrate REAL,
        average_copies REAL,
        times_played INTEGER,
        winrate_when_played REAL,
        winrate_when_drawn REAL,
        keep_percentage REAL,
        opening_hand_winrate REAL,
        average_turns_in_hand REAL,
        average_turn_played REAL,
        PRIMARY KEY (format, period, card_id, recorded_at)
      ) WITHOUT ROWID;
      INSERT INTO card_stat_history (
        format, period, card_id, recorded_at, deck_popularity
      ) VALUES ('wild', '7d', 'LEGACY_1', '2026-07-27T10:00:00.000Z', 6.5);
    `);
    legacyDatabase.close();
    const migrated = new ConstructedCardHistoryStore({
      stateDirectory: legacyDirectory,
      now: () => Date.parse('2026-07-27T12:00:00.000Z'),
    });
    assert.equal(migrated.read('wild', '7d', 'legend', 'LEGACY_1', 90)[0]?.deckPopularity, 6.5);
    assert.deepEqual(migrated.read('wild', '7d', 'platinum', 'LEGACY_1', 90), []);
    migrated.close();
  } finally {
    rmSync(legacyDirectory, { recursive: true, force: true });
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('constructed-card history store contracts passed');
