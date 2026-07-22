import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-ignore: node:sqlite is available in the production Node 22 runtime.
import { DatabaseSync } from 'node:sqlite';
import {
  SQLITE_BUSY_TIMEOUT_MS,
  configureWritableSqliteConnection,
} from '../server/sqliteConnection.js';

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'hs-arena-sqlite-'));
const databasePath = join(temporaryDirectory, 'users.sqlite');
let lockHolder: ChildProcessWithoutNullStreams | null = null;
let database: DatabaseSync | null = null;

async function waitForLine(child: ChildProcessWithoutNullStreams, expected: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let stdout = '';
    const onData = (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (!stdout.includes(`${expected}\n`)) return;
      child.stdout.off('data', onData);
      resolve();
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
    child.once('exit', code => {
      if (!stdout.includes(`${expected}\n`)) {
        reject(new Error(`SQLite lock holder exited early with code ${code}: ${stdout}`));
      }
    });
  });
}

try {
  const setupDatabase = new DatabaseSync(databasePath);
  setupDatabase.exec('PRAGMA journal_mode = WAL; CREATE TABLE writes (value TEXT NOT NULL);');
  setupDatabase.close();

  const lockHolderScript = `
    const { DatabaseSync } = require('node:sqlite');
    const database = new DatabaseSync(process.argv[1]);
    database.exec('BEGIN IMMEDIATE;');
    process.stdout.write('locked\\n');
    setTimeout(() => {
      database.exec('ROLLBACK;');
      database.close();
    }, 250);
  `;
  lockHolder = spawn(process.execPath, ['-e', lockHolderScript, databasePath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForLine(lockHolder, 'locked');

  database = new DatabaseSync(databasePath);
  configureWritableSqliteConnection(database);

  const busyTimeoutRow = database.prepare('PRAGMA busy_timeout').get() as Record<string, number>;
  assert.equal(Object.values(busyTimeoutRow)[0], SQLITE_BUSY_TIMEOUT_MS);

  const startedAt = Date.now();
  database.exec("BEGIN IMMEDIATE; INSERT INTO writes (value) VALUES ('completed'); COMMIT;");
  const waitedMilliseconds = Date.now() - startedAt;

  assert.ok(waitedMilliseconds >= 100, `expected SQLite to wait for the writer, waited ${waitedMilliseconds}ms`);
  const completedWrite = database.prepare('SELECT value FROM writes').get() as { value: string };
  assert.equal(completedWrite.value, 'completed');
  console.log('sqlite connection contention tests passed');
} finally {
  database?.close();
  if (lockHolder && lockHolder.exitCode === null) lockHolder.kill('SIGTERM');
  await rm(temporaryDirectory, { recursive: true, force: true });
}
