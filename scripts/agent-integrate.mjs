#!/usr/bin/env node
/**
 * READY -> PR -> merge queue for one task branch. Rebases onto origin/main,
 * runs the integration preflight, pushes the task branch (never main), opens
 * or reuses its pull request and enables auto-merge. The merge queue then
 * tests the combination with other queued PRs and fast-forwards main, which
 * deploys. `--status` reports whether production already serves the merge.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_HEALTH_URL = 'https://hearthpulse.net/api/health/live';

// Shared files that parallel branches must not edit; they conflict on every
// rebase. CHANGELOG.md is assembled from changelog.d/ at release time, and
// bundle baselines are refreshed from a main CI measurement.
const SHARED_PATHS = [
  { pattern: /^CHANGELOG\.md$/, instead: 'add changelog.d/<YYYY-MM-DD>-<slug>.md' },
  { pattern: /^config\/next-bundle-budgets\/baselines\//, instead: 'add config/next-bundle-budgets/approvals/<slug>.json' },
  { pattern: /^config\/next-bundle-budgets\.json$/, instead: 'keep the tolerance and add config/next-bundle-budgets/approvals/<slug>.json' },
];

export function sharedPathViolations(changedPaths) {
  return changedPaths.flatMap(file => SHARED_PATHS
    .filter(({ pattern }) => pattern.test(file))
    .map(({ instead }) => `${file}: shared file, ${instead} instead (or pass --allow-shared for a release/baseline PR)`));
}

export function addedChangelogFragments(addedPaths) {
  return addedPaths.filter(file => /^changelog\.d\/\d{4}-\d{2}-\d{2}-[^/]+\.md$/.test(file));
}

export function parseArgs(argv) {
  const args = { allowShared: false, auto: true, draft: false, status: false, title: null, bodyFile: null, checks: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-shared') args.allowShared = true;
    else if (arg === '--no-auto') args.auto = false;
    else if (arg === '--draft') { args.draft = true; args.auto = false; }
    else if (arg === '--status') args.status = true;
    else if (arg === '--title') args.title = argv[++index];
    else if (arg === '--body-file') args.bodyFile = argv[++index];
    else if (arg === '--check') args.checks.push(argv[++index]);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

/**
 * The session may end only when production serves a release that contains
 * the PR's merge commit (a later batch deploys earlier merges too).
 */
export function deploymentVerdict({ state, mergeCommit, productionRelease, productionContainsMerge }) {
  if (state !== 'MERGED') return { done: false, message: `PR is ${state}; wait for the merge queue` };
  if (!productionRelease) return { done: false, message: 'production release SHA is unavailable' };
  if (!productionContainsMerge) {
    return { done: false, message: `production serves ${productionRelease}, which does not contain ${mergeCommit} yet` };
  }
  return { done: true, message: `production ${productionRelease} contains merge ${mergeCommit}: run the task's production check, then end the session` };
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: options.timeout ?? 120_000,
  }).trim();
}

function succeeds(command, args, cwd) {
  return spawnSync(command, args, { cwd, stdio: 'ignore' }).status === 0;
}

function step(message) {
  process.stdout.write(`- ${message}\n`);
}

function currentBranch(root) {
  const branch = run('git', ['branch', '--show-current'], { cwd: root });
  if (!branch) throw new Error('detached HEAD: switch to the task branch');
  if (branch === 'main') throw new Error('refusing to integrate from main: use the task branch and its worktree');
  return branch;
}

function pullRequest(root, branch) {
  const found = spawnSync('gh', ['pr', 'view', branch, '--json', 'number,url,state,mergeCommit,headRefOid'],
    { cwd: root, encoding: 'utf8' });
  return found.status === 0 ? JSON.parse(found.stdout) : null;
}

async function productionRelease() {
  try {
    const response = await fetch(PRODUCTION_HEALTH_URL, { signal: AbortSignal.timeout(10_000) });
    const release = String((await response.json())?.release || '').toLowerCase();
    return /^[a-f0-9]{7,40}$/.test(release) ? release : null;
  } catch {
    return null;
  }
}

