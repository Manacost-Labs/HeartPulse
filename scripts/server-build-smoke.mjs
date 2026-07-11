import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const temporaryRoot = mkdtempSync(join(tmpdir(), 'hs-arena-server-smoke-'));
const dataDir = join(temporaryRoot, 'data');
const ecosystemDir = join(temporaryRoot, 'ecosystem');
const port = 32_000 + Math.floor(Math.random() * 2_000);
const now = new Date().toISOString();

mkdirSync(dataDir, { recursive: true });
mkdirSync(ecosystemDir, { recursive: true });
writeFileSync(join(dataDir, 'winrates.json'), JSON.stringify({ updatedAt: now, source: 'smoke', classes: [{}] }));
writeFileSync(join(dataDir, 'tierlist.json'), JSON.stringify({ updatedAt: now, source: 'smoke', sections: [{}] }));
writeFileSync(join(dataDir, 'legendaries.json'), JSON.stringify({ updatedAt: now, source: 'smoke', groups: [{}] }));

const child = spawn(process.execPath, ['build/server/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    APP_ROOT_DIR: resolve(root),
    DISABLE_INITIAL_SCRAPE: '1',
    ECOSYSTEM_DB_FILE: join(ecosystemDir, 'users.sqlite'),
    ECOSYSTEM_DIR: ecosystemDir,
    HOST: '127.0.0.1',
    KHA_VIP_PROFILES_FILE: join(temporaryRoot, 'profiles.json'),
    PORT: String(port),
    REDIS_ENABLED: '0',
    SERVER_DATA_DIR: dataDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

async function requestJson(path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  const body = await response.json();
  return { response, body };
}

try {
  let live;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`compiled server exited with ${child.exitCode}\n${output}`);
    try {
      live = await requestJson('/health/live');
      break;
    } catch {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
    }
  }
  if (!live) throw new Error(`compiled server did not become live\n${output}`);
  if (live.response.status !== 200 || live.body.status !== 'alive') throw new Error('direct liveness contract failed');

  const proxied = await requestJson('/api/health/live');
  if (proxied.response.status !== 200 || proxied.body.status !== 'alive') throw new Error('proxied liveness contract failed');

  const ready = await requestJson('/health/ready');
  if (ready.response.status !== 200 || ready.body.status !== 'ready') throw new Error(`readiness contract failed: ${JSON.stringify(ready.body)}`);

  const data = await requestJson('/health/data');
  if (data.response.status !== 200 || data.body.status !== 'ok') throw new Error(`data health contract failed: ${JSON.stringify(data.body)}`);

  const legacy = await requestJson('/api/status');
  if (legacy.response.status !== 200 || legacy.body.nextScrape !== 'каждые 6 часов') throw new Error('legacy status contract failed');

  console.log('compiled server smoke tests passed');
} finally {
  child.kill('SIGTERM');
  await new Promise(resolveClose => {
    if (child.exitCode !== null) return resolveClose();
    child.once('close', resolveClose);
    setTimeout(() => {
      child.kill('SIGKILL');
      resolveClose();
    }, 3_000).unref();
  });
  rmSync(temporaryRoot, { recursive: true, force: true });
}
