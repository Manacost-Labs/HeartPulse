import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createParserRunReconciler,
  createParserRunReconciliationFileStore,
  startParserRunRecoveryLoop,
} from '../server/parserRunReconciler.js';

let releasePoll!: () => void;
const pollGate = new Promise<void>(resolve => { releasePoll = resolve; });
let listCalls = 0;
const invalidations: Array<{ reason: string; runId?: string }> = [];
const warnings: string[] = [];
const reconciler = createParserRunReconciler({
  listRuns: async () => {
    listCalls += 1;
    return {
      activeRun: null,
      runs: [{ id: 'run-1', status: 'succeeded' }],
    };
  },
  invalidate: async context => { invalidations.push(context); },
  wait: async () => pollGate,
  now: () => 1_000,
  timeoutMs: 60_000,
  onWarning: (_scope, error) => warnings.push(error instanceof Error ? error.message : String(error)),
});

assert.equal(reconciler.observe({ run: { id: 'run-1', status: 'queued' } }), true);
assert.equal(reconciler.observe({ run: { id: 'run-1', status: 'running' }, deduplicated: true }), false);
assert.equal(reconciler.activeCount(), 1, 'duplicate responses must share one monitor');
releasePoll();
await reconciler.whenIdle();
assert.equal(listCalls, 1);
assert.deepEqual(invalidations, [{ reason: 'manual-run', runId: 'run-1' }]);
assert.deepEqual(warnings, []);

let failedInvalidationAttempts = 0;
const failedReconciler = createParserRunReconciler({
  listRuns: async () => ({ runs: [] }),
  invalidate: async () => {
    failedInvalidationAttempts += 1;
    throw new Error('redis unavailable');
  },
  wait: async () => undefined,
  invalidationRetryAttempts: 1,
  onWarning: (_scope, error) => warnings.push(error instanceof Error ? error.message : String(error)),
});
assert.equal(failedReconciler.observe({ run: { id: 'run-terminal', status: 'partial' } }), true);
await failedReconciler.whenIdle();
assert.equal(failedInvalidationAttempts, 1);
assert.match(warnings.at(-1) ?? '', /redis unavailable/);

let transientInvalidationAttempts = 0;
const retryDelays: number[] = [];
const transientReconciler = createParserRunReconciler({
  listRuns: async () => ({ runs: [] }),
  invalidate: async () => {
    transientInvalidationAttempts += 1;
    if (transientInvalidationAttempts === 1) throw new Error('temporary redis failure');
  },
  wait: async milliseconds => { retryDelays.push(milliseconds); },
  invalidationRetryAttempts: 3,
  invalidationRetryBaseMs: 25,
  onWarning: (_scope, error) => warnings.push(error instanceof Error ? error.message : String(error)),
});
assert.equal(transientReconciler.observe({ run: { id: 'run-retry', status: 'succeeded' } }), true);
await transientReconciler.whenIdle();
assert.equal(transientInvalidationAttempts, 2, 'a transient invalidation failure retries without a restart');
assert.deepEqual(retryDelays, [25]);

const durableDirectory = mkdtempSync(join(tmpdir(), 'parser-run-reconciler-'));
try {
  const stateStore = createParserRunReconciliationFileStore(durableDirectory);
  const interrupted = createParserRunReconciler({
    listRuns: async () => ({ activeRun: { id: 'run-restart', status: 'queued' } }),
    invalidate: async () => undefined,
    stateStore,
    wait: async () => new Promise<void>(() => undefined),
  });
  assert.equal(interrupted.observe({ run: { id: 'run-restart', status: 'queued' } }), true);
  const pendingState = JSON.parse(readFileSync(
    join(durableDirectory, 'parser-run-reconciliation.json'),
    'utf8',
  )) as { runs: Array<{ id: string; resolution: string }> };
  assert.deepEqual(
    pendingState.runs.map(run => ({ id: run.id, resolution: run.resolution })),
    [{ id: 'run-restart', resolution: 'pending' }],
    'an accepted run must be durable before the process can restart',
  );

  let releaseRecoveredPoll!: () => void;
  const recoveredPollGate = new Promise<void>(resolve => { releaseRecoveredPoll = resolve; });
  let recoveryListCalls = 0;
  const restartInvalidations: Array<{ reason: string; runId?: string }> = [];
  const recordRestartInvalidation = async (context: { reason: string; runId?: string }) => {
    restartInvalidations.push(context);
  };
  const restarted = createParserRunReconciler({
    listRuns: async () => {
      recoveryListCalls += 1;
      return recoveryListCalls === 1
        ? { activeRun: { id: 'run-restart', status: 'running' }, runs: [] }
        : { activeRun: null, runs: [{ id: 'run-restart', status: 'succeeded' }] };
    },
    invalidate: recordRestartInvalidation,
    stateStore,
    wait: async () => recoveredPollGate,
  });
  assert.equal(await restarted.recover(), 1, 'startup must resume a durable in-flight run');
  assert.equal(restarted.activeCount(), 1);
  releaseRecoveredPoll();
  await restarted.whenIdle();
  assert.equal(recoveryListCalls, 2);
  assert.deepEqual(restartInvalidations, [{ reason: 'manual-run', runId: 'run-restart' }]);

  const invalidatedState = JSON.parse(readFileSync(
    join(durableDirectory, 'parser-run-reconciliation.json'),
    'utf8',
  )) as { runs: Array<{ id: string; resolution: string }> };
  assert.deepEqual(
    invalidatedState.runs.map(run => ({ id: run.id, resolution: run.resolution })),
    [{ id: 'run-restart', resolution: 'invalidated' }],
  );

  const afterSecondRestart = createParserRunReconciler({
    listRuns: async () => ({ runs: [{ id: 'run-restart', status: 'succeeded' }] }),
    invalidate: recordRestartInvalidation,
    stateStore,
  });
  assert.equal(await afterSecondRestart.recover(), 0);
  await afterSecondRestart.whenIdle();
  assert.deepEqual(
    restartInvalidations,
    [{ reason: 'manual-run', runId: 'run-restart' }],
    'a terminal run already reconciled before a later restart must not invalidate twice',
  );
} finally {
  rmSync(durableDirectory, { recursive: true, force: true });
}