async function status(root, branch) {
  const pr = pullRequest(root, branch);
  if (!pr) throw new Error(`no pull request for ${branch}: run npm run agent:integrate`);
  const mergeCommit = pr.mergeCommit?.oid ?? null;
  const release = await productionRelease();
  let contains = false;
  if (pr.state === 'MERGED' && mergeCommit && release) {
    run('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: root, timeout: 90_000 });
    contains = succeeds('git', ['merge-base', '--is-ancestor', mergeCommit, release], root);
  }
  const verdict = deploymentVerdict({ state: pr.state, mergeCommit, productionRelease: release, productionContainsMerge: contains });
  process.stdout.write(`${pr.url}\n${verdict.done ? 'DEPLOYED' : 'PENDING'}: ${verdict.message}\n`);
  if (!verdict.done) process.exitCode = 3;
}

function prBody(root) {
  const commits = run('git', ['log', '--format=- %s', 'origin/main..HEAD'], { cwd: root });
  const added = run('git', ['diff', '--name-only', '--diff-filter=A', 'origin/main...HEAD'], { cwd: root }).split('\n').filter(Boolean);
  const fragments = addedChangelogFragments(added)
    .map(file => `> ${readFileSync(path.join(root, file), 'utf8').trim().replaceAll('\n', '\n> ')}`);
  return [
    '## Что изменено', '', commits, '',
    '## Changelog', '', fragments.length ? fragments.join('\n\n') : 'Нет фрагмента в `changelog.d/`: изменение не видно пользователю.', '',
    '## Проверка', '', 'Интеграционный preflight пройден; required checks выполняет merge queue на комбинации с main.', '',
    '🤖 Opened with `npm run agent:integrate`',
  ].join('\n');
}

async function integrate(root, branch, args) {
  step('fetch origin/main');
  run('git', ['fetch', '--quiet', '--prune', 'origin', 'main'], { cwd: root, timeout: 90_000 });
  if (run('git', ['status', '--porcelain'], { cwd: root })) throw new Error('commit or remove uncommitted changes first');

  if (!succeeds('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], root)) {
    step('rebase onto origin/main');
    const rebase = spawnSync('git', ['rebase', 'origin/main'], { cwd: root, stdio: 'inherit' });
    if (rebase.status !== 0) {
      throw new Error('rebase stopped on a conflict: resolve it, `git rebase --continue`, then rerun agent:integrate');
    }
  }

  const changed = run('git', ['diff', '--name-only', 'origin/main...HEAD'], { cwd: root }).split('\n').filter(Boolean);
  if (!changed.length) throw new Error('the branch has no changes over origin/main');
  const violations = args.allowShared ? [] : sharedPathViolations(changed);
  if (violations.length) throw new Error(violations.join('\n'));

  step('changelog fragments and integration preflight');
  for (const [command, commandArgs] of [
    ['node', ['scripts/changelog-assemble.mjs', '--check']],
    ['node', ['scripts/agent-session-preflight.mjs', '--integration', '--no-fetch']],
    ...args.checks.map(script => ['npm', ['run', script]]),
  ]) {
    const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed`);
  }

  const head = run('git', ['rev-parse', 'HEAD'], { cwd: root });
  step(`push ${branch} (task branch only; main is updated by the merge queue)`);
  const push = spawnSync('git', ['push', '--force-with-lease', 'origin', `HEAD:refs/heads/${branch}`], { cwd: root, stdio: 'inherit' });
  if (push.status !== 0) throw new Error('push of the task branch failed');

  let pr = pullRequest(root, branch);
  if (!pr || pr.state !== 'OPEN') {
    step('open pull request');
    const title = args.title ?? run('git', ['log', '-1', '--format=%s'], { cwd: root });
    const body = args.bodyFile ? ['--body-file', args.bodyFile] : ['--body', prBody(root)];
    const url = run('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', title, ...body,
      ...(args.draft ? ['--draft'] : [])], { cwd: root }).split('\n').pop();
    pr = pullRequest(root, url);
    if (!pr) throw new Error(`opened ${url}, but gh cannot read it yet: rerun agent:integrate`);
  }

  if (args.auto) {
    step('enable auto-merge (merge queue)');
    // With a required merge queue gh needs no strategy; before the ruleset is
    // active, auto-merge needs one, and squash matches the queue's method.
    const queued = spawnSync('gh', ['pr', 'merge', String(pr.number), '--auto', '--match-head-commit', head], { cwd: root, encoding: 'utf8' });
    if (queued.status !== 0) {
      const squash = spawnSync('gh', ['pr', 'merge', String(pr.number), '--auto', '--squash', '--match-head-commit', head], { cwd: root, encoding: 'utf8' });
      if (squash.status !== 0) {
        // Auto-merge is off until the owner applies the merge-queue settings.
        process.stderr.write(`auto-merge unavailable (${(squash.stderr || queued.stderr).trim()}): the lead session merges this PR\n`);
        args.auto = false;
      }
    }
  }

  process.stdout.write([
    '',
    `READY ${branch} ${head}`,
    `PR: ${pr.url}${args.auto ? ' (auto-merge on; the merge queue deploys after its checks)' : ''}`,
    'After the merge: npm run agent:integrate -- --status, then the production check, then end the session.',
    '',
  ].join('\n'));
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write([
        'Usage: npm run agent:integrate -- [--title <t>] [--body-file <f>] [--check <npm-script>]... [--no-auto|--draft] [--allow-shared]',
        '       npm run agent:integrate -- --status',
      ].join('\n') + '\n');
    } else {
      const root = run('git', ['rev-parse', '--show-toplevel']);
      const branch = currentBranch(root);
      await (args.status ? status(root, branch) : integrate(root, branch, args));
    }
  } catch (error) {
    process.stderr.write(`agent integrate: ${error.message}\n`);
    process.exitCode = 1;
  }
}
