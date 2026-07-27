import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  assert.equal(store.recordSnapshot('standard', '1d', '2026-07-27T10:00:00.000Z', cards), 1);
  assert.equal(
    store.recordSnapshot('standard', '1d', '2026-07-27T10:00:00.000Z', cards),
    0,
    'the same upstream snapshot must be idempotent',
  );
  assert.equal(store.read('standard', '1d', 'CARD_1', 90).length, 1);
  assert.deepEqual(store.read('standard', '1d', 'CARD_1', 90)[0], {
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
  assert.deepEqual(store.read('wild', '1d', 'CARD_1', 90), []);
  assert.deepEqual(store.read('standard', '7d', 'CARD_1', 90), []);
  assert.deepEqual(store.read('standard', '1d', 'CARD_WITHOUT_STATS', 90), []);

  store.close();
  const restarted = new ConstructedCardHistoryStore({
    stateDirectory: directory,
    now: () => now,
    retentionDays: 30,
  });
  assert.equal(restarted.read('standard', '1d', 'card_1', 90).length, 1,
    'history must survive process restarts and card ID casing');

  now = Date.parse('2026-08-28T12:00:00.000Z');
  restarted.recordSnapshot('standard', '1d', '2026-08-28T10:00:00.000Z', cards);
  assert.deepEqual(
    restarted.read('standard', '1d', 'CARD_1', 90).map(point => point.recordedAt),
    ['2026-08-28T10:00:00.000Z'],
    'snapshots older than the configured retention window must be removed',
  );
  restarted.close();
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('constructed-card history store contracts passed');