const failedDirectory = mkdtempSync(join(tmpdir(), 'parser-run-failed-'));
try {
  const failedStore = createParserRunReconciliationFileStore(failedDirectory);
  let failedRunInvalidations = 0;
  const recoveredFailure = createParserRunReconciler({
    listRuns: async () => ({ runs: [{ id: 'run-failed', status: 'failed' }] }),
    invalidate: async () => { failedRunInvalidations += 1; },
    stateStore: failedStore,
  });
  assert.equal(await recoveredFailure.recover(), 1);
  await recoveredFailure.whenIdle();
  assert.equal(
    failedRunInvalidations,
    1,
    'aggregate failed runs may contain published source results, so cache invalidation must fail safe',
  );
  const failedState = JSON.parse(readFileSync(
    join(failedDirectory, 'parser-run-reconciliation.json'),
    'utf8',
  )) as { runs: Array<{ resolution: string }> };
  assert.equal(failedState.runs[0]?.resolution, 'invalidated');
} finally {
  rmSync(failedDirectory, { recursive: true, force: true });
}

const bootstrapDirectory = mkdtempSync(join(tmpdir(), 'parser-run-bootstrap-'));
try {
  const historicRuns = Array.from({ length: 20 }, (_, index) => ({
    id: `historic-${index + 1}`,
    status: 'succeeded',
  }));
  let bootstrapInvalidations = 0;
  const bootstrapReconciler = createParserRunReconciler({
    listRuns: async () => ({ runs: historicRuns }),
    invalidate: async () => { bootstrapInvalidations += 1; },
    stateStore: createParserRunReconciliationFileStore(bootstrapDirectory),
  });
  assert.equal(await bootstrapReconciler.recover(), 20);
  assert.equal(
    bootstrapInvalidations,
    1,
    'first deployment must coalesce historical terminal runs into one global cache clear',
  );
  const bootstrapState = JSON.parse(readFileSync(
    join(bootstrapDirectory, 'parser-run-reconciliation.json'),
    'utf8',
  )) as { runs: Array<{ resolution: string }> };
  assert.equal(bootstrapState.runs.length, 20);
  assert.ok(bootstrapState.runs.every(run => run.resolution === 'invalidated'));
  assert.equal(await bootstrapReconciler.recover(), 0);
  assert.equal(bootstrapInvalidations, 1, 'the coalesced startup watermark is durable');
} finally {
  rmSync(bootstrapDirectory, { recursive: true, force: true });
}

