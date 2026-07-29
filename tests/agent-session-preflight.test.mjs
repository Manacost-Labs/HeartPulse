import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateSessionState,
  parsePorcelainPaths,
  parseWorktreePorcelain,
} from '../scripts/agent-session-preflight.mjs';

test('parses linked worktrees and renamed dirty paths deterministically', () => {
  assert.deepEqual(parseWorktreePorcelain([
    'worktree /repo',
    `HEAD ${'a'.repeat(40)}`,
    'branch refs/heads/main',
    '',
    'worktree /tmp/feature',
    `HEAD ${'b'.repeat(40)}`,
    'detached',
    '',
  ].join('\n')), [
    { path: '/repo', head: 'a'.repeat(40), branch: 'main', detached: false },
    { path: '/tmp/feature', head: 'b'.repeat(40), branch: null, detached: true },
  ]);
  assert.deepEqual(
    parsePorcelainPaths(' M src/App.tsx\nR  old.ts -> new.ts\n?? docs/note.md\n'),
    ['docs/note.md', 'new.ts', 'old.ts', 'src/App.tsx'],
  );
});

test('blocks stale integration and overlapping uncommitted paths', () => {
  const result = evaluateSessionState({
    branch: 'feature/cards',
    detached: false,
    currentDirtyPaths: ['src/cards.css'],
    siblingDirtyPaths: new Map([
      ['/tmp/other', ['src/cards.css', 'src/other.ts']],
    ]),
    originMainIsAncestor: false,
    integration: true,
  });

  assert.deepEqual(result.overlaps, [
    { path: 'src/cards.css', worktree: '/tmp/other' },
  ]);
  assert.ok(result.errors.some(error => /origin\/main/i.test(error)));
  assert.ok(result.errors.some(error => /clean current worktree/i.test(error)));
  assert.ok(result.errors.some(error => /overlap/i.test(error)));
});

test('allows a clean feature branch based on current origin main', () => {
  const result = evaluateSessionState({
    branch: 'feature/cards',
    detached: false,
    currentDirtyPaths: [],
    siblingDirtyPaths: new Map([
      ['/tmp/other', ['src/other.ts']],
    ]),
    originMainIsAncestor: true,
    integration: true,
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.overlaps, []);
});
