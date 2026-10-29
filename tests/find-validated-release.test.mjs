import assert from 'node:assert/strict';
import test from 'node:test';

import { findValidatedRun, releaseArtifactName, requiredCheckState, selectValidatedRun } from '../scripts/find-validated-release.mjs';

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

function select(
  runs,
  artifacts = new Map(runs.map(run => [run.id, [{ name: releaseArtifactName(sha), expired: false }]])),
  requiredByRun = new Map(runs.map(run => [run.id, 'success'])),
) {
  return selectValidatedRun({ runs, requiredByRun, artifactsByRun: artifacts, sha, tree, repository, workflowPath });
}

test('a push reuses the newest successful merge-queue run of the same commit and tree', () => {
  const result = select([queueRun(11), queueRun(42), queueRun(17)]);
  assert.equal(result.runId, 42);
  assert.match(result.reason, new RegExp(`tree ${tree}`));
});

test('only a merge-queue run of this workflow, commit and tree qualifies', () => {
  for (const overrides of [
    { event: 'pull_request' },
    { event: 'push' },
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
    runs: [queueRun(1)], requiredByRun: new Map([[1, 'success']]), artifactsByRun: new Map(), sha: 'HEAD', tree, repository, workflowPath,
  }).runId, null);
  assert.equal(selectValidatedRun({
    runs: [queueRun(1)], requiredByRun: new Map([[1, 'success']]), artifactsByRun: new Map(), sha, tree: '', repository, workflowPath,
  }).runId, null);
});

test('a run whose CI required did not succeed is never selected', () => {
  for (const state of ['pending', 'unusable', undefined]) {
    const run = queueRun(9);
    assert.equal(select([run], undefined, new Map([[run.id, state]])).runId, null, String(state));
  }
});

const requiredJob = (status, conclusion = null) => ({ name: 'CI required', status, conclusion });

test('CI required decides: success, still pending, or unusable', () => {
  assert.equal(requiredCheckState([requiredJob('completed', 'success')], 'in_progress').state, 'success');
  assert.equal(requiredCheckState([requiredJob('in_progress')], 'in_progress').state, 'pending');
  assert.equal(requiredCheckState([requiredJob('queued')], 'queued').state, 'pending');
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'timed_out', null]) {
    assert.equal(requiredCheckState([requiredJob('completed', conclusion)], 'in_progress').state, 'unusable', String(conclusion));
  }
  // GitHub lists a job only once its needs are met, so it is absent while the run is working.
  const others = [{ name: 'Build release artifacts', status: 'completed', conclusion: 'success' }];
  assert.equal(requiredCheckState(others, 'in_progress').state, 'pending');
  assert.equal(requiredCheckState(others, 'completed').state, 'unusable');
  assert.equal(requiredCheckState([requiredJob('completed', 'success'), requiredJob('completed', 'success')], 'completed').state, 'unusable');
});

// --- findValidatedRun against a fake GitHub API (only fetch is replaced) ---

const api = 'https://api.github.test';
const env = {
  GITHUB_API_URL: api,
  GITHUB_REPOSITORY: repository,
  GITHUB_SHA: sha,
  GITHUB_TOKEN: 'token',
  GITHUB_WORKFLOW_REF: `${repository}/${workflowPath}@refs/heads/main`,
};
const releaseArtifact = { name: releaseArtifactName(sha), expired: false };

function jobsPage(jobs, total = jobs.length) {
  return { total_count: total, jobs };
}

/**
 * Serves GitHub's REST answers. `jobs[runId]` is a list of answers handed out
 * one per request (the last repeats); an Error entry answers with HTTP 500.
 * Returns the request log.
 */
function fakeGitHub({ runs, jobs = {}, artifacts = {} }) {
  const calls = [];
  const served = new Map();
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    calls.push(`${url.pathname}${url.search}`);
    const json = body => new Response(JSON.stringify(body), { status: 200 });
    if (url.pathname.endsWith('/workflows/ci.yml/runs')) {
      assert.equal(url.searchParams.get('event'), 'merge_group');
      assert.equal(url.searchParams.get('head_sha'), sha);
      return json({ workflow_runs: runs });
    }
    const match = url.pathname.match(/\/actions\/runs\/(\d+)\/(jobs|artifacts)$/);
    assert.ok(match, `unexpected request ${url}`);
    const runId = Number(match[1]);
    if (match[2] === 'artifacts') return json({ artifacts: artifacts[runId] ?? [] });
    const key = `${runId}?page=${url.searchParams.get('page')}`;
    const answers = jobs[key] ?? jobs[runId] ?? [];
    const index = served.get(key) ?? 0;
    served.set(key, index + 1);
    const answer = answers[Math.min(index, answers.length - 1)];
    return answer instanceof Error ? new Response('boom', { status: 500 }) : json(answer);
  };
  return calls;
}

function lookup() {
  const clock = { t: 1_000_000, sleeps: 0 };
  return {
    clock,
    find: () => findValidatedRun(env, {
      resolveTree: () => tree,
      now: () => clock.t,
      sleep: async ms => { clock.t += ms; clock.sleeps += 1; },
    }),
  };
}

const realFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = realFetch; });

test('an unfinished merge-queue run with a passed CI required and its release is reused at once', async () => {
  const run = queueRun(100, { status: 'in_progress', conclusion: null });
  fakeGitHub({
    runs: [run],
    jobs: { 100: [jobsPage([requiredJob('completed', 'success'), { name: 'Browser quarantine (non-blocking)', status: 'in_progress', conclusion: null }])] },
    artifacts: { 100: [releaseArtifact] },
  });
  const { clock, find } = lookup();
  const result = await find();
  assert.equal(result.runId, 100);
  assert.equal(clock.sleeps, 0, 'no waiting for the non-blocking jobs');
});

