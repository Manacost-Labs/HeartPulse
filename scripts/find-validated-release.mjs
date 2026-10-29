#!/usr/bin/env node
/**
 * Finds the merge-queue run that already validated the commit a push to main
 * just landed, so that push deploys the release that run packaged instead of
 * validating and building the same tree a second time.
 *
 * The merge queue fast-forwards main to the exact commit it tested, so the
 * push and the queue run share one SHA. A run qualifies only when it belongs
 * to this workflow file in this repository, ran for the `merge_group` event,
 * tested that SHA and its tree, its `CI required` job finished with `success`,
 * and it still holds the unexpired `hs-arena-release-<sha>` artifact. The run
 * as a whole need not be completed: non-blocking jobs (the browser quarantine)
 * may still be running when `CI required` has passed. The artifact is uploaded
 * by the build job, which `CI required` depends on, so it already exists then.
 * Any doubt, including an API failure, yields no run and the push validates in
 * full.
 *
 * Writes `run-id=<id or empty>` to `$GITHUB_OUTPUT`.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[a-f0-9]{40}$/;
// Name of the job the merge-queue ruleset requires (`.github/workflows/ci.yml`).
export const REQUIRED_JOB_NAME = 'CI required';
// While `CI required` has not finished the push waits this long rather than
// validating the same commit again.
const PENDING_WAIT_MS = 150_000;
const PENDING_POLL_MS = 10_000;
const JOBS_PAGE_SIZE = 100;
const JOBS_MAX_PAGES = 5;

export function releaseArtifactName(sha) {
  return `hs-arena-release-${sha}`;
}

/** True when `run` is a merge-queue run of this workflow, repository, commit and tree. */
export function isQueueRunOf(run, { sha, tree, repository, workflowPath }) {
  return run.event === 'merge_group'
    && run.head_sha === sha
    && run.head_commit?.tree_id === tree
    && run.path === workflowPath
    && run.repository?.full_name === repository;
}

/**
 * Reads the `CI required` job out of one run's job list.
 * `success`: it passed. `pending`: it may still pass (the job is queued or
 * running, or the run is unfinished and the job has not been created yet).
 * `unusable`: it failed, was cancelled or skipped, is missing from a finished
 * run, or is ambiguous.
 */
export function requiredCheckState(jobs, runStatus) {
  const required = jobs.filter(job => job.name === REQUIRED_JOB_NAME);
  if (required.length > 1) return { state: 'unusable', reason: `${REQUIRED_JOB_NAME} appears ${required.length} times` };
  if (required.length === 0) {
    return runStatus === 'completed'
      ? { state: 'unusable', reason: `the finished run has no ${REQUIRED_JOB_NAME} job` }
      : { state: 'pending', reason: `${REQUIRED_JOB_NAME} has not started` };
  }
  const [job] = required;
  if (job.status !== 'completed') return { state: 'pending', reason: `${REQUIRED_JOB_NAME} is ${job.status}` };
  return job.conclusion === 'success'
    ? { state: 'success', reason: `${REQUIRED_JOB_NAME} succeeded` }
    : { state: 'unusable', reason: `${REQUIRED_JOB_NAME} ${job.conclusion}` };
}

/**
 * Picks the newest qualifying run from GitHub's workflow-run and artifact
 * listings. `requiredByRun` maps run id to the `requiredCheckState` state.
 * Returns `{ runId, reason }`; `runId` is null when none qualifies.
 */
