import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConstructedCardUpstreamError,
  createConstructedCardDataService,
} from '../server/constructedCardRoutes.js';

const cards = [1, 2, 3].map(dbf => ({
  card_id: `CARD_${dbf}`, dbf, name: { ru: `Карта ${dbf}`, en: `Card ${dbf}` }, card_set: 'BE',
  card_type: { slug: 'MINION', name_ru: 'Существо' }, class: 'MAGE', multi_class: [], rarity: 'COMMON',
  mana_cost: dbf, attack: 1, health: 1, mechanics: [], referenced_tags: [],
  images: { card: `https://cdn.example.test/CARD_${dbf}.png` },
}));

type PageFault = (page: number, attempt: number) => Error | null;

function harness(directory: string, now: () => number, fault: PageFault) {
  const attempts = new Map<number, number>();
  const catalogErrors: Array<{ format: string; message: string }> = [];
  const service = createConstructedCardDataService({
    stateDirectory: directory,
    now,
    cacheTtlMs: 1_000,
    maxCatalogStaleMs: 48 * 60 * 60_000,
    minimumCatalogCardsByFormat: { standard: 1, wild: 1 },
    onCatalogError: (format, error) => {
      catalogErrors.push({ format, message: error instanceof Error ? error.message : String(error) });
    },
    fetchJson: async url => {
      const parsed = new URL(url);
      if (parsed.hostname === 'db.example.test') {
        const page = Number(parsed.searchParams.get('page'));
        const attempt = (attempts.get(page) ?? 0) + 1;
        attempts.set(page, attempt);
        const error = fault(page, attempt);
        if (error) throw error;
        return {
          data: [cards[page - 1]],
          pagination: { page, total: cards.length, total_pages: cards.length },
        };
      }
      return {
        fetched_at: new Date(now()).toISOString(),
        view: { cards: [{ id: 'CARD_1', dbfId: 1, deck_popularity: '12.5%', deck_winrate: '53%', times_played: 200 }] },
      };
    },
    catalogBaseUrl: 'https://db.example.test/api/v1',
    statsDatasetByFormat: { standard: 'standard-cards', wild: 'wild-cards' },
    statsBaseUrl: 'https://stats.example.test',
  });
  return { service, attempts, catalogErrors };
}

const timeout = () => new ConstructedCardUpstreamError('Constructed card upstream transport failed');
const directory = mkdtempSync(join(tmpdir(), 'arena-constructed-catalog-retry-'));
try {
  let now = Date.parse('2026-10-20T16:00:00.000Z');

  const seeded = harness(directory, () => now, () => null);
  assert.equal((await seeded.service.loadCards('standard')).dataStatus, 'fresh');

  // Kolodahs answers single pages in 5-8 s while its sync rewrites the
  // catalog. One slow page must not demote a verified catalog to LKG.
  now += 1_001;
  const transient = harness(directory, () => now, (page, attempt) => page === 2 && attempt === 1 ? timeout() : null);
  const recovered = await transient.service.loadCards('standard');
  assert.equal(recovered.dataStatus, 'fresh', 'a single transient page failure must be retried');
  assert.equal(recovered.cacheSource, 'fresh');
  assert.equal(recovered.warning, null, 'a recovered refresh must not show the stale-library banner');
  assert.equal(recovered.cards.length, cards.length);
  assert.equal(transient.attempts.get(2), 2);
  assert.deepEqual(transient.catalogErrors, []);

  now += 1_001;
  const upstream5xx = harness(directory, () => now, (page, attempt) => page === 3 && attempt === 1
    ? new ConstructedCardUpstreamError('Constructed card upstream returned HTTP 502', 502)
    : null);
  assert.equal((await upstream5xx.service.loadCards('standard')).dataStatus, 'fresh',
    'a single upstream 5xx page must be retried');

  // A persistent outage must still be explicit and must now be visible in logs.
  now += 1_001;
  const outage = harness(directory, () => now, page => page === 2 ? timeout() : null);
  const degraded = await outage.service.loadCards('standard');
  assert.equal(degraded.dataStatus, 'stale');
  assert.equal(degraded.cacheSource, 'LKG');
  assert.match(degraded.warning || '', /последняя сохранённая версия/);
  assert.equal(outage.attempts.get(2), 2, 'a failing page is retried exactly once');
  assert.equal(outage.catalogErrors.length, 1);
  assert.equal(outage.catalogErrors[0].format, 'standard');
  assert.match(outage.catalogErrors[0].message, /transport failed/);

  // Client errors are deterministic; retrying them only delays the fallback.
  now += 1_001;
  const notFound = harness(directory, () => now, page => page === 2
    ? new ConstructedCardUpstreamError('Constructed card upstream returned HTTP 404', 404)
    : null);
  assert.equal((await notFound.service.loadCards('standard')).dataStatus, 'stale');
  assert.equal(notFound.attempts.get(2), 1, 'a 4xx page must not be retried');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
