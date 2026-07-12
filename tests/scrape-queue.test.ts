import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createScrapeQueueHandler, queueScrapeRequest } from '../server/scrapeQueue.js';

const directory = mkdtempSync(join(tmpdir(), 'hs-arena-scrape-queue-'));

try {
  const queuedAt = new Date('2026-07-12T00:00:00.000Z');
  const marker = queueScrapeRequest(directory, queuedAt);
  assert.equal(readFileSync(marker, 'utf8'), `${queuedAt.toISOString()}\n`);

  const app = express();
  app.post('/scrape', createScrapeQueueHandler(directory));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/scrape`, { method: 'POST' });
    assert.equal(response.status, 202);
    assert.match((await response.json()).message, /изолированную очередь/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }

  const blockedPath = join(directory, 'not-a-directory');
  writeFileSync(blockedPath, 'fixture');
  assert.throws(() => queueScrapeRequest(blockedPath), /EEXIST/);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('isolated scrape queue tests passed');