export function selectValidatedRun({ runs, requiredByRun, artifactsByRun, sha, tree, repository, workflowPath }) {
  if (!SHA_PATTERN.test(sha) || !SHA_PATTERN.test(tree)) {
    return { runId: null, reason: 'the pushed commit or its tree is not a full SHA' };
  }
  const candidates = runs
    .filter(run => isQueueRunOf(run, { sha, tree, repository, workflowPath })
      && requiredByRun.get(run.id) === 'success')
    .sort((left, right) => right.id - left.id);
  if (candidates.length === 0) return { runId: null, reason: `no merge-queue run of ${sha} has a successful ${REQUIRED_JOB_NAME} job` };
  const name = releaseArtifactName(sha);
  for (const run of candidates) {
    const artifact = (artifactsByRun.get(run.id) ?? [])
      .find(candidate => candidate.name === name && !candidate.expired);
    if (artifact) return { runId: run.id, reason: `merge-queue run ${run.id} validated ${sha} (tree ${tree})` };
  }
  return { runId: null, reason: `no merge-queue run of ${sha} still holds ${name}` };
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

function gitTree(sha) {
  const result = spawnSync('git', ['rev-parse', `${sha}^{tree}`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`cannot resolve the tree of ${sha}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

const sleepFor = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));

/** Every job of the run's latest attempt, following pagination. */
async function listRunJobs({ api, repository, runId, token }) {
  const jobs = [];
  for (let page = 1; page <= JOBS_MAX_PAGES; page += 1) {
    const body = await githubJson(
      `${api}/repos/${repository}/actions/runs/${runId}/jobs?per_page=${JOBS_PAGE_SIZE}&page=${page}`,
      token,
    );
    const batch = body.jobs ?? [];
    jobs.push(...batch);
    if (batch.length === 0 || jobs.length >= (body.total_count ?? 0)) return jobs;
  }
  throw new Error(`run ${runId} has more than ${JOBS_MAX_PAGES * JOBS_PAGE_SIZE} jobs`);
}

/** A job-listing failure means "this run cannot be trusted", never an exception. */
async function readRequiredCheck(run, context) {
  try {
    return requiredCheckState(await listRunJobs({ ...context, runId: run.id }), run.status);
  } catch (error) {
    return { state: 'unusable', reason: `cannot read the jobs of run ${run.id}: ${error.message}` };
  }
}

export async function findValidatedRun(env, { resolveTree = gitTree, sleep = sleepFor, now = Date.now } = {}) {
  const { GITHUB_API_URL: api, GITHUB_REPOSITORY: repository, GITHUB_SHA: sha, GITHUB_TOKEN: token } = env;
  // GITHUB_WORKFLOW_REF is `<owner>/<repo>/<path>@<ref>`.
  const workflowPath = env.GITHUB_WORKFLOW_REF?.split('@')[0].split('/').slice(2).join('/');
  if (!api || !repository || !sha || !token || !workflowPath) {
    return { runId: null, reason: 'the GitHub Actions environment is incomplete' };
  }
  const tree = resolveTree(sha);
  const identity = { sha, tree, repository, workflowPath };
  const workflowFile = path.posix.basename(workflowPath);
  const listRuns = async () => ((await githubJson(
    `${api}/repos/${repository}/actions/workflows/${workflowFile}/runs?event=merge_group&head_sha=${sha}&per_page=20`,
    token,
  )).workflow_runs ?? []).filter(run => isQueueRunOf(run, identity));

  // Runs whose `CI required` is settled (success or unusable) are not read again.
  const requiredByRun = new Map();
  const artifactsByRun = new Map();
  let runs = [];
  let selection;
  const deadline = now() + PENDING_WAIT_MS;
  for (;;) {
    runs = await listRuns();
    for (const run of runs) {
      if (['success', 'unusable'].includes(requiredByRun.get(run.id)?.state)) continue;
      const check = await readRequiredCheck(run, { api, repository, token });
      requiredByRun.set(run.id, check);
      if (check.state === 'success') {
        const artifacts = await githubJson(
          `${api}/repos/${repository}/actions/runs/${run.id}/artifacts?name=${releaseArtifactName(sha)}`,
          token,
        );
        artifactsByRun.set(run.id, artifacts.artifacts ?? []);
      }
    }
    selection = selectValidatedRun({
      runs,
      requiredByRun: new Map(runs.map(run => [run.id, requiredByRun.get(run.id).state])),
      artifactsByRun,
      ...identity,
    });
    const pending = runs.some(run => requiredByRun.get(run.id).state === 'pending');
    if (selection.runId || !pending || now() >= deadline) break;
    console.log(`[find-validated-release] waiting for ${REQUIRED_JOB_NAME} of the merge-queue run of ${sha}`);
    await sleep(PENDING_POLL_MS);
  }
  const notes = runs.map(run => `run ${run.id}: ${requiredByRun.get(run.id).reason}`);
  return selection.runId || notes.length === 0
    ? selection
    : { runId: null, reason: `${selection.reason} (${notes.join('; ')})` };
}

async function main() {
  let result;
  try {
    result = await findValidatedRun(process.env);
  } catch (error) {
    result = { runId: null, reason: `lookup failed, validating in full: ${error.message}` };
  }
  console.log(`[find-validated-release] ${result.reason}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run-id=${result.runId ?? ''}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await main();