for (const [label, document] of [
  ['unknown', { version: 2, runs: [] }],
  ['duplicate-run-id', {
    version: 1,
    runs: [
      {
        id: 'duplicate-run',
        status: 'running',
        observedAt: 500,
        updatedAt: 600,
        resolution: 'pending',
      },
      {
        id: 'duplicate-run',
        status: 'succeeded',
        observedAt: 500,
        updatedAt: 700,
        resolution: 'invalidated',
      },
    ],
  }],
  ['future-timestamp', {
    version: 1,
    runs: [{
      id: 'future-run',
      status: 'running',
      observedAt: 999_999,
      updatedAt: 999_999,
      resolution: 'pending',
    }],
  }],
] as const) {
  const corruptDirectory = mkdtempSync(join(tmpdir(), `parser-run-${label}-`));
  try {
    const filename = 'parser-run-reconciliation.json';
    writeFileSync(join(corruptDirectory, filename), `${JSON.stringify(document)}\n`, 'utf8');
    const loadWarnings: string[] = [];
    createParserRunReconciler({
      listRuns: async () => ({ runs: [] }),
      invalidate: async () => undefined,
      stateStore: createParserRunReconciliationFileStore(corruptDirectory),
      now: () => 1_000,
      onWarning: (scope, error) => loadWarnings.push(
        `${scope}:${error instanceof Error ? error.message : String(error)}`,
      ),
    });
    assert.match(loadWarnings[0] ?? '', /^load:/, `${label} ledger must raise an operational warning`);
    assert.equal(
      readdirSync(corruptDirectory).filter(item => item.startsWith(`${filename}.corrupt-`)).length,
      1,
      `${label} ledger must be quarantined instead of silently accepted`,
    );
  } finally {
    rmSync(corruptDirectory, { recursive: true, force: true });
  }
}

const rollbackDirectory = mkdtempSync(join(tmpdir(), 'parser-run-clock-rollback-'));
try {
  let clock = 10_000;
  const rollbackStore = createParserRunReconciliationFileStore(rollbackDirectory);
  const rollbackReconciler = createParserRunReconciler({
    listRuns: async () => ({ runs: [{ id: 'clock-run', status: 'succeeded' }] }),
    invalidate: async () => undefined,
    stateStore: rollbackStore,
    now: () => clock,
    wait: async () => undefined,
  });
  assert.equal(rollbackReconciler.observe({ run: { id: 'clock-run', status: 'running' } }), true);
  clock = 9_000;
  await rollbackReconciler.recover();
  await rollbackReconciler.whenIdle();
  const rollbackState = JSON.parse(readFileSync(
    join(rollbackDirectory, 'parser-run-reconciliation.json'),
    'utf8',
  )) as { runs: Array<{ observedAt: number; updatedAt: number; resolution: string }> };
  assert.ok(rollbackState.runs[0]?.updatedAt >= (rollbackState.runs[0]?.observedAt ?? 0));
  assert.equal(rollbackState.runs[0]?.resolution, 'invalidated');
  const loadedAfterRollback = createParserRunReconciler({
    listRuns: async () => ({ runs: [{ id: 'clock-run', status: 'succeeded' }] }),
    invalidate: async () => undefined,
    stateStore: rollbackStore,
    now: () => 10_000,
  });
  assert.equal(await loadedAfterRollback.recover(), 0, 'a clock rollback must not corrupt our own ledger');
} finally {
  rmSync(rollbackDirectory, { recursive: true, force: true });
}

let periodicListCalls = 0;
let periodicInvalidations = 0;
const periodicWarnings: string[] = [];
const periodicReconciler = createParserRunReconciler({
  listRuns: async () => {
    periodicListCalls += 1;
    if (periodicListCalls === 1) throw new Error('API temporarily unavailable');
    return { runs: [{ id: 'periodic-run', status: 'succeeded' }] };
  },
  invalidate: async () => { periodicInvalidations += 1; },
  onWarning: (scope, error) => periodicWarnings.push(
    `${scope}:${error instanceof Error ? error.message : String(error)}`,
  ),
});
let scheduledTick: (() => void) | null = null;
let intervalUnref = false;
let intervalCleared = false;
const intervalHandle = { unref: () => { intervalUnref = true; } };
const periodicLoop = startParserRunRecoveryLoop({
  reconciler: periodicReconciler,
  intervalMs: 60_000,
  setIntervalImpl: callback => {
    scheduledTick = callback;
    return intervalHandle;
  },
  clearIntervalImpl: handle => {
    assert.equal(handle, intervalHandle);
    intervalCleared = true;
  },
});
await periodicLoop.runNow();
assert.equal(periodicListCalls, 1);
assert.match(periodicWarnings[0] ?? '', /^recover:API temporarily unavailable$/);
assert.equal(intervalUnref, true, 'periodic recovery must not keep Node alive during shutdown');
const nextPeriodicTick = scheduledTick;
assert.ok(nextPeriodicTick);
nextPeriodicTick();
await periodicLoop.runNow();
assert.equal(periodicListCalls, 2);
assert.equal(periodicInvalidations, 1, 'a later periodic pass recovers after a transient API outage');
periodicLoop.stop();
assert.equal(intervalCleared, true);

console.log('parser run reconciler tests passed');
