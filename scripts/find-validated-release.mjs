#!/usr/bin/env node
/**
 * Finds the merge-queue run that already validated the commit a push to main
 * just landed, so that push deploys the release that run packaged instead of
 * validating and building the same tree a second time.
 *
 * The merge queue fast-forwards main to the exact commit it tested, so the
 * push and the queue run share one SHA. A run qualifies only when it belongs
 * to this workflow file in this repository, ran for the `merge_group` event,
 * succeeded as a whole (so `CI required` passed), tested that SHA and its tree,
 * and still holds the unexpired `hs-arena-release-<sha>` artifact. Any doubt,
 * including an API failure, yields no run and the push validates in full.
 *
 * Writes `run-id=<id or empty>` to `$GITHUB_OUTPUT`.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SHA_PATTERN = /^[a-f0-9]{40}$/;

export function releaseArtifactName(sha) {
  return `hs-arena-release-${sha}`;
}

/**
 * Picks the newest qualifying run from GitHub's workflow-run and artifact
 * listings. Returns `{ runId, reason }`; `runId` is null when none qualifies.
 */
export function selectValidatedRun({ runs, artifactsByRun, sha, tree, repository, workflowPath }) {
  if (!SHA_PATTERN.test(sha) || !SHA_PATTERN.test(tree)) {
    return { runId: null, reason: 'the pushed commit or its tree is not a full SHA' };
  }
  const candidates = runs
    .filter(run => run.event === 'merge_group'
      && run.status === 'completed'
      && run.conclusion === 'success'
      && run.head_sha === sha
      && run.head_commit?.tree_id === tree
      && run.path === workflowPath
      && run.repository?.full_name === repository)
    .sort((left, right) => right.id - left.id);
  if (candidates.length === 0) return { runId: null, reason: `no successful merge-queue run validated ${sha}` };
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

async function findValidatedRun(env) {
  const { GITHUB_API_URL: api, GITHUB_REPOSITORY: repository, GITHUB_SHA: sha, GITHUB_TOKEN: token } = env;
  // GITHUB_WORKFLOW_REF is `<owner>/<repo>/<path>@<ref>`.
  const workflowPath = env.GITHUB_WORKFLOW_REF?.split('@')[0].split('/').slice(2).join('/');
  if (!api || !repository || !sha || !token || !workflowPath) {
    return { runId: null, reason: 'the GitHub Actions environment is incomplete' };
  }
  const tree = gitTree(sha);
  const workflowFile = path.posix.basename(workflowPath);
  const listing = await githubJson(
    `${api}/repos/${repository}/actions/workflows/${workflowFile}/runs?event=merge_group&head_sha=${sha}&status=success&per_page=20`,
    token,
  );
  const runs = listing.workflow_runs ?? [];
  const artifactsByRun = new Map();
  for (const run of runs) {
    const artifacts = await githubJson(
      `${api}/repos/${repository}/actions/runs/${run.id}/artifacts?name=${releaseArtifactName(sha)}`,
      token,
    );
    artifactsByRun.set(run.id, artifacts.artifacts ?? []);
  }
  return selectValidatedRun({ runs, artifactsByRun, sha, tree, repository, workflowPath });
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
