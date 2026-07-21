#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = mkdtempSync(join(tmpdir(), 'hs-arena-host-loss-'));
const sourceData = join(fixture, 'source', 'server-data');
const sourceEcosystem = join(fixture, 'source', 'ecosystem');
const backupDir = join(fixture, 'backups');
const restoredRoot = join(fixture, 'restored');
const passphrase = join(fixture, 'passphrase');
const releaseRoot = join(fixture, 'release');
const port = await new Promise((resolvePort, rejectPort) => {
  const probe = createServer();
  probe.unref();
  probe.once('error', rejectPort);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close();
      rejectPort(new Error('failed to allocate recovery smoke port'));
      return;
    }
    probe.close(error => error ? rejectPort(error) : resolvePort(address.port));
  });
});
const now = new Date().toISOString();

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status})\n${result.stdout || ''}${result.stderr || ''}`);
  }
  return result.stdout.trim();
}

async function requestJson(path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return { response, body: await response.json() };
}

for (const directory of [sourceData, sourceEcosystem, backupDir, releaseRoot]) {
  mkdirSync(directory, { recursive: true });
}
mkdirSync(join(sourceData, 'uploads', 'admin'), { recursive: true });
writeFileSync(join(sourceData, 'winrates.json'), JSON.stringify({ updatedAt: now, source: 'recovery', classes: [{}] }));
writeFileSync(join(sourceData, 'tierlist.json'), JSON.stringify({ updatedAt: now, source: 'recovery', sections: [{}] }));
writeFileSync(join(sourceData, 'legendaries.json'), JSON.stringify({ updatedAt: now, source: 'recovery', groups: [{}] }));
const { ConstructedCardCatalogStore } = await import('../build/server/constructedCardCatalogStore.js');
const catalogStore = new ConstructedCardCatalogStore({ stateDirectory: sourceData });
for (const [format, count] of [['standard', 500], ['wild', 3_000]]) {
  catalogStore.publish(format, Array.from({ length: count }, (_, index) => ({
    card_id: `${format.toUpperCase()}_RECOVERY_${index + 1}`,
    dbf: (format === 'standard' ? 300_000 : 400_000) + index,
    name: { ru: `Recovery ${index + 1}` },
    formats: [{ slug: format }],
  })), { expectedTotal: count, sourceUpdatedAt: now });
}
writeFileSync(join(sourceData, 'uploads', 'admin', 'recovered.txt'), 'recovered upload\n');
writeFileSync(join(sourceEcosystem, 'kha-vip-profiles.json'), '{"profiles":[]}\n');
run('sqlite3', [join(sourceEcosystem, 'users.sqlite'), 'CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ("recovery-user");']);
writeFileSync(passphrase, 'host-loss-test-passphrase\n');
chmodSync(passphrase, 0o600);
writeFileSync(join(releaseRoot, 'release.json'), JSON.stringify({ sha: 'dec0de1' }));

const backupEnvironment = {
  ...process.env,
  ECOSYSTEM_DIR: sourceEcosystem,
  HS_ARENA_BACKUP_DIR: backupDir,
  HS_ARENA_BACKUP_LOCK_FILE: join(fixture, 'backup.lock'),
  HS_ARENA_BACKUP_PASSPHRASE_FILE: passphrase,
  HS_ARENA_BACKUP_RETENTION_DAYS: '1',
  SERVER_DATA_DIR: sourceData,
};

let child;
let output = '';
try {
  const backupFile = run(join(root, 'scripts', 'backup-shared-data.sh'), [], { env: backupEnvironment }).split('\n').at(-1);
  if (!backupFile || !existsSync(backupFile)) throw new Error('backup archive was not created');
  run(join(root, 'scripts', 'restore-backup.sh'), [backupFile, restoredRoot], {
    env: { ...process.env, HS_ARENA_BACKUP_PASSPHRASE_FILE: passphrase },
  });

  if (readFileSync(join(restoredRoot, 'server-data', 'uploads', 'admin', 'recovered.txt'), 'utf8') !== 'recovered upload\n') {
    throw new Error('uploaded file was not restored');
  }
  const restoredUser = run('sqlite3', [join(restoredRoot, 'ecosystem', 'users.sqlite'), 'SELECT id FROM users;']);
  if (restoredUser !== 'recovery-user') throw new Error('ecosystem database row was not restored');

  child = spawn(process.execPath, ['build/server/index.js'], {
    cwd: root,
    env: {
      ...process.env,
      APP_ROOT_DIR: releaseRoot,
      DISABLE_INITIAL_SCRAPE: '1',
      ECOSYSTEM_DB_FILE: join(restoredRoot, 'ecosystem', 'users.sqlite'),
      ECOSYSTEM_DIR: join(restoredRoot, 'ecosystem'),
      GITHUB_SHA: '',
      HOST: '127.0.0.1',
      KHA_VIP_PROFILES_FILE: join(restoredRoot, 'ecosystem', 'kha-vip-profiles.json'),
      PORT: String(port),
      REDIS_ENABLED: '0',
      RELEASE_SHA: '',
      SERVER_DATA_DIR: join(restoredRoot, 'server-data'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });

  let live;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`recovered server exited with ${child.exitCode}\n${output}`);
    try {
      live = await requestJson('/health/live');
      break;
    } catch {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
    }
  }
  if (!live || live.response.status !== 200 || live.body.release !== 'dec0de1') {
    throw new Error(`recovered runtime did not become live\n${output}`);
  }
  const ready = await requestJson('/health/ready');
  if (ready.response.status !== 200 || ready.body.status !== 'ready') {
    throw new Error(`recovered runtime is not ready: ${JSON.stringify(ready.body)}`);
  }
  const data = await requestJson('/health/data');
  const constructedDatasets = Array.isArray(data.body.datasets)
    ? data.body.datasets.filter(dataset => String(dataset?.name || '').startsWith('constructed-cards-'))
    : [];
  if (data.response.status !== 503
    || data.body.status !== 'degraded'
    || data.body.ready !== true
    || data.body.fresh !== false
    || constructedDatasets.length !== 2
    || constructedDatasets.some(dataset => dataset.state !== 'stale' || dataset.cacheSource !== 'LKG')) {
    throw new Error(`recovered datasets are not healthy: ${JSON.stringify(data.body)}`);
  }

  console.log('host-loss recovery runtime smoke tests passed');
} finally {
  if (child) {
    child.kill('SIGTERM');
    await new Promise(resolveClose => {
      if (child.exitCode !== null) return resolveClose();
      child.once('close', resolveClose);
      setTimeout(() => {
        child.kill('SIGKILL');
        resolveClose();
      }, 3_000).unref();
    });
  }
  rmSync(fixture, { recursive: true, force: true });
}
