import assert from 'node:assert/strict';
import { createParserRunReconciler } from '../server/parserRunReconciler.js';

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
  onWarning: (_scope, error) => warnings.push(error instanceof Error ? error.message : String(error)),
});
assert.equal(failedReconciler.observe({ run: { id: 'run-terminal', status: 'partial' } }), true);
await failedReconciler.whenIdle();
assert.equal(failedInvalidationAttempts, 1);
assert.match(warnings.at(-1) ?? '', /redis unavailable/);

console.log('parser run reconciler tests passed');
