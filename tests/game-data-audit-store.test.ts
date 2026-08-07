import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { pruneAuditReviews, withAuditLock } from '../server/modules/gameDataAudit/store.js';

test('stale process lock is recovered but an active lock is preserved', async t => {
  const stateDir = join('/tmp', `game-data-audit-lock-${process.pid}-${Date.now()}`);
  await mkdir(stateDir, { recursive: true });
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(stateDir, { recursive: true, force: true });
  });

  await writeFile(join(stateDir, '.lock'), '99999999\n');
  assert.equal(await withAuditLock(stateDir, async () => 'recovered'), 'recovered');

  await writeFile(join(stateDir, '.lock'), `${process.pid}\n`);
  await assert.rejects(withAuditLock(stateDir, async () => 'unexpected'), /already running/);
});

test('review retention removes older JSON files', async t => {
  const stateDir = join('/tmp', `game-data-audit-reviews-${process.pid}-${Date.now()}`);
  const reviewsDir = join(stateDir, 'reviews');
  await mkdir(reviewsDir, { recursive: true });
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(stateDir, { recursive: true, force: true });
  });
  await Promise.all(['001.json', '002.json', '003.json'].map(name => writeFile(join(reviewsDir, name), '{}\n')));

  await pruneAuditReviews(stateDir, 2);

  assert.deepEqual((await readdir(reviewsDir)).sort(), ['002.json', '003.json']);
});
