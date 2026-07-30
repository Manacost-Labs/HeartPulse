import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArenaSynergyAnalysisManager } from '../server/adminArenaSynergyService.js';
import type {
  ArenaSynergyHistoryStore,
  ArenaSynergyStoredSnapshot,
} from '../server/arenaSynergyHistoryStore.js';

const A = { id: 'A', card_id: 'A', name: 'Альфа', count: 1, cost: 2 };
const B = { id: 'B', card_id: 'B', name: 'Бета', count: 1, cost: 3 };
const F = { id: 'F', card_id: 'F', name: 'Заполнитель', count: 1, cost: 1 };

function source(classes: string[]) {
  return {
    fetched_at: '2026-07-30T10:00:00Z',
    data: {
      structured: {
        decks: classes.flatMap(className => Array.from({ length: 20 }, (_, index) => ({
          draft_id: `${className}-${index}`,
          record: index < 8 ? '12 - 0' : '12 - 2',
          main_class: className,
          played_at: `2026-07-30T09:${String(index).padStart(2, '0')}:00Z`,
          player: `${className}-player-${index}`,
          final_deck: [A, B, F],
          added: [],
          discarded: [],
        }))),
      },
    },
  };
}

const cardStats = {
  fetched_at: '2026-07-30T10:00:00Z',
  data: { structured: { cards: [A, B, F] } },
};
const patches = {
  patches: [{
    version: '36.0',
    official_title: 'Arena update',
    official_published_at: '2026-07-29T00:00:00Z',
  }],
};

function memoryHistory(options: { failBatch?: boolean } = {}) {
  const snapshots = new Map<string, ArenaSynergyStoredSnapshot>();
  let batchWrites = 0;
  const store: ArenaSynergyHistoryStore = {
    save(snapshot) {
      snapshots.set(snapshot.payload.selectedClass, snapshot);
    },
    saveMany(batch) {
      batchWrites += 1;
      if (options.failBatch) throw new Error('read-only filesystem path');
      for (const snapshot of batch) snapshots.set(snapshot.payload.selectedClass, snapshot);
    },
    latest(className) {
      return snapshots.get(className) ?? null;
    },
    previous() {
      return null;
    },
    history() {
      return [];
    },
  };
  return { store, snapshots, batchWrites: () => batchWrites };
}

let fetchCalls: string[] = [];
const healthyHistory = memoryHistory();
const manager = createArenaSynergyAnalysisManager({
  stateDirectory: mkdtempSync(join(tmpdir(), 'arena-refresh-manager-')),
  historyStore: healthyHistory.store,
  fetchDataset: async datasetId => {
    fetchCalls.push(datasetId);
    if (datasetId === 'hsreplay_arena_winning_decks') return source(['MAGE', 'HUNTER']);
    if (datasetId === 'hsreplay_arena_cards_advanced') return cardStats;
    return patches;
  },
  now: () => new Date('2026-07-30T12:00:00Z'),
});

const publication = await manager.refreshAll();
assert.equal(fetchCalls.length, 3, 'one refresh must fetch each source exactly once');
assert.equal(healthyHistory.batchWrites(), 1, 'all class snapshots must use one batch write');
assert.deepEqual(
  new Set(publication.publishedClasses),
  new Set(['ALL', 'MAGE', 'HUNTER']),
);
assert.equal(publication.sourceRows, 40);
assert.equal(publication.qualityScore, 100);
assert.equal(healthyHistory.snapshots.size, 3);

const mage = await manager.load('MAGE', { forceRefresh: false });
assert.equal(mage.reliability.servedFrom, 'live');
assert.equal(fetchCalls.length, 3, 'request-time reads must reuse the accepted source batch');

let warningBatchWrites = 0;
const warningManager = createArenaSynergyAnalysisManager({
  stateDirectory: mkdtempSync(join(tmpdir(), 'arena-refresh-warning-')),
  historyStore: {
    ...memoryHistory().store,
    saveMany: () => { warningBatchWrites += 1; },
  },
  fetchDataset: async datasetId => {
    if (datasetId === 'hsreplay_arena_winning_decks') return source(['MAGE']);
    if (datasetId === 'hsreplay_arena_cards_advanced') return cardStats;
    return patches;
  },
  now: () => new Date('2026-07-30T12:00:00Z'),
});
await assert.rejects(
  () => warningManager.refreshAll(),
  /ARENA_SYNERGY_HEALTHY_DATA_REQUIRED/,
);
assert.equal(warningBatchWrites, 0, 'warning data must not publish a candidate batch');

fetchCalls = [];
const failingHistory = memoryHistory({ failBatch: true });
const persistenceManager = createArenaSynergyAnalysisManager({
  stateDirectory: mkdtempSync(join(tmpdir(), 'arena-refresh-persistence-')),
  historyStore: failingHistory.store,
  fetchDataset: async datasetId => {
    fetchCalls.push(datasetId);
    if (datasetId === 'hsreplay_arena_winning_decks') return source(['MAGE', 'HUNTER']);
    if (datasetId === 'hsreplay_arena_cards_advanced') return cardStats;
    return patches;
  },
  now: () => new Date('2026-07-30T12:00:00Z'),
});
await assert.rejects(() => persistenceManager.refreshAll(), /ARENA_DRAFT_PUBLICATION_FAILED/);
await persistenceManager.load('ALL', { forceRefresh: false });
assert.equal(
  fetchCalls.length,
  6,
  'a batch that could not be published must not become the accepted memory cache',
);

console.log('arena synergy refresh manager tests passed');
