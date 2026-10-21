import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  branchViolations, exemptFiles, parseNameStatus, selectBase, sharedPathViolations,
} from '../scripts/shared-hot-spots.mjs';

test('task branches may only add bundle approvals, never edit the changelog, policy or baselines', () => {
  assert.deepEqual(sharedPathViolations([
    { status: 'M', file: 'src/App.tsx' },
    { status: 'A', file: 'changelog.d/2026-10-21-queue.md' },
    { status: 'A', file: 'config/next-bundle-budgets/approvals/queue.json' },
    { status: 'M', file: 'config/function-size-budgets.json' },
  ]), []);
  const violations = sharedPathViolations([
    { status: 'M', file: 'CHANGELOG.md' },
    { status: 'M', file: 'config/next-bundle-budgets.json' },
    { status: 'M', file: 'config/next-bundle-budgets/baselines/home.json' },
    { status: 'A', file: 'config/next-bundle-budgets/baselines/new-route.json' },
    { status: 'M', file: 'config/next-bundle-budgets/approvals/other-branch.json' },
    { status: 'D', file: 'config/next-bundle-budgets/approvals/old.json' },
  ]);
  assert.equal(violations.length, 6);
  assert.match(violations[0], /^CHANGELOG\.md: .*changelog\.d/);
  assert.match(violations[2], /baselines\/home\.json: .*approvals/);
  assert.match(violations[4], /approvals\/other-branch\.json: .*new approval file/);
  assert.match(violations[5], /Shared-Hot-Spots: <reason>/);
});

test('the trailer exempts only the files its own commit touched', () => {
  const exempt = exemptFiles([
    { trailer: 'baseline refresh', files: ['config/next-bundle-budgets/baselines/home.json'] },
    { trailer: '', files: ['config/next-bundle-budgets/baselines/tierlist.json'] },
  ]);
  const violations = sharedPathViolations([
    { status: 'M', file: 'config/next-bundle-budgets/baselines/home.json' },
    { status: 'M', file: 'config/next-bundle-budgets/baselines/tierlist.json' },
  ], exempt);
  assert.deepEqual(violations.map(line => line.split(':')[0]), ['config/next-bundle-budgets/baselines/tierlist.json']);
});

test('name-status lines become changes', () => {
  assert.deepEqual(parseNameStatus('M\tCHANGELOG.md\nA\tchangelog.d/2026-10-21-a.md\n'),
    [{ status: 'M', file: 'CHANGELOG.md' }, { status: 'A', file: 'changelog.d/2026-10-21-a.md' }]);
});

test('CI checks pull requests against their base and skips queue and main pushes', () => {
  const git = {
    head: 'head',
    resolve: ref => ({ 'base-sha': 'base-sha', 'origin/main': 'main-sha' })[ref] ?? null,
    mergeBase: (left, right) => `${left}^${right}`,
    isAncestor: () => false,
  };
  assert.deepEqual(selectBase({ ...git, env: { CLEAN_CODE_EVENT: 'pull_request', CLEAN_CODE_PR_BASE_SHA: 'base-sha' } }),
    { base: 'base-sha^head' });
  assert.ok(selectBase({ ...git, env: { GITHUB_EVENT_NAME: 'merge_group' } }).skip);
  assert.ok(selectBase({ ...git, env: { CLEAN_CODE_EVENT: 'push' } }).skip);
  assert.deepEqual(selectBase({ ...git, env: {} }), { base: 'main-sha^head' });
  assert.ok(selectBase({ ...git, env: {}, isAncestor: () => true }).skip, 'a main checkout has nothing to integrate');
  assert.throws(() => selectBase({ ...git, env: { CLEAN_CODE_EVENT: 'pull_request' } }), /base is unavailable/);
});

test('a real branch: only the trailered commit may touch shared files', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'hot-spots-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  };
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  write('config/next-bundle-budgets/baselines/home.json', '{"jsGzipBytes":1}\n');
  write('config/next-bundle-budgets/approvals/old.json', '{}\n');
  write('CHANGELOG.md', '# Changelog\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'base');
  const base = git('rev-parse', 'HEAD');

  write('config/next-bundle-budgets/approvals/task.json', '{}\n');
  write('src.txt', 'feature\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'feat: task with an approval');
  assert.deepEqual(branchViolations(root, base), []);

  write('config/next-bundle-budgets/baselines/home.json', '{"jsGzipBytes":2}\n');
  unlinkSync(path.join(root, 'config/next-bundle-budgets/approvals/old.json'));
  git('add', '-A');
  git('commit', '--quiet', '-m', 'chore(budgets): refresh baselines\n\nShared-Hot-Spots: baseline refresh\nCo-Authored-By: test <test@example.invalid>');
  assert.deepEqual(branchViolations(root, base), []);

  write('CHANGELOG.md', '# Changelog\n\n- edited by hand\n');
  git('commit', '--quiet', '-am', 'docs: edit the changelog\n\nThe refresh above does not cover this file.');
  assert.deepEqual(branchViolations(root, base).map(line => line.split(':')[0]), ['CHANGELOG.md']);
});
