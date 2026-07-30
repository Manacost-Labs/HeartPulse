import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArenaSynergyAnalysisLoader } from '../server/adminArenaSynergyService.js';

const A = { id: 'A', card_id: 'A', name: 'Альфа', count: 1, cost: 2 };
const B = { id: 'B', card_id: 'B', name: 'Бета', count: 1, cost: 3 };
const F = { id: 'F', card_id: 'F', name: 'Заполнитель', count: 1, cost: 1 };
const winningDecks = {
  fetched_at: '2026-07-30T10:00:00Z',
  data: {
    structured: {
      decks: Array.from({ length: 20 }, (_, index) => ({
        draft_id: `run-${index}`,
        record: index < 8 ? '12 - 0' : '12 - 2',
        main_class: 'MAGE',
        played_at: `2026-07-30T09:${String(index).padStart(2, '0')}:00Z`,
        player: `player-${index}`,
        final_deck: index < 8 ? [A, B, F] : [F],
        added: [],
        discarded: [],
      })),
    },
  },
};
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

let upstreamFails = false;
const stateDirectory = mkdtempSync(join(tmpdir(), 'arena-synergy-service-'));
const load = createArenaSynergyAnalysisLoader({
  stateDirectory,
  fetchDataset: async datasetId => {
    if (upstreamFails) throw new Error('private upstream path');
    if (datasetId === 'hsreplay_arena_winning_decks') return winningDecks;
    if (datasetId === 'hsreplay_arena_cards_advanced') return cardStats;
    return patches;
  },
  now: () => new Date('2026-07-30T12:00:00Z'),
  cacheTtlMs: 1,
});

const live = await load('ALL', { forceRefresh: true });
assert.equal(live.reliability.servedFrom, 'live');
assert.equal(live.history.length, 1);

upstreamFails = true;
const fallback = await load('ALL', { forceRefresh: true });
assert.equal(fallback.reliability.servedFrom, 'last-known-good');
assert.equal(fallback.reliability.sampleMode, 'last-known-good');
assert.ok(fallback.summary.warnings.some(message => message.includes('последний надёжный')));
assert.equal(JSON.stringify(fallback).includes('private upstream path'), false);

await assert.rejects(
  () => load('MAGE', { forceRefresh: true }),
  /ARENA_SYNERGY_SOURCE_UNAVAILABLE/,
  'fallback must not cross class boundaries',
);

const persistenceErrors: unknown[] = [];
const loadWithoutPersistence = createArenaSynergyAnalysisLoader({
  stateDirectory,
  fetchDataset: async datasetId => {
    if (datasetId === 'hsreplay_arena_winning_decks') return winningDecks;
    if (datasetId === 'hsreplay_arena_cards_advanced') return cardStats;
    return patches;
  },
  now: () => new Date('2026-07-30T12:00:00Z'),
  historyStore: {
    save: () => { throw new Error('read-only filesystem'); },
    saveMany: () => { throw new Error('read-only filesystem'); },
    latest: () => null,
    previous: () => null,
    history: () => [],
  },
  onError: error => persistenceErrors.push(error),
});
const withoutPersistence = await loadWithoutPersistence('ALL', { forceRefresh: true });
assert.equal(withoutPersistence.reliability.servedFrom, 'live');
assert.ok(withoutPersistence.summary.warnings.some(message => message.includes('историю')));
assert.equal(persistenceErrors.length, 1);

console.log('admin arena synergy service tests passed');