test('a finished run is not reused unless its CI required succeeded', async () => {
  for (const jobs of [
    [requiredJob('completed', 'failure')],
    [requiredJob('completed', 'cancelled')],
    [{ name: 'Build release artifacts', status: 'completed', conclusion: 'success' }],
    [],
  ]) {
    fakeGitHub({
      runs: [queueRun(101, { conclusion: 'failure' })],
      jobs: { 101: [jobsPage(jobs)] },
      artifacts: { 101: [releaseArtifact] },
    });
    const { clock, find } = lookup();
    assert.equal((await find()).runId, null, JSON.stringify(jobs));
    assert.equal(clock.sleeps, 0, 'a settled verdict is not waited on');
  }
});

test('a push waits for CI required to finish, then reuses the run', async () => {
  fakeGitHub({
    runs: [queueRun(102, { status: 'in_progress', conclusion: null })],
    jobs: { 102: [
      jobsPage([{ name: 'Build release artifacts', status: 'completed', conclusion: 'success' }]),
      jobsPage([requiredJob('in_progress')]),
      jobsPage([requiredJob('completed', 'success')]),
    ] },
    artifacts: { 102: [releaseArtifact] },
  });
  const { clock, find } = lookup();
  assert.equal((await find()).runId, 102);
  assert.equal(clock.sleeps, 2);
});

test('a push that waited for CI required to fail validates in full', async () => {
  fakeGitHub({
    runs: [queueRun(103, { status: 'in_progress', conclusion: null })],
    jobs: { 103: [jobsPage([requiredJob('in_progress')]), jobsPage([requiredJob('completed', 'failure')])] },
    artifacts: { 103: [releaseArtifact] },
  });
  const { find } = lookup();
  const result = await find();
  assert.equal(result.runId, null);
  assert.match(result.reason, /CI required failure/);
});

test('the wait for CI required is bounded', async () => {
  fakeGitHub({
    runs: [queueRun(104, { status: 'in_progress', conclusion: null })],
    jobs: { 104: [jobsPage([requiredJob('in_progress')])] },
    artifacts: { 104: [releaseArtifact] },
  });
  const { clock, find } = lookup();
  const started = clock.t;
  assert.equal((await find()).runId, null);
  assert.equal(clock.t - started, 150_000);
});

test('a run of another event, commit, tree, workflow or repository is not even read', async () => {
  const foreign = [
    queueRun(110, { event: 'pull_request' }),
    queueRun(111, { head_sha: 'c'.repeat(40) }),
    queueRun(112, { head_commit: { tree_id: 'c'.repeat(40) } }),
    queueRun(113, { path: '.github/workflows/other.yml' }),
    queueRun(114, { repository: { full_name: 'someone/fork' } }),
  ];
  const calls = fakeGitHub({
    runs: foreign,
    jobs: Object.fromEntries(foreign.map(run => [run.id, [jobsPage([requiredJob('completed', 'success')])]])),
    artifacts: Object.fromEntries(foreign.map(run => [run.id, [releaseArtifact]])),
  });
  const { find } = lookup();
  assert.equal((await find()).runId, null);
  assert.deepEqual(calls.filter(call => call.includes('/actions/runs/')), []);
});

test('CI required passed but the release artifact is missing or expired: no reuse', async () => {
  for (const artifacts of [[], [{ ...releaseArtifact, expired: true }]]) {
    fakeGitHub({
      runs: [queueRun(120, { status: 'in_progress', conclusion: null })],
      jobs: { 120: [jobsPage([requiredJob('completed', 'success')])] },
      artifacts: { 120: artifacts },
    });
    const { find } = lookup();
    assert.equal((await find()).runId, null);
  }
});

test('an API error while reading the jobs means no run, not an exception', async () => {
  fakeGitHub({
    runs: [queueRun(130, { status: 'in_progress', conclusion: null })],
    jobs: { 130: [new Error('server error')] },
    artifacts: { 130: [releaseArtifact] },
  });
  const { clock, find } = lookup();
  const result = await find();
  assert.equal(result.runId, null);
  assert.match(result.reason, /cannot read the jobs of run 130/);
  assert.equal(clock.sleeps, 0);
});

test('a run that cannot be read does not hide another run of the same commit that passed', async () => {
  fakeGitHub({
    runs: [queueRun(141), queueRun(140)],
    jobs: { 141: [new Error('server error')], 140: [jobsPage([requiredJob('completed', 'success')])] },
    artifacts: { 140: [releaseArtifact], 141: [releaseArtifact] },
  });
  const { find } = lookup();
  assert.equal((await find()).runId, 140);
});

test('CI required is found on a later page of a long job list', async () => {
  const filler = Array.from({ length: 100 }, (_, index) => ({ name: `Browser suite (shard ${index})`, status: 'completed', conclusion: 'success' }));
  const calls = fakeGitHub({
    runs: [queueRun(150, { status: 'in_progress', conclusion: null })],
    jobs: {
      '150?page=1': [jobsPage(filler, 101)],
      '150?page=2': [jobsPage([requiredJob('completed', 'success')], 101)],
    },
    artifacts: { 150: [releaseArtifact] },
  });
  const { find } = lookup();
  assert.equal((await find()).runId, 150);
  assert.equal(calls.filter(call => call.includes('/jobs')).length, 2);
});

test('a failing run list is reported to the caller, which then validates in full', async () => {
  globalThis.fetch = async () => new Response('down', { status: 503 });
  const { find } = lookup();
  await assert.rejects(find(), /503/);
});
