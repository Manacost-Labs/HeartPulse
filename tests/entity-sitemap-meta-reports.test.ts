import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildMetaReportView } from '../apps/public-web/lib/metaReportView';
import { createEntitySitemapRouter } from '../server/entitySitemapRoutes.js';
import { createEntitySitemapRuntimeOptions } from '../server/entitySitemapSources.js';
import { projectMetaReportSitemapCatalog } from '../server/entitySitemapMetaReportSources.js';
import { createSitemapIndexNowHook } from '../server/indexNow.js';
import { sitemapEntries } from '../scripts/production-monitor.mjs';
import { recordMetaReportWeeks, SCENARIOS } from './helpers/metaReportFixture.ts';

// The `meta-reports` segment (#612): the weekly reports the page itself answers as indexable, dated by the day of their
// snapshot, and the archive from two reports on. The reports are recorded by the real job into a real store.
const ORIGIN = 'https://hearthpulse.net';

type Recorded = Awaited<ReturnType<typeof recordMetaReportWeeks>>;

/** A site over the weeks of a scenario; `restartOf` starts it again on the state and snapshots of an earlier one. */
async function serve(scenario: keyof typeof SCENARIOS, options: { fetchImpl?: typeof fetch; restartOf?: { directory: string; snapshots: Recorded } } = {}) {
  const directory = options.restartOf?.directory ?? mkdtempSync(join(tmpdir(), 'arena-sitemap-reports-'));
  const snapshots = options.restartOf?.snapshots ?? await recordMetaReportWeeks(join(directory, 'reports'), scenario);
  const runtime = createEntitySitemapRuntimeOptions(async () => ({ cards: [] }), {}, undefined, undefined, snapshots);
  const app = express();
  app.use(createEntitySitemapRouter({
    canonicalOrigin: ORIGIN, staticUrls: [`${ORIGIN}/`], stateDirectory: directory, retryAfterSeconds: 17,
    now: () => Date.parse('2026-12-08T09:00:00.000Z'), loadStandardCards: async () => [],
    loadMetaReports: runtime.loadMetaReports,
    ...(options.fetchImpl ? { onSegmentPublished: createSitemapIndexNowHook('production', { origin: ORIGIN, fetchImpl: options.fetchImpl, log: () => undefined }) } : {}),
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    snapshots, directory, origin: `http://127.0.0.1:${address.port}`,
    async close(keepState = false) {
      await new Promise<void>(resolve => server.close(() => resolve()));
      if (keepState) return;
      snapshots.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
const listed = (xml: string) => sitemapEntries(xml, 'urlset', 'meta-reports').map(({ location, lastmod }) => [new URL(location).pathname, lastmod]);

test('three weeks: the reports the page indexes, each dated by its snapshot, and the archive; the early one stays out', async () => {
  const stand = await serve('weekly');
  try {
    const response = await fetch(`${stand.origin}/sitemaps/meta-reports.xml`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-sitemap-source'), 'catalog');
    assert.deepEqual(listed(await response.text()), [
      ['/reports/meta/2026-11-23/', '2026-11-23'], ['/reports/meta/2026-11-30/', '2026-11-30'], ['/reports/meta/', '2026-12-07'],
    ]);
    // The page's own decision on the same snapshots: the 7 December report follows a patch of 5 December (early data, noindex).
    const dates = stand.snapshots.list();
    assert.deepEqual(dates, ['2026-12-07', '2026-11-30', '2026-11-23']);
    const early = dates.filter(date => {
      const snapshot = stand.snapshots.get(date)!;
      const previous = stand.snapshots.get(dates[dates.indexOf(date) + 1] ?? '');
      return buildMetaReportView(snapshot, previous).earlyData;
    });
    assert.deepEqual(early, ['2026-12-07']);
    const index = await (await fetch(`${stand.origin}/sitemap.xml`)).text();
    assert.deepEqual(sitemapEntries(index, 'sitemapindex', 'index').map(({ location, lastmod }) => [new URL(location).pathname, lastmod]), [
      ['/sitemaps/static.xml', '2026-12-08'], ['/sitemaps/meta-reports.xml', '2026-12-07'],
    ]);
  } finally {
    await stand.close();
  }
});

test('one report: the report is listed, the archive is not', async () => {
  const stand = await serve('first');
  try {
    assert.deepEqual(listed(await (await fetch(`${stand.origin}/sitemaps/meta-reports.xml`)).text()), [['/reports/meta/2026-11-23/', '2026-11-23']]);
  } finally {
    await stand.close();
  }
});

test('a missed Monday leaves the older report with its own day; the archive follows the newest', async () => {
  const stand = await serve('gap');
  try {
    assert.deepEqual(listed(await (await fetch(`${stand.origin}/sitemaps/meta-reports.xml`)).text()), [
      ['/reports/meta/2026-11-23/', '2026-11-23'], ['/reports/meta/2026-12-07/', '2026-12-07'], ['/reports/meta/', '2026-12-07'],
    ]);
  } finally {
    await stand.close();
  }
});

test('the first report reaches IndexNow once after the first build, and not again after a restart', async () => {
  const sent: string[][] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).urlList);
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const first = await serve('first', { fetchImpl });
  try {
    await fetch(`${first.origin}/sitemaps/meta-reports.xml`);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(sent, [[`${ORIGIN}/reports/meta/2026-11-23/`]]);
    // The same state after a restart: the segment is rebuilt unchanged and nothing is announced.
    const restarted = await serve('first', { fetchImpl, restartOf: first });
    try {
      assert.equal((await fetch(`${restarted.origin}/sitemaps/meta-reports.xml`)).status, 200);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(sent.length, 1);
    } finally {
      await restarted.close(true);
    }
  } finally {
    await first.close();
  }
});

test('the projection refuses an archive of one report and an impossible date', () => {
  assert.throws(() => projectMetaReportSitemapCatalog([{ kind: 'archive', reports: 1, newestDate: '2026-11-23' }], ORIGIN), /not indexable/);
  assert.throws(() => projectMetaReportSitemapCatalog([{ kind: 'report', date: '2026-02-30' }], ORIGIN), /not indexable/);
});
