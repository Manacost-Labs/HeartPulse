#!/usr/bin/env node
/**
 * Shared hot spots: files that parallel task branches must not edit, because
 * every rebase conflicts on them. `npm run agent:integrate` refuses them before
 * the push and CI (`verify:release:checks`) refuses them on the pull request,
 * so the rule holds for PRs that skip the helper too.
 *
 * The only exception is a commit that declares itself with a
 * `Shared-Hot-Spots: <reason>` trailer (release changelog assembly, bundle
 * baseline refresh). The trailer exempts only the files that commit touches,
 * so it cannot launder an unrelated edit in another commit of the branch.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARED_TRAILER = 'Shared-Hot-Spots';

// `allowAdded`: a new file is the intended way to change the value (one
// approval per change); editing, renaming or deleting an existing one is not.
const SHARED_PATHS = [
  { pattern: /^CHANGELOG\.md$/, instead: 'add changelog.d/<YYYY-MM-DD>-<slug>.md' },
  { pattern: /^config\/next-bundle-budgets\.json$/, instead: 'keep the tolerance and add config/next-bundle-budgets/approvals/<slug>.json' },
  { pattern: /^config\/next-bundle-budgets\/baselines\//, instead: 'add config/next-bundle-budgets/approvals/<slug>.json' },
  { pattern: /^config\/next-bundle-budgets\/approvals\//, allowAdded: true, instead: 'add a new approval file with a unique name' },
];

/**
 * @param {Array<{ status: string, file: string }>} changes name-status of the branch diff (A, M, D, …; no renames)
 * @param {Set<string>} [exempt] files touched by a commit with the trailer
 * @returns {string[]} one message per refused file
 */
export function sharedPathViolations(changes, exempt = new Set()) {
  return changes.flatMap(({ status, file }) => SHARED_PATHS
    .filter(({ pattern, allowAdded }) => pattern.test(file) && !(allowAdded && status === 'A') && !exempt.has(file))
    .map(({ instead }) => `${file}: shared file, ${instead} instead `
      + `(a release or baseline-refresh commit carries a "${SHARED_TRAILER}: <reason>" trailer)`));
}

/** Files exempted by the commits that carry the trailer. */
export function exemptFiles(commits) {
  return new Set(commits.filter(commit => commit.trailer.trim()).flatMap(commit => commit.files));
}

export function parseNameStatus(output) {
  return output.split('\n').filter(Boolean).map((line) => {
    const [status, file] = line.split('\t');
    return { status: status[0], file };
  });
}

/**
 * Which range to check. Merge-queue and main pushes contain only PRs that
 * already passed this check on their own pull request, and squash messages
 * there are not the branch's commits, so those events are skipped.
 */
export function selectBase({ env, head, resolve, mergeBase, isAncestor }) {
  const event = env.CLEAN_CODE_EVENT?.trim() || env.GITHUB_EVENT_NAME?.trim() || '';
  if (event === 'merge_group' || event === 'push') {
    return { skip: `${event}: every queued PR was checked on its own pull request` };
  }
  if (event.startsWith('pull_request')) {
    const prBase = resolve(env.CLEAN_CODE_PR_BASE_SHA?.trim() || (env.GITHUB_BASE_REF ? `origin/${env.GITHUB_BASE_REF}` : ''));
    const base = prBase && mergeBase(prBase, head);
    if (!base) throw new Error('pull request base is unavailable: fetch the full history (fetch-depth: 0)');
    return { base };
  }
  const main = resolve('origin/main');
  if (!main) throw new Error('origin/main is unavailable: git fetch origin main');
  if (isAncestor(head, main)) return { skip: 'HEAD is already part of origin/main' };
  return { base: mergeBase(main, head) };
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error((result.stderr || `git ${args.join(' ')} failed`).trim());
  return result.stdout;
}

function tryGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** Refused shared files changed between `base` and HEAD. */
export function branchViolations(root, base) {
  const changes = parseNameStatus(git(root, ['diff', '--name-status', '--no-renames', base, 'HEAD']));
  if (!changes.length) return [];
  const commits = git(root, ['log', '--no-merges', `--format=%H%x1f%(trailers:key=${SHARED_TRAILER},valueonly)%x1e`, `${base}..HEAD`])
    .split('\x1e').map(entry => entry.trim()).filter(Boolean)
    .map((entry) => {
      const [sha, trailer = ''] = entry.split('\x1f');
      return { sha, trailer };
    });
  for (const commit of commits.filter(entry => entry.trailer.trim())) {
    commit.files = git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', commit.sha]).split('\n').filter(Boolean);
  }
  return sharedPathViolations(changes, exemptFiles(commits));
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
  try {
    const root = git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    const scope = selectBase({
      env: process.env,
      head,
      resolve: ref => (ref ? tryGit(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) : null),
      mergeBase: (left, right) => tryGit(root, ['merge-base', left, right]),
      isAncestor: (left, right) => spawnSync('git', ['merge-base', '--is-ancestor', left, right], { cwd: root }).status === 0,
    });
    if (scope.skip) {
      process.stdout.write(`shared hot spots: skipped (${scope.skip})\n`);
    } else {
      const violations = branchViolations(root, scope.base);
      if (violations.length) throw new Error(violations.join('\n'));
      process.stdout.write(`shared hot spots: ok against ${scope.base.slice(0, 12)}\n`);
    }
  } catch (error) {
    process.stderr.write(`shared hot spots: ${error.message}\n`);
    process.exitCode = 1;
  }
}
