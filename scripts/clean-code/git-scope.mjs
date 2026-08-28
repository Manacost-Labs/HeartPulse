import { spawnSync } from 'node:child_process';

import { CLEAN_CODE_ROOTS, isAuthoredSource } from './source-scope.mjs';

const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const ZERO_SHA_PATTERN = /^0{40}$/;

function runGit(args, repositoryRoot) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || `git ${args.join(' ')} failed`).trim());
  }
  return result.stdout;
}

function tryGit(args, repositoryRoot) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function resolveCommit(ref, repositoryRoot) {
  return tryGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], repositoryRoot);
}

function mergeBase(left, right, repositoryRoot) {
  return tryGit(['merge-base', left, right], repositoryRoot);
}

function checkedBase(base, head, baseSource) {
  if (base === head) {
    throw new Error(`${baseSource} clean-code base resolves to HEAD; refusing an empty diff`);
  }
  return { mode: 'changed', base, head, baseSource };
}

function fullFallback(head, baseSource, reason) {
  return {
    mode: 'full',
    base: null,
    head,
    baseSource: `${baseSource}-full-fallback`,
    fallbackReason: reason,
  };
}

function explicitBase(ref, head, repositoryRoot, baseSource) {
  const resolved = resolveCommit(ref, repositoryRoot);
  if (!resolved) throw new Error(`explicit clean-code base not found: ${ref}`);
  return checkedBase(resolved, head, baseSource);
}

export function resolveCleanCodeBase({ env = process.env, repositoryRoot }) {
  const head = resolveCommit('HEAD', repositoryRoot);
  if (!head) throw new Error('clean-code HEAD cannot be resolved');

  if (env.CLEAN_CODE_BASE?.trim()) {
    return explicitBase(env.CLEAN_CODE_BASE.trim(), head, repositoryRoot, 'explicit');
  }

  const event = env.CLEAN_CODE_EVENT?.trim() || env.GITHUB_EVENT_NAME?.trim() || '';
  if (event === 'pull_request' || event === 'pull_request_target') {
    const requested = env.CLEAN_CODE_PR_BASE_SHA?.trim();
    const candidate = requested && SHA_PATTERN.test(requested)
      ? resolveCommit(requested, repositoryRoot)
      : null;
    if (candidate && candidate !== head) {
      const common = mergeBase(candidate, head, repositoryRoot);
      if (common === candidate) return checkedBase(candidate, head, 'pull-request');
      if (common && common !== head) return checkedBase(common, head, 'pull-request-merge-base');
    }
    const baseRef = env.GITHUB_BASE_REF?.trim();
    const remoteBase = baseRef ? resolveCommit(`origin/${baseRef}`, repositoryRoot) : null;
    const common = remoteBase ? mergeBase(remoteBase, head, repositoryRoot) : null;
    if (common && common !== head) return checkedBase(common, head, 'pull-request-merge-base');
    return fullFallback(head, 'pull-request', 'pull request base is unavailable or equals HEAD');
  }

  if (event === 'push') {
    const before = env.CLEAN_CODE_PUSH_BEFORE?.trim() || env.GITHUB_EVENT_BEFORE?.trim() || '';
    const candidate = SHA_PATTERN.test(before) && !ZERO_SHA_PATTERN.test(before)
      ? resolveCommit(before, repositoryRoot)
      : null;
    if (candidate && candidate !== head) return checkedBase(candidate, head, 'push-before');
    return fullFallback(head, 'push', 'push before SHA is unavailable, zero, or equals HEAD');
  }

  if (event === 'workflow_dispatch') {
    const requested = env.CLEAN_CODE_DISPATCH_BASE?.trim();
    if (requested) return explicitBase(requested, head, repositoryRoot, 'workflow-dispatch');
    return fullFallback(head, 'workflow-dispatch', 'manual run did not provide a base');
  }

  const main = resolveCommit('origin/main', repositoryRoot);
  if (main && main !== head) {
    const common = mergeBase(main, head, repositoryRoot);
    if (common && common !== head) return checkedBase(common, head, 'local-merge-base');
    return fullFallback(head, 'local', 'origin/main is not an ancestor of HEAD');
  }
  const parent = resolveCommit('HEAD^', repositoryRoot);
  if (parent) return checkedBase(parent, head, 'local-parent');
  return fullFallback(head, 'local', 'repository has no usable parent commit');
}

function nulFields(output) {
  return output.split('\0').filter(Boolean);
}

export function changedFileMappings(base, repositoryRoot) {
  const fields = nulFields(runGit(
    ['diff', '--name-status', '-z', '-M', '--diff-filter=AMR', base, '--', ...CLEAN_CODE_ROOTS],
    repositoryRoot,
  ));
  const mappings = new Map();
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (status.startsWith('R')) {
      const baselineFile = fields[index++];
      const file = fields[index++];
      if (isAuthoredSource(file)) mappings.set(file, baselineFile);
      continue;
    }
    const file = fields[index++];
    if (isAuthoredSource(file)) mappings.set(file, file);
  }
  for (const file of nulFields(runGit(
    ['ls-files', '-z', '--others', '--exclude-standard', '--', ...CLEAN_CODE_ROOTS],
    repositoryRoot,
  ))) {
    if (isAuthoredSource(file)) mappings.set(file, file);
  }
  return [...mappings]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([file, baselineFile]) => ({ file, baselineFile }));
}

export function resolveCleanCodeScope(options) {
  const resolved = resolveCleanCodeBase(options);
  if (resolved.mode === 'full') {
    return { ...resolved, files: [], changedSourceFiles: null };
  }
  const files = changedFileMappings(resolved.base, options.repositoryRoot);
  return { ...resolved, files, changedSourceFiles: files.length };
}
