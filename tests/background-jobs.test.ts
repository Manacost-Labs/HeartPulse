import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

async function boot(backgroundJobs: '0' | '1') {
  const state = await mkdtemp(join(tmpdir(), 'hp-background-jobs-'));
  const program = `
    const { Server } = await import('node:http');
    const listen = Server.prototype.listen;
    Server.prototype.listen = function (_port, ...args) { return listen.call(this, 0, ...args); };
    globalThis.fetch = async () => { console.error('TEST_OUTBOUND_FETCH'); throw new Error('isolated test'); };
    await import('./server/index.ts');
    setTimeout(() => process.kill(process.pid, 'SIGTERM'), 3200);
  `;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', program], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH, NODE_ENV: 'test', PORT: '0', HOST: '127.0.0.1',
      APP_ROOT_DIR: process.cwd(), APP_URL: 'https://test.hearthpulse.net',
      SERVER_DATA_DIR: join(state, 'data'), ECOSYSTEM_DIR: join(state, 'ecosystem'),
      ECOSYSTEM_DB_FILE: join(state, 'ecosystem', 'users.sqlite'),
      KOLODAHS_DB_ROOT: join(state, 'cards'), KHA_VIP_PROFILES_FILE: join(state, 'vip.json'),
      OLD_GUIDES_DB_FILE: join(state, 'old-guides.sqlite'), REDIS_ENABLED: '0',
      BACKGROUND_JOBS_ENABLED: backgroundJobs, ARENA_DRAFT_REFRESH_STARTUP_DELAY_MS: '50',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', data => { output += String(data); });
  child.stderr.on('data', data => { output += String(data); });
  const deadline = setTimeout(() => child.kill('SIGKILL'), 15_000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(code, 0, output);
    assert.match(output, /API server running/, output);
    return output;
  } finally {
    clearTimeout(deadline);
    child.kill('SIGKILL');
    await rm(state, { recursive: true, force: true });
  }
}

test('disabled background jobs boot the real isolated server without outbound fetches', async () => {
  const enabled = await boot('1');
  assert.match(enabled, /TEST_OUTBOUND_FETCH/, 'control must detect real startup network work');
  const disabled = await boot('0');
  assert.doesNotMatch(disabled, /TEST_OUTBOUND_FETCH|Startup sync complete|Startup sync failed/);
});
