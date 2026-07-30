import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createArenaSynergyHistoryStore,
  type ArenaSynergyStoredSnapshot,
} from '../server/arenaSynergyHistoryStore.js';
import type { ArenaSynergyPayload } from '../shared/arenaSynergyContract.js';

const stateDirectory = mkdtempSync(join(tmpdir(), 'arena-synergy-history-'));
let now = new Date('2026-07-30T12:00:00.000Z');
const store = createArenaSynergyHistoryStore({
  stateDirectory,
  now: () => now,
});

function payload(cohortId: string, patchVersion: string, selectedClass = 'ALL'): ArenaSynergyPayload {
  return {
    schemaVersion: 2,
    generatedAt: now.toISOString(),
    selectedClass: selectedClass as ArenaSynergyPayload['selectedClass'],
    source: {
      winningDecksFetchedAt: now.toISOString(),
      cardStatsFetchedAt: now.toISOString(),
    },
    cohort: {
      id: cohortId,
      patchVersion,
      patchPublishedAt: now.toISOString(),
      poolFingerprint: `pool-${patchVersion}`,
      from: now.toISOString(),
      to: now.toISOString(),
    },
    summary: {
      runsAvailable: 100,
      runsAnalyzed: 100,
      redraftRuns: 90,
      recordCounts: { '12-2': 100 },
      warnings: [],
    },
    availableClasses: [{ id: 'ALL', label: 'Все классы', runs: 100 }],
    methodology: {
      sampleLimit: 500,
      minimumPairRuns: 5,
      minimumLift: 1.25,
      packageFilterShare: 0.5,
      classStratified: true,
      outcomeMetric: 'Доля побед в завершённом 12-win забеге',
      note: 'test',
    },
    dataQuality: {
      status: 'healthy',
      score: 100,
      metrics: {
        sourceRows: 100,
        validRuns: 100,
        invalidRuns: 0,
        duplicateRuns: 0,
        futureRuns: 0,
        impossibleDecks: 0,
        unknownCardReferences: 0,
        totalCardReferences: 3_000,
        maxClassShare: 0.5,
        maxPlayerShare: 0.02,
        sourceAgeHours: 0,
        volumeRatioToPrevious: null,
      },
      checks: [],
    },
    reliability: {
      sampleMode: 'warming',
      servedFrom: 'live',
      currentWeight: 0.5,
      historicalWeight: 0.5,
      stableAtRuns: 200,
      previousCohortId: null,
      limitations: [],
    },
    history: [],
    combinations: [],
    redraft: [],
  };
}

const first: ArenaSynergyStoredSnapshot = {
  savedAt: now.toISOString(),
  activeCardIds: ['A', 'B'],
  payload: payload('36.0:pool-a', '36.0'),
};
store.save(first);

now = new Date('2026-07-31T12:00:00.000Z');
const second: ArenaSynergyStoredSnapshot = {
  savedAt: now.toISOString(),
  activeCardIds: ['A', 'B', 'C'],
  payload: payload('36.1:pool-b', '36.1'),
};
store.save(second);

assert.equal(store.latest('ALL')?.payload.cohort.id, '36.1:pool-b');
assert.equal(store.previous('ALL', '36.1:pool-b')?.payload.cohort.id, '36.0:pool-a');
assert.deepEqual(
  store.history('ALL').map(item => item.patchVersion),
  ['36.1', '36.0'],
);

store.save({
  ...second,
  savedAt: '2026-07-31T13:00:00.000Z',
  payload: { ...second.payload, summary: { ...second.payload.summary, runsAnalyzed: 120 } },
});
assert.equal(store.history('ALL').length, 2, 'saving the same cohort replaces its snapshot');
assert.equal(store.latest('ALL')?.payload.summary.runsAnalyzed, 120);

writeFileSync(join(stateDirectory, 'arena-synergy-history-v2.json'), '{"snapshots":"broken"}', 'utf8');
assert.equal(store.latest('ALL'), null, 'a malformed history document must fail closed');

const persisted = readFileSync(join(stateDirectory, 'arena-synergy-history-v2.json'), 'utf8');
assert.equal(persisted.includes('same-player'), false, 'player identifiers must never be persisted');

console.log('arena synergy history store tests passed');
