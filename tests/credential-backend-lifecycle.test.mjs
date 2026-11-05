import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

async function runFixtureProbe(source) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    // The failure being tested leaks backend children as well as local servers.
    process.kill(-child.pid, 'SIGKILL');
  }, 15000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(timedOut, false, `Fixture leaked resources after setup failed:\n${output}`);
    assert.equal(code, 0, output);
  } finally {
    clearTimeout(deadline);
  }
}

test('a health response before the owned backend starts cannot expose an empty database', async () => {
  await runFixtureProbe(`
    import assert from 'node:assert/strict';
    import { startCredentialBackend } from './tests/helpers/credentialBackend.mjs';
    globalThis.fetch = async () => Response.json({ status: 'alive' });
    const backend = await startCredentialBackend();
    try {
      assert.ok(backend.database.prepare("SELECT name FROM sqlite_master WHERE name='users'").get(),
        'fixture returned before its own backend initialized users');
    } finally { await backend.close(); }
  `);
});

test('card fixture setup failure closes its backend and local servers before rejecting', async () => {
  await runFixtureProbe(`
    import assert from 'node:assert/strict';
    import { DatabaseSync } from 'node:sqlite';
    import { publicCardFixture } from './tests/helpers/publicCardFixture.mjs';
    const prepare = DatabaseSync.prototype.prepare;
    DatabaseSync.prototype.prepare = function (sql, ...args) {
      if (sql.startsWith('INSERT INTO users')) throw new Error('injected seed failure');
      return prepare.call(this, sql, ...args);
    };
    await assert.rejects(publicCardFixture(), /injected seed failure/);
  `);
});
