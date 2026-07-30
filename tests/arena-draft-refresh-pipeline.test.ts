import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArenaDraftRefreshPipeline } from '../server/arenaDraftRefreshPipeline.js';

const stateDirectory = mkdtempSync(join(tmpdir(), 'arena-draft-refresh-'));
let now = new Date('2026-07-30T12:00:00.000Z');
let refreshCalls = 0;
let finishRefresh: ((value: {
  cohortId: string;
  patchVersion: string | null;
  sourceRows: number;
  qualityScore: number;
  publishedClasses: string[];
}) => void) | null = null;

const pipeline = createArenaDraftRefreshPipeline({
  stateDirectory,
  schedule: '17 * * * *',
  now: () => now,
  createRunId: () => 'run-success',
  refresh: () => {
    refreshCalls += 1;
    return new Promise(resolve => { finishRefresh = resolve; });
  },
});

const manual = pipeline.run('manual');
const concurrent = pipeline.run('scheduled');
assert.equal(refreshCalls, 1, 'concurrent triggers must share one source refresh');
assert.equal(pipeline.status().isRunning, true);

finishRefresh?.({
  cohortId: '36.0:pool',
  patchVersion: '36.0',
  sourceRows: 500,
  qualityScore: 100,
  publishedClasses: ['ALL', 'MAGE'],
});
const [manualResult, concurrentResult] = await Promise.all([manual, concurrent]);
assert.equal(manualResult.deduplicated, false);
assert.equal(concurrentResult.deduplicated, true);
assert.equal(manualResult.run.id, 'run-success');
assert.equal(manualResult.run.status, 'succeeded');
assert.equal(manualResult.run.sourceRows, 500);
assert.deepEqual(manualResult.run.publishedClasses, ['ALL', 'MAGE']);

const successfulStatus = pipeline.status();
assert.equal(successfulStatus.isRunning, false);
assert.equal(successfulStatus.lastSuccessAt, now.toISOString());
assert.equal(successfulStatus.runs.length, 1);
assert.equal(successfulStatus.schedule, '17 * * * *');

const failureDirectory = mkdtempSync(join(tmpdir(), 'arena-draft-refresh-failure-'));
const failureEvents: Record<string, unknown>[] = [];
const failingPipeline = createArenaDraftRefreshPipeline({
  stateDirectory: failureDirectory,
  schedule: '17 * * * *',
  now: () => now,
  createRunId: () => 'run-failure',
  refresh: async () => { throw new Error('private upstream path and token'); },
  onEvent: event => failureEvents.push(event),
});
const failed = await failingPipeline.run('scheduled');
assert.equal(failed.run.status, 'failed');
assert.equal(failed.run.errorCode, 'ARENA_DRAFT_REFRESH_FAILED');
assert.equal(JSON.stringify(failed).includes('private upstream path'), false);
assert.equal(JSON.stringify(failureEvents).includes('private upstream path'), false);
assert.equal(failureEvents[0]?.event, 'arena_draft_refresh_completed');

const safeCodePipeline = createArenaDraftRefreshPipeline({
  stateDirectory: mkdtempSync(join(tmpdir(), 'arena-draft-refresh-safe-code-')),
  schedule: '17 * * * *',
  now: () => now,
  refresh: async () => { throw new Error('ARENA_DRAFT_SOURCE_UNAVAILABLE'); },
});
assert.equal(
  (await safeCodePipeline.run('scheduled')).run.errorCode,
  'ARENA_DRAFT_SOURCE_UNAVAILABLE',
);

const synchronousFailurePipeline = createArenaDraftRefreshPipeline({
  stateDirectory: mkdtempSync(join(tmpdir(), 'arena-draft-refresh-sync-failure-')),
  schedule: '17 * * * *',
  now: () => now,
  refresh: () => { throw new Error('synchronous private failure'); },
});
assert.equal(
  (await synchronousFailurePipeline.run('startup')).run.status,
  'failed',
);
assert.equal(synchronousFailurePipeline.status().isRunning, false);

const observerFailurePipeline = createArenaDraftRefreshPipeline({
  stateDirectory: mkdtempSync(join(tmpdir(), 'arena-draft-refresh-observer-failure-')),
  schedule: '17 * * * *',
  now: () => now,
  refresh: async () => ({
    cohortId: '36.0:pool',
    patchVersion: '36.0',
    sourceRows: 500,
    qualityScore: 100,
    publishedClasses: ['ALL'],
  }),
  onEvent: () => { throw new Error('logger unavailable'); },
  onMetric: () => { throw new Error('metrics unavailable'); },
});
assert.equal(
  (await observerFailurePipeline.run('scheduled')).run.status,
  'succeeded',
);

const persistedFailure = readFileSync(
  join(failureDirectory, 'arena-draft-refresh-state-v1.json'),
  'utf8',
);
assert.equal(persistedFailure.includes('private upstream path'), false);
assert.equal(JSON.parse(persistedFailure).runs.length, 1);

const interruptedDirectory = mkdtempSync(join(tmpdir(), 'arena-draft-refresh-interrupted-'));
writeFileSync(join(interruptedDirectory, 'arena-draft-refresh-state-v1.json'), JSON.stringify({
  schemaVersion: 1,
  updatedAt: '2026-07-30T11:00:00.000Z',
  schedule: '17 * * * *',
  lastAttemptAt: '2026-07-30T11:00:00.000Z',
  lastSuccessAt: null,
  runs: [{
    id: 'interrupted-run',
    trigger: 'startup',
    status: 'running',
    startedAt: '2026-07-30T11:00:00.000Z',
    finishedAt: null,
    durationMs: null,
    cohortId: null,
    patchVersion: null,
    sourceRows: null,
    qualityScore: null,
    publishedClasses: [],
    errorCode: null,
  }],
}));
const recoveredPipeline = createArenaDraftRefreshPipeline({
  stateDirectory: interruptedDirectory,
  schedule: '17 * * * *',
  now: () => now,
  refresh: async () => {
    throw new Error('not called');
  },
});
const recovered = recoveredPipeline.status();
assert.equal(recovered.isRunning, false);
assert.equal(recovered.runs[0]?.status, 'failed');
assert.equal(recovered.runs[0]?.errorCode, 'PROCESS_INTERRUPTED');
assert.equal(recovered.runs[0]?.finishedAt, now.toISOString());

console.log('arena draft refresh pipeline tests passed');
