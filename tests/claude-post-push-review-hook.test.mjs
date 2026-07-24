import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyHookEvent,
  containsSensitiveMaterial,
  parseGitHubRepository,
} from '../scripts/claude-post-push-review.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, '..');
const scriptPath = path.join(
  repositoryRoot,
  'scripts',
  'claude-post-push-review.mjs',
);

function postBash(command, overrides = {}) {
  return {
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    cwd: repositoryRoot,
    tool_input: { command },
    tool_response: {
      stdout: '',
      stderr: '',
      interrupted: false,
      ...overrides,
    },
  };
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('only accepts a standalone successful git push', () => {
  assert.equal(classifyHookEvent(postBash('git push')).action, 'review');
  assert.equal(
    classifyHookEvent(postBash('git -C "/tmp/repo" push origin main')).action,
    'review',
  );
  assert.equal(
    classifyHookEvent(postBash('echo "git push"')).action,
    'skip',
  );
  assert.equal(
    classifyHookEvent(postBash('git status && git push')).action,
    'skip',
  );
  assert.equal(
    classifyHookEvent(postBash('git push', { interrupted: true })).action,
    'skip',
  );
  assert.equal(
    classifyHookEvent(postBash('git push', { exitCode: 1 })).action,
    'skip',
  );
});

test('parses only supported GitHub origin formats', () => {
  assert.equal(
    parseGitHubRepository('git@github.com:Zulut30/manacost-arena.git'),
    'Zulut30/manacost-arena',
  );
  assert.equal(
    parseGitHubRepository('https://github.com/Zulut30/manacost-arena.git'),
    'Zulut30/manacost-arena',
  );
  assert.equal(
    parseGitHubRepository('ssh://git@github.com/Zulut30/manacost-arena.git'),
    'Zulut30/manacost-arena',
  );
  assert.equal(parseGitHubRepository('https://example.com/repo.git'), null);
});

test('blocks sensitive paths and likely credential content', () => {
  assert.equal(containsSensitiveMaterial(['src/App.tsx'], 'safe diff'), false);
  assert.equal(containsSensitiveMaterial(['config/.env'], 'safe diff'), true);
  assert.equal(
    containsSensitiveMaterial(['config/.env.production'], 'safe diff'),
    true,
  );
  assert.equal(
    containsSensitiveMaterial(
      ['src/config.ts'],
      '+ const access_token = "abcdefghijklmnop";',
    ),
    true,
  );
});

test('Linux dry-run resolves the repository and current SHA without posting', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'manacost-post-push-'));
  try {
    git(fixture, 'init');
    git(fixture, 'config', 'user.name', 'Manacost CI');
    git(fixture, 'config', 'user.email', 'ci@example.invalid');
    writeFileSync(path.join(fixture, 'safe.txt'), 'safe fixture\n');
    git(fixture, 'add', 'safe.txt');
    git(fixture, 'commit', '-m', 'test: safe post-push fixture');
    git(fixture, 'remote', 'add', 'origin', 'https://github.com/Zulut30/manacost-arena.git');

    const event = postBash('git push origin main');
    event.cwd = fixture;
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_REVIEW_DRY_RUN: '1',
        CLAUDE_REVIEW_SKIP_REMOTE_VERIFY: '1',
        CLAUDE_REVIEW_FAKE_REVIEW: 'No material issues found.',
      },
      input: JSON.stringify(event),
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.action, 'dry-run');
    assert.equal(output.repository, 'Zulut30/manacost-arena');
    assert.match(output.sha, /^[a-f0-9]{40}$/);
    assert.equal(output.files, 1);
    assert.equal(output.engine, 'fixture');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
