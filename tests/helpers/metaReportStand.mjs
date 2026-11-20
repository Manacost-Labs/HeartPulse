import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { startNextServer } from '../../scripts/lib/next-server.mjs';
import { createMetaReportRouter } from '../../server/modules/metaReport/public.ts';
import { ARCHETYPE_CATALOG, recordMetaReportWeeks } from './metaReportFixture.ts';

/** Values the report answer is given on top of the stored snapshot, as if Express leaked them; none may reach a page. */
export const LEAKED = ['SENTINEL_REPORT_DECK', 'SENTINEL_REPORT_LEGEND', '88.8808', 'SENTINEL_REPORT_HERO'];

/** Adds paid-looking fields to every snapshot answer: the page must copy only the fields it prints. */
function leak(snapshot) {
  const { standard, battlegrounds } = snapshot.sections;
  return {
    ...snapshot,
    narrowRanks: { legend: 'SENTINEL_REPORT_LEGEND' },
    sections: {
      ...snapshot.sections,
      standard: { ...standard, data: { ...standard.data, items: standard.data.items.map(item => ({ ...item, turns: 88.8808, deckCode: 'SENTINEL_REPORT_DECK' })) } },
      battlegrounds: battlegrounds.data
        ? { ...battlegrounds, data: { ...battlegrounds.data, heroes: battlegrounds.data.heroes.map(hero => ({ ...hero, offerRate: 'SENTINEL_REPORT_HERO' })) } }
        : battlegrounds,
    },
  };
}

/**
 * Next.js in front of an Express with the real report routes over the three recorded weeks
 * of a fixture scenario (`empty: true`: an archive without reports) and the open archetype catalog.
 */
export async function startMetaReportStand({ empty = false, scenario = 'weekly' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'meta-report-next-'));
  const snapshots = empty ? null : await recordMetaReportWeeks(directory, scenario);
  const app = express();
  app.get('/api/auth/me', (_request, response) => response.json({ user: null }));
  app.get('/api/constructed-archetypes/teaser', (request, response) => (request.query.format === 'standard'
    ? response.json(ARCHETYPE_CATALOG) : response.status(503).json({ error: 'no data' })));
  app.use('/api', createMetaReportRouter({
    list: () => snapshots?.list() ?? [],
    get: date => {
      const snapshot = snapshots?.get(date) ?? null;
      return snapshot ? leak(snapshot) : null;
    },
  }));
  const legacy = app.listen(0, '127.0.0.1');
  await once(legacy, 'listening');
  let next;
  try {
    next = await startNextServer({ legacyOrigin: `http://127.0.0.1:${legacy.address().port}` });
  } catch (error) {
    legacy.close();
    throw error;
  }
  return {
    origin: next.origin,
    async close() {
      await next.close();
      legacy.closeAllConnections();
      legacy.close();
      snapshots?.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
