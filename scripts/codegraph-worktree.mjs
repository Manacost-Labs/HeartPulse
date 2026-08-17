#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseWorktreePorcelain } from './agent-session-preflight.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const READ_ONLY_COMMANDS = new Set([
  'affected',
  'callees',
  'callers',
  'explore',
  'files',
  'impact',
  'node',
  'query',
  'status',
]);

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 45_000,
  }).trimEnd();
}

function isDirty(worktreeRoot) {
  return git(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    worktreeRoot,
  ).trim().length > 0;
}

function hasIndex(worktreeRoot) {
  return existsSync(path.join(worktreeRoot, '.codegraph', 'codegraph.db'));
}

function snapshotWorktree(worktree) {
  return {
    path: worktree.path,
    head: worktree.head,
    dirty: isDirty(worktree.path),
    hasIndex: hasIndex(worktree.path),
  };
}

export function collectCodegraphState(cwd = process.cwd()) {
  const currentRoot = git(['rev-parse', '--show-toplevel'], cwd);
  const worktrees = parseWorktreePorcelain(
    git(['worktree', 'list', '--porcelain'], currentRoot),
  );
  const current = worktrees.find(item => path.resolve(item.path) === path.resolve(currentRoot));
  if (!current) {
    throw new Error(`Current worktree is missing from git worktree list: ${currentRoot}`);
  }

  const main = worktrees.find(item => item.branch === 'main') ?? null;
  return {
    current: snapshotWorktree(current),
    main: main ? snapshotWorktree(main) : null,
  };
}

export function selectCodegraphIndex({ current, main }) {
  if (current.hasIndex) {
    return {
      mode: 'local',
      root: current.path,
      prepare: 'sync',
      reason: 'current worktree already has a local index',
    };
  }

  if (
    main
    && main.path !== current.path
    && main.hasIndex
    && !current.dirty
    && !main.dirty
    && current.head === main.head
  ) {
    return {
      mode: 'shared',
      root: main.path,
      prepare: 'sync',
      reason: 'main worktree matches the clean current HEAD',
    };
  }

  return {
    mode: 'local',
    root: current.path,
    prepare: 'init',
    reason: 'shared main index is not safe for this worktree state',
  };
}

export function assertReadOnlyCodegraphArgs(args) {
  const [command] = args;
  if (!READ_ONLY_COMMANDS.has(command)) {
    throw new Error(
      `Use one of the read-only CodeGraph commands: ${[...READ_ONLY_COMMANDS].sort().join(', ')}`,
    );
  }
  const separatorIndex = args.indexOf('--');
  const optionArguments = separatorIndex < 0 ? args.slice(1) : args.slice(1, separatorIndex);
  if (optionArguments.some(argument => argument === '--path'
    || argument.startsWith('--path=')
    || argument.startsWith('-p'))) {
    throw new Error('The worktree-safe wrapper owns project selection; remove --path/-p.');
  }
  if (command === 'status') {
    const positionalArguments = separatorIndex < 0 ? [] : args.slice(separatorIndex + 1);
    const unsupportedOptions = optionArguments.filter(argument => !['-j', '--json', '-h', '--help'].includes(argument));
    if (unsupportedOptions.length > 0 || positionalArguments.length > 0) {
      throw new Error('The worktree-safe wrapper owns the status project path; remove the positional path.');
    }
  }
}

function runCodegraph(binary, args, options) {
  const result = spawnSync(binary, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.stdio,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`CodeGraph ${args[0]} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function assertLocalIndexIsIgnored(root) {
  const ignored = spawnSync(
    'git',
    ['check-ignore', '--quiet', '--no-index', '.codegraph/'],
    { cwd: root, stdio: 'ignore' },
  );
  if (ignored.error) throw ignored.error;
  if (ignored.status !== 0) {
    throw new Error(
      'Refusing to create a local index because .codegraph/ is not ignored by Git.',
    );
  }
}

function prepareIndex(plan, binary, env) {
  if (plan.prepare === 'init') {
    assertLocalIndexIsIgnored(plan.root);
    runCodegraph(binary, ['init', plan.root], { cwd: plan.root, env, stdio: 'inherit' });
    return;
  }
  runCodegraph(binary, ['sync', '--quiet', plan.root], {
    cwd: plan.root,
    env,
    stdio: 'ignore',
  });
}

function usage() {
  return [
    'Usage: node scripts/codegraph-worktree.mjs <read-command> [...args]',
    '',
    `Read commands: ${[...READ_ONLY_COMMANDS].sort().join(', ')}`,
    'The wrapper selects and synchronizes a safe worktree-aware index.',
  ].join('\n');
}

export function main(args = process.argv.slice(2), env = process.env, cwd = process.cwd()) {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  assertReadOnlyCodegraphArgs(args);

  const binary = env.CODEGRAPH_BIN?.trim() || '/usr/bin/codegraph';
  let plan = selectCodegraphIndex(collectCodegraphState(cwd));
  prepareIndex(plan, binary, env);

  if (plan.mode === 'shared') {
    const refreshed = selectCodegraphIndex(collectCodegraphState(cwd));
    if (refreshed.mode !== 'shared' || refreshed.root !== plan.root) {
      plan = refreshed;
      prepareIndex(plan, binary, env);
    }
  }

  process.stderr.write(
    `[codegraph-worktree] ${plan.mode} index: ${plan.root} (${plan.reason})\n`,
  );
  runCodegraph(binary, args, { cwd: plan.root, env, stdio: 'inherit' });
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH)) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(
      `[codegraph-worktree] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
