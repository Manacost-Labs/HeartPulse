import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('manual production acceptance refuses unattended execution before any request', () => {
  const result = spawnSync(process.execPath, ['tests/production-auth-e2e.test.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, BASE_URL: 'http://127.0.0.1:9' },
    input: '',
    encoding: 'utf8',
    timeout: 3000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires an interactive terminal; no requests were sent/);
  assert.equal(result.stdout, '');
});
