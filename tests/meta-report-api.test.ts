import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import express from 'express';
import { createMetaReportRouter } from '../server/modules/metaReport/public.ts';
import { PAID_SENTINELS, recordMetaReportWeeks } from './helpers/metaReportFixture.ts';

/*
 * GET /api/meta-reports and /api/meta-reports/:date (docs/specs/meta-report-snapshots.md, «HTTP»)
 * over snapshots the real job recorded into a real SQLite file.
 */

async function serve(t: test.TestContext, snapshots: Parameters<typeof createMetaReportRouter>[0]) {
  const app = express();
  app.use('/api', createMetaReportRouter(snapshots));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('the archive lists the recorded Mondays newest first and answers each snapshot as stored', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'meta-report-api-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const snapshots = await recordMetaReportWeeks(directory);
  t.after(() => snapshots.close());
  const origin = await serve(t, snapshots);

  const list = await fetch(`${origin}/api/meta-reports`);
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('cache-control'), 'public, max-age=300');
  assert.deepEqual(await list.json(), { dates: ['2026-12-07', '2026-11-30', '2026-11-23'] });

  const report = await fetch(`${origin}/api/meta-reports/2026-11-30`);
  assert.equal(report.status, 200);
  assert.equal(report.headers.get('cache-control'), 'public, max-age=3600');
  const text = await report.text();
  const body = JSON.parse(text);
  assert.equal(body.date, '2026-11-30');
  assert.equal(body.recordedAt, '2026-11-30T06:40:00.000Z');
  assert.equal(body.sections.standard.data.period, 'patch_37.0.2');
  assert.deepEqual(body.sections.standard.data.items[0], {
    slug: 'zoo-warlock', archetype: 'Zoo Warlock', name: 'Зоо Чернокнижник', classKey: 'warlock', winrate: 56.9, popularity: 10.4, games: 26000,
  });
  assert.deepEqual(PAID_SENTINELS.filter(value => text.includes(value)), []);
});

test('an unknown, malformed or impossible date is a 404 that is not cached', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'meta-report-api-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const snapshots = await recordMetaReportWeeks(directory);
  t.after(() => snapshots.close());
  const origin = await serve(t, snapshots);

  for (const date of ['2026-11-24', '2026-02-30', 'latest', '2026-11-23x']) {
    const response = await fetch(`${origin}/api/meta-reports/${date}`);
    assert.equal(response.status, 404, date);
    assert.equal(response.headers.get('cache-control'), 'no-store', date);
    assert.deepEqual(await response.json(), { error: 'Meta report not found' }, date);
  }
});

test('an empty archive lists no dates; an unreadable store is a 503, not an empty archive', async t => {
  const empty = await serve(t, { list: () => [], get: () => null });
  assert.deepEqual(await (await fetch(`${empty}/api/meta-reports`)).json(), { dates: [] });

  const errors: unknown[] = [];
  const broken = await serve(t, {
    list: () => { throw new Error('disk gone'); },
    get: () => { throw new Error('disk gone'); },
    onError: error => errors.push(error),
  });
  for (const path of ['/api/meta-reports', '/api/meta-reports/2026-11-23']) {
    const response = await fetch(`${broken}${path}`);
    assert.equal(response.status, 503, path);
    assert.equal(response.headers.get('cache-control'), 'no-store', path);
  }
  assert.equal(errors.length, 2);
});
