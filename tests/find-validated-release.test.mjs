import assert from 'node:assert/strict';
import test from 'node:test';

import { hasPendingQueueRun, releaseArtifactName, selectValidatedRun } from '../scripts/find-validated-release.mjs';

const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const repository = 'Manacost-Labs/HeartPulse';
const workflowPath = '.github/workflows/ci.yml';

function queueRun(id, overrides = {}) {
  return {
    id,
    event: 'merge_group',
    status: 'completed',
    conclusion: 'success',
    head_sha: sha,
    head_commit: { tree_id: tree },
    path: workflowPath,
    repository: { full_name: repository },
    ...overrides,
  };
}

function select(runs, artifacts = new Map(runs.map(run => [run.id, [{ name: releaseArtifactName(sha), expired: false }]]))) {
  return selectValidatedRun({ runs, artifactsByRun: artifacts, sha, tree, repository, workflowPath });
}

test('a push reuses the newest successful merge-queue run of the same commit and tree', () => {
  const result = select([queueRun(11), queueRun(42), queueRun(17)]);
  assert.equal(result.runId, 42);
  assert.match(result.reason, new RegExp(`tree ${tree}`));
});

test('only a successful merge-queue run of this workflow, commit and tree qualifies', () => {
  for (const overrides of [
    { event: 'pull_request' },
    { event: 'push' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { head_sha: 'c'.repeat(40) },
    { head_commit: { tree_id: 'c'.repeat(40) } },
    { head_commit: null },
    { path: '.github/workflows/other.yml' },
    { repository: { full_name: 'someone/fork' } },
  ]) {
    assert.equal(select([queueRun(5, overrides)]).runId, null, JSON.stringify(overrides));
  }
});

test('a run without its unexpired release artifact cannot be deployed from', () => {
  const run = queueRun(7);
  for (const artifacts of [[], [{ name: releaseArtifactName(sha), expired: true }], [{ name: 'build-outputs', expired: false }]]) {
    const result = select([run], new Map([[run.id, artifacts]]));
    assert.equal(result.runId, null);
    assert.match(result.reason, /still holds/);
  }
  const older = queueRun(3);
  const result = select([run, older], new Map([[run.id, []], [older.id, [{ name: releaseArtifactName(sha), expired: false }]]]));
  assert.equal(result.runId, 3, 'an older run that still holds the release qualifies');
});

test('malformed identities never select a run', () => {
  assert.equal(selectValidatedRun({
    runs: [queueRun(1)], artifactsByRun: new Map(), sha: 'HEAD', tree, repository, workflowPath,
  }).runId, null);
  assert.equal(selectValidatedRun({
    runs: [queueRun(1)], artifactsByRun: new Map(), sha, tree: '', repository, workflowPath,
  }).runId, null);
});

test('the push waits only for an unfinished merge-queue run of its own commit', () => {
  assert.equal(hasPendingQueueRun([queueRun(1, { status: 'in_progress', conclusion: null })], sha), true);
  assert.equal(hasPendingQueueRun([queueRun(1, { status: 'queued', conclusion: null })], sha), true);
  assert.equal(hasPendingQueueRun([queueRun(1)], sha), false);
  assert.equal(hasPendingQueueRun([queueRun(1, { status: 'in_progress', head_sha: 'c'.repeat(40) })], sha), false);
  assert.equal(hasPendingQueueRun([queueRun(1, { status: 'in_progress', event: 'push' })], sha), false);
});
