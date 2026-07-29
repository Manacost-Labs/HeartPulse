#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function git(args, cwd, options = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout ?? 45_000,
  }).trimEnd();
}

export function parseWorktreePorcelain(output) {
  return String(output)
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((block) => {
      const fields = Object.fromEntries(block.split('\n').map((line) => {
        const separator = line.indexOf(' ');
        return separator === -1
          ? [line, '']
          : [line.slice(0, separator), line.slice(separator + 1)];
      }));
      const detached = Object.hasOwn(fields, 'detached');
      return {
        path: fields.worktree,
        head: fields.HEAD,
        branch: detached
          ? null
          : fields.branch?.replace(/^refs\/heads\//, '') || null,
        detached,
      };
    });
}

export function parsePorcelainPaths(output) {
  const paths = new Set();
  for (const line of String(output).split('\n')) {
    if (line.length < 4) continue;
    const payload = line.slice(3).trim();
    if (!payload) continue;
    const renameParts = payload.split(' -> ');
    for (const candidate of renameParts) {
      paths.add(candidate.replace(/^"(.*)"$/, '$1'));
    }
  }
  return [...paths].sort();
}

export function evaluateSessionState({
  branch,
  detached,
  currentDirtyPaths,
  siblingDirtyPaths,
  originMainIsAncestor,
  integration,
}) {
  const errors = [];
  const overlaps = [];
  const currentPaths = new Set(currentDirtyPaths);

  for (const [worktree, paths] of siblingDirtyPaths) {
    for (const dirtyPath of paths) {
      if (currentPaths.has(dirtyPath)) overlaps.push({ path: dirtyPath, worktree });
    }
  }
  overlaps.sort((left, right) => (
    left.path.localeCompare(right.path) || left.worktree.localeCompare(right.worktree)
  ));

  if (detached || !branch) errors.push('The current worktree is detached; create or switch to a task branch.');
  if (branch === 'main') errors.push('Do not implement from the shared main branch; use one task branch and worktree.');
  if (!originMainIsAncestor) {
    errors.push('The branch does not contain the current origin/main; fetch and rebase or merge before continuing.');
  }
  if (overlaps.length > 0) {
    errors.push('Another session has overlapping uncommitted paths; coordinate through the shared Notion task first.');
  }
  if (integration && currentDirtyPaths.length > 0) {
    errors.push('Integration requires a clean current worktree.');
  }

  return { errors, overlaps };
}

function isMainModule() {
  return process.argv[1]
    && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
}

function main() {
  const integration = process.argv.includes('--integration');
  const json = process.argv.includes('--json');
  const noFetch = process.argv.includes('--no-fetch');
  const cwd = process.cwd();
  const repositoryRoot = git(['rev-parse', '--show-toplevel'], cwd);

  if (!noFetch) git(['fetch', '--prune', 'origin', 'main'], repositoryRoot, { timeout: 90_000 });

  const worktrees = parseWorktreePorcelain(git(['worktree', 'list', '--porcelain'], repositoryRoot));
  const currentPath = path.resolve(repositoryRoot);
  const current = worktrees.find(worktree => path.resolve(worktree.path) === currentPath);
  if (!current) throw new Error(`Current worktree is missing from git worktree list: ${currentPath}`);

  const dirtyByWorktree = new Map(worktrees.map((worktree) => [
    worktree.path,
    parsePorcelainPaths(git(
      ['status', '--porcelain=v1', '--untracked-files=all'],
      worktree.path,
    )),
  ]));
  const currentDirtyPaths = dirtyByWorktree.get(current.path) ?? [];
  const siblingDirtyPaths = new Map(
    [...dirtyByWorktree].filter(([worktreePath, paths]) => (
      worktreePath !== current.path && paths.length > 0
    )),
  );
  const ancestor = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'],
    { cwd: repositoryRoot, stdio: 'ignore' },
  );
  if (![0, 1].includes(ancestor.status)) {
    throw new Error('Unable to compare the current branch with origin/main.');
  }

  const evaluation = evaluateSessionState({
    branch: current.branch,
    detached: current.detached,
    currentDirtyPaths,
    siblingDirtyPaths,
    originMainIsAncestor: ancestor.status === 0,
    integration,
  });
  const payload = {
    ok: evaluation.errors.length === 0,
    mode: integration ? 'integration' : 'work',
    repositoryRoot,
    branch: current.branch,
    head: current.head,
    originMain: git(['rev-parse', 'origin/main'], repositoryRoot),
    currentDirtyPaths,
    dirtySiblingWorktrees: [...siblingDirtyPaths].map(([worktreePath, paths]) => ({
      path: worktreePath,
      dirtyPaths: paths,
    })),
    overlaps: evaluation.overlaps,
    errors: evaluation.errors,
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        `${payload.ok ? 'PASS' : 'BLOCKED'} ${payload.mode} preflight`,
        `branch: ${payload.branch ?? '(detached)'}`,
        `HEAD: ${payload.head}`,
        `origin/main: ${payload.originMain}`,
        `current dirty paths: ${payload.currentDirtyPaths.length}`,
        `dirty sibling worktrees: ${payload.dirtySiblingWorktrees.length}`,
        ...payload.overlaps.map(item => `overlap: ${item.path} (${item.worktree})`),
        ...payload.errors.map(error => `error: ${error}`),
      ].join('\n') + '\n',
    );
  }

  if (!payload.ok) process.exitCode = 1;
}

if (isMainModule()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`agent session preflight failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
