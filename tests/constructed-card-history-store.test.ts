import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ConstructedCardHistoryStore } from '../server/modules/constructedCards/public.js';

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

  const capped = new ConstructedCardHistoryStore({ stateDirectory: join(directory, 'capped'), now: () => now });
  const firstSnapshot = Date.parse('2026-08-20T00:00:00.000Z');
  for (let index = 0; index < 1005; index++) {
    capped.recordSnapshot('standard', '1d', 'legend', new Date(firstSnapshot + index * 10 * 60_000).toISOString(), cards);
  }
  const cappedPoints = capped.read('standard', '1d', 'legend', 'CARD_1', 90);
  assert.equal(cappedPoints.length, 1000);
  assert.equal(cappedPoints.at(-1)?.recordedAt, new Date(firstSnapshot + 1004 * 600_000).toISOString(),
    'a capped range must keep the newest snapshots, not stop days before today');
  assert.ok(Date.parse(cappedPoints[0].recordedAt) < Date.parse(cappedPoints[1].recordedAt), 'points stay oldest first');
  assert.equal(capped.trackedSince('standard', '1d', 'legend', 'card_1'), new Date(firstSnapshot).toISOString(),
    'the history start is known beyond the returned cap');
  assert.equal(capped.trackedSince('standard', '1d', 'legend', 'MISSING_CARD'), null);
  capped.close();

  const averages = new ConstructedCardHistoryStore({ stateDirectory: join(directory, 'averages'), now: () => now });
  const sampled = (id: string, cardClass: string, deckWinrate: number | null, timesPlayed: number, winrateWhenPlayed: number | null) => ({
    card_id: id, class: cardClass, stats: { deckPopularity: 1, deckWinrate, timesPlayed, winrateWhenPlayed },
  });
  averages.recordSnapshot('standard', '1d', 'legend', '2026-08-28T08:00:00.000Z', [
    sampled('MAGE_1', 'MAGE', 50, 100, 52),
    sampled('MAGE_2', 'MAGE', 56, 300, null),
    sampled('ROGUE_1', 'ROGUE', 40, 600, 44),
    sampled('NEW_1', 'MAGE', null, 2, null),
  ]);
  const formatAverage = averages.readAverages('standard', '1d', 'legend', null, '2026-08-01T00:00:00.000Z', 1);
  assert.equal(formatAverage.length, 1);
  assert.ok(Math.abs((formatAverage[0].deckWinrate ?? 0) - (50 * 100 + 56 * 300 + 40 * 600) / 1000) < 1e-9,
    'the average is weighted by plays and ignores cards without a sample');
  assert.ok(Math.abs((formatAverage[0].winrateWhenPlayed ?? 0) - (52 * 100 + 44 * 600) / 700) < 1e-9,
    'cards without a played winrate do not dilute it');
  const mageAverage = averages.readAverages('standard', '1d', 'legend', ['mage_1', 'MAGE_2', 'NEW_1'], '2026-08-01T00:00:00.000Z', 1);
  assert.ok(Math.abs((mageAverage[0].deckWinrate ?? 0) - (50 * 100 + 56 * 300) / 400) < 1e-9);
  assert.deepEqual(averages.readAverages('standard', '1d', 'legend', null, '2026-08-01T00:00:00.000Z', 4), [],
    'a snapshot with too few sampled cards has no average');
  assert.deepEqual(averages.readAverages('standard', '1d', 'legend', [], '2026-08-01T00:00:00.000Z', 1), []);
  averages.close();

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
