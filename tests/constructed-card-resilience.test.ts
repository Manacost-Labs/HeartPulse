import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import { encode } from '@firestone-hs/deckstrings';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConstructedCardCatalogStore } from '../server/constructedCardCatalogStore.js';
import { writeJsonAtomically } from '../server/durableJson.js';
import {
  ConstructedCardCatalogUnavailableError,
  ConstructedCardDetailUnavailableError,
  ConstructedCardUpstreamError,
  createConstructedCardDataService,
  createConstructedCardRouter,
} from '../server/constructedCardRoutes.js';

const baseCards = [
  {
    card_id: 'CARD_1', dbf: 1, name: { ru: 'Альфа', en: 'Alpha' }, card_set: 'CORE',
    card_type: { slug: 'MINION', name_ru: 'Существо' }, class: 'MAGE', multi_class: [], rarity: 'COMMON',
    mana_cost: 2, attack: 3, health: 4, mechanics: ['BATTLECRY'], referenced_tags: [],
    images: { card: 'https://cdn.example.test/CARD_1.png' },
  },
  {
    card_id: 'CARD_2', dbf: 2, name: { ru: 'Бета', en: 'Beta' }, card_set: 'CORE',
    card_type: { slug: 'SPELL', name_ru: 'Заклинание' }, class: 'MAGE', multi_class: [], rarity: 'RARE',
    mana_cost: 3, attack: null, health: null, mechanics: [], referenced_tags: [],
    images: { card: 'https://cdn.example.test/CARD_2.png' },
  },
];

type HarnessOptions = {
  directory: string;
  now: () => number;
  catalog?: (format: string, page: number) => Promise<any> | any;
  detail?: (cardId: string) => Promise<any> | any;
  stats?: () => Promise<any> | any;
  patches?: () => Promise<any> | any;
  decks?: (url: URL) => Promise<any> | any;
  cacheTtlMs?: number;
  negativeDetailCacheMaxEntries?: number;
  catalogStore?: ConstructedCardCatalogStore;
};

function serviceHarness(options: HarnessOptions) {
  const calls = { catalog: 0, detail: 0, stats: 0 };
  const service = createConstructedCardDataService({
    stateDirectory: options.directory,
    now: options.now,
    cacheTtlMs: options.cacheTtlMs ?? 1_000,
    negativeDetailCacheMaxEntries: options.negativeDetailCacheMaxEntries,
    catalogStore: options.catalogStore,
    maxCatalogStaleMs: 48 * 60 * 60_000,
    minimumCatalogCardsByFormat: { standard: 1, wild: 1 },
    fetchJson: async url => {
      const parsed = new URL(url);
      if (parsed.hostname === 'db.example.test' && parsed.pathname.endsWith('/constructed-cards')) {
        calls.catalog += 1;
        return options.catalog?.(String(parsed.searchParams.get('format')), Number(parsed.searchParams.get('page'))) ?? {
          data: baseCards,
          updated_at: '2026-07-21T07:55:00.000Z',
          pagination: { page: 1, total: baseCards.length, total_pages: 1 },
        };
      }
      if (parsed.hostname === 'db.example.test' && parsed.pathname.includes('/constructed-cards/')) {
        calls.detail += 1;
        const cardId = decodeURIComponent(parsed.pathname.split('/').pop() || '');
        return options.detail?.(cardId) ?? {
          data: { ...baseCards.find(card => card.card_id === cardId), wiki: { patch_changes: [] } },
        };
      }
      if (parsed.hostname === 'stats.example.test') {
        calls.stats += 1;
        return options.stats?.() ?? {
          fetched_at: new Date(options.now()).toISOString(),
          url: 'https://hsreplay.net/cards/',
          view: { cards: [{ id: 'CARD_1', dbfId: 1, deck_popularity: '12.5%', deck_winrate: '53%', times_played: 200 }] },
        };
      }
      if (parsed.hostname === 'patches.example.test') return options.patches?.();
      if (parsed.hostname === 'decks.example.test') return options.decks?.(parsed);
      throw new Error(`Unexpected URL ${url}`);
    },
    catalogBaseUrl: 'https://db.example.test/api/v1',
    statsDatasetByFormat: { standard: 'standard-cards', wild: 'wild-cards' },
    statsBaseUrl: 'https://stats.example.test',
    patchesUrl: options.patches ? 'https://patches.example.test/api/patches' : undefined,
    constructedDecksUrl: options.decks ? 'https://decks.example.test/v1/constructed/decks' : undefined,
  });
  return { service, calls };
}

async function startRouter(service: ReturnType<typeof createConstructedCardDataService>) {
  const adminGuard: RequestHandler = (_request, _response, next) => next();
  const app = express();
  app.use('/api', createConstructedCardRouter({
    ...service,
    adminGuard,
    canAccessStats: request => request.headers['x-test-stats'] === 'yes',
    setPrivateNoStore: response => response.set('Cache-Control', 'no-store'),
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    origin: `http://127.0.0.1:${address.port}/api/constructed-cards`,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

const directory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-resilience-'));
let now = Date.parse('2026-07-21T08:00:00.000Z');
try {
  const cold = serviceHarness({ directory, now: () => now });
  const coldResults = await Promise.all(Array.from({ length: 20 }, () => cold.service.loadCards('standard')));
  assert.equal(cold.calls.catalog, 1, '20 concurrent cold requests must share one catalog fanout');
  assert.ok(coldResults.every(result => result.datasetVersion === coldResults[0].datasetVersion));
  assert.ok(coldResults.every(result => result.cacheSource === 'fresh' && result.dataStatus === 'fresh'));
  assert.ok(coldResults.every(result => result.partial === false));

  const freshRouter = await startRouter(cold.service);
  try {
    const list = await fetch(`${freshRouter.origin}?format=standard&perPage=20`);
    assert.equal(list.status, 200);
    assert.equal(list.headers.get('x-data-cache'), 'fresh');
    assert.match(list.headers.get('x-dataset-version') || '', /^ccc1-sha256:/);
    assert.equal((await list.json() as any).partial, false);
  } finally {
    await freshRouter.close();
  }

  now += 1_001;
  const restartedOutage = serviceHarness({
    directory,
    now: () => now,
    catalog: () => { throw new ConstructedCardUpstreamError('catalog unavailable', 503); },
  });
  const lkg = await restartedOutage.service.loadCards('standard');
  assert.equal(lkg.cacheSource, 'LKG', 'a restart during an outage must recover the durable raw catalog');
  assert.equal(lkg.dataStatus, 'stale');
  assert.equal(lkg.partial, false);
  assert.deepEqual(restartedOutage.service.getCatalogHealth('standard'), {
    format: 'standard',
    state: 'stale',
    dataStatus: 'stale',
    cacheSource: 'LKG',
    verifiedAt: lkg.catalogVerifiedAt,
    publishedAt: lkg.catalogPublishedAt,
    records: baseCards.length,
    datasetVersion: lkg.datasetVersion,
    warning: null,
  }, 'an upstream outage must remain explicitly degraded even when the LKG was verified recently');

  const lkgRouter = await startRouter(restartedOutage.service);
  try {
    const list = await fetch(`${lkgRouter.origin}?format=standard&perPage=20`);
    assert.equal(list.status, 200);
    assert.equal(list.headers.get('x-data-cache'), 'LKG');
    assert.match(list.headers.get('warning') || '', /^110\b/);
    const body = await list.json() as any;
    assert.equal(body.dataStatus, 'stale');
    assert.equal(body.partial, false);
  } finally {
    await lkgRouter.close();
  }

  const mirrorFaultDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-service-mirror-fault-'));
  try {
    const mirrorFaultStore = new ConstructedCardCatalogStore({
      stateDirectory: mirrorFaultDirectory,
      now: () => now,
      minimumCardCountByFormat: { standard: 1, wild: 1 },
      writeJson: (dataDirectory, filename, document, mode) => {
        if (filename.endsWith('.lkg.json')) throw Object.assign(new Error('mirror unavailable'), { code: 'EACCES' });
        return writeJsonAtomically(dataDirectory, filename, document, mode);
      },
    });
    const mirrorFault = serviceHarness({
      directory: mirrorFaultDirectory,
      now: () => now,
      catalogStore: mirrorFaultStore,
    });
    const degradedCommit = await mirrorFault.service.loadCards('standard');
    assert.equal(degradedCommit.cacheSource, 'LKG');
    assert.equal(degradedCommit.dataStatus, 'stale');
    assert.match(degradedCommit.warning || '', /резервн/i);
    assert.equal(mirrorFault.service.getCatalogHealth('standard').state, 'stale');
    assert.match(mirrorFault.service.getCatalogHealth('standard').warning || '', /резервн|redundancy/i,
      'service health must expose the single-copy commit degradation');
  } finally {
    rmSync(mirrorFaultDirectory, { recursive: true, force: true });
  }

  const statsFailureDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-stats-'));
  try {
    const statsFailure = serviceHarness({
      directory: statsFailureDirectory,
      now: () => now,
      stats: () => { throw new ConstructedCardUpstreamError('stats unavailable', 503); },
    });
    const catalogOnly = await statsFailure.service.loadCards('standard');
    assert.equal(catalogOnly.dataStatus, 'fresh');
    assert.ok(catalogOnly.cards.every(card => card.stats === null),
      'a stats outage must show the raw catalog without hidden stale statistics');
    assert.ok(catalogOnly.warning);
    const detailWithMissingStats = await statsFailure.service.loadCardDetail('standard', 'CARD_1');
    assert.equal(detailWithMissingStats?.card.stats, null);
    assert.match(detailWithMissingStats?.warning || '', /Статистика карт временно недоступна/,
      'a successful detail response must propagate the current statistics outage warning');
  } finally {
    rmSync(statsFailureDirectory, { recursive: true, force: true });
  }

  const detailDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-detail-'));
  try {
    let detailMode: 'ok' | 'not-found' | 'transport' | 'rate-limit' | 'unavailable' | 'invalid' = 'unavailable';
    let statsPopularity = '12.5%';
    const details = serviceHarness({
      directory: detailDirectory,
      now: () => now,
      cacheTtlMs: 1_000,
      stats: () => ({
        fetched_at: new Date(now).toISOString(),
        view: { cards: [{ id: 'CARD_1', dbfId: 1, deck_popularity: statsPopularity, deck_winrate: '53%', times_played: 200 }] },
      }),
      detail: cardId => {
        if (detailMode === 'not-found') throw new ConstructedCardUpstreamError('not found', 404);
        if (detailMode === 'transport') throw new Error('socket reset');
        if (detailMode === 'rate-limit') throw new ConstructedCardUpstreamError('rate limited', 429);
        if (detailMode === 'unavailable') throw new ConstructedCardUpstreamError('unavailable', 503);
        if (detailMode === 'invalid') return { data: { card_id: 'WRONG_CARD' } };
        return { data: { ...baseCards.find(card => card.card_id === cardId), wiki: { marker: 'enriched-detail' } } };
      },
    });

    const synthesized = await details.service.loadCardDetail('standard', 'CARD_1');
    assert.equal(synthesized?.partial, true);
    assert.equal(synthesized?.card.name.ru, 'Альфа');
    assert.equal(synthesized?.card.stats.deckPopularity, 12.5);

    detailMode = 'ok';
    details.service.invalidate?.();
    const rich = await details.service.loadCardDetail('standard', 'CARD_1');
    assert.equal(rich?.partial, false);
    assert.equal(rich?.card.wiki.marker, 'enriched-detail');

    now += 1_001;
    statsPopularity = '7.5%';
    detailMode = 'unavailable';
    const staleRich = await details.service.loadCardDetail('standard', 'CARD_1');
    assert.equal(staleRich?.partial, true);
    assert.equal(staleRich?.dataStatus, 'stale');
    assert.equal(staleRich?.card.wiki.marker, 'enriched-detail');
    assert.equal(staleRich?.card.stats.deckPopularity, 7.5,
      'stale enriched content must only receive statistics from the current stats response');

    detailMode = 'not-found';
    details.service.invalidate?.();
    const known404 = await details.service.loadCardDetail('standard', 'CARD_1');
    assert.equal(known404?.partial, true,
      'catalog membership must win over an inconsistent upstream detail 404');
    assert.equal(known404?.card.card_id, 'CARD_1');

    detailMode = 'invalid';
    details.service.invalidate?.();
    const knownInvalid = await details.service.loadCardDetail('standard', 'CARD_1');
    assert.equal(knownInvalid?.partial, true,
      'an invalid upstream detail document must synthesize the known base card');

    detailMode = 'not-found';
    details.service.invalidate?.();
    const beforeUnknownCalls = details.calls.detail;
    const unknownResults = await Promise.all(Array.from({ length: 20 }, () => details.service.loadCardDetail('standard', 'UNKNOWN_CARD')));
    assert.ok(unknownResults.every(result => result === null));
    assert.equal(details.calls.detail, beforeUnknownCalls + 1,
      '20 concurrent requests for the same absent card must share one upstream detail job');
    const unknownCalls = details.calls.detail;
    assert.equal(await details.service.loadCardDetail('standard', 'UNKNOWN_CARD'), null);
    assert.equal(details.calls.detail, unknownCalls, 'a confirmed absent card must use the 60-second negative cache');

    for (const [mode, cardId] of [
      ['transport', 'UNKNOWN_TRANSPORT'],
      ['rate-limit', 'UNKNOWN_RATE_LIMIT'],
      ['unavailable', 'UNKNOWN_UPSTREAM_5XX'],
      ['invalid', 'UNKNOWN_INVALID_PAYLOAD'],
    ] as const) {
      detailMode = mode;
      details.service.invalidate?.();
      await assert.rejects(
        details.service.loadCardDetail('standard', cardId),
        ConstructedCardDetailUnavailableError,
        `${mode} for an ID absent from the catalog is unconfirmed and must be retryable, not a false 404`,
      );
    }

    detailMode = 'unavailable';
    details.service.invalidate?.();
    const route = await startRouter(details.service);
    try {
      const unknownUnavailable = await fetch(`${route.origin}/UNKNOWN_ROUTE?format=standard`);
      assert.equal(unknownUnavailable.status, 503);
      assert.equal(unknownUnavailable.headers.get('retry-after'), '60');
      const partial = await fetch(`${route.origin}/CARD_1?format=standard`);
      assert.equal(partial.status, 200);
      const anonymous = await partial.json() as any;
      assert.equal(anonymous.partial, true);
      assert.equal(anonymous.card.stats, null, 'entitlement redaction must run after partial fallback composition');
      assert.equal(partial.headers.get('x-data-cache'), 'LKG');
    } finally {
      await route.close();
    }
  } finally {
    rmSync(detailDirectory, { recursive: true, force: true });
  }

  const boundedNegativeDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-negative-cache-'));
  try {
    let negativeNow = now;
    const boundedNegative = serviceHarness({
      directory: boundedNegativeDirectory,
      now: () => negativeNow,
      negativeDetailCacheMaxEntries: 3,
      detail: () => { throw new ConstructedCardUpstreamError('not found', 404); },
    });
    for (const cardId of ['UNKNOWN_A', 'UNKNOWN_B', 'UNKNOWN_C', 'UNKNOWN_D']) {
      assert.equal(await boundedNegative.service.loadCardDetail('standard', cardId), null);
    }
    const afterFourUnique = boundedNegative.calls.detail;
    assert.equal(await boundedNegative.service.loadCardDetail('standard', 'UNKNOWN_B'), null);
    assert.equal(boundedNegative.calls.detail, afterFourUnique, 'recent negative entries inside the bound remain cached');
    assert.equal(await boundedNegative.service.loadCardDetail('standard', 'UNKNOWN_A'), null);
    assert.equal(boundedNegative.calls.detail, afterFourUnique + 1,
      'the oldest entry must be pruned when unique unknown IDs exceed the bounded cache');
    negativeNow += 60_001;
    assert.equal(await boundedNegative.service.loadCardDetail('standard', 'UNKNOWN_B'), null);
    assert.equal(boundedNegative.calls.detail, afterFourUnique + 2,
      'expired negative entries must be pruned and confirmed again upstream');
  } finally {
    rmSync(boundedNegativeDirectory, { recursive: true, force: true });
  }

  const detailSourceDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-detail-sources-'));
  try {
    let sourceNow = now;
    let sourcesAvailable = true;
    const sourceAware = serviceHarness({
      directory: detailSourceDirectory,
      now: () => sourceNow,
      cacheTtlMs: 1_000,
      detail: cardId => ({
        data: {
          ...baseCards.find(card => card.card_id === cardId),
          wiki: {
            patch_changes: [{
              entries: [{ date: '2024-09-10', patch: 'Patch 30.4.0.206605', items: ['Changed'] }],
            }],
          },
        },
      }),
      patches: () => {
        if (!sourcesAvailable) throw new ConstructedCardUpstreamError('patches unavailable', 503);
        return {
          patches: [{
            version: '30.4.0.206605',
            title: 'Русское описание патча',
            source_url: 'https://hs-manacost.ru/patch-30-4/',
          }],
        };
      },
      decks: () => {
        if (!sourcesAvailable) throw new ConstructedCardUpstreamError('decks unavailable', 503);
        return { data: [], meta: { count: 0 } };
      },
    });
    const enriched = await sourceAware.service.loadCardDetail('standard', 'CARD_1');
    assert.equal(enriched?.partial, false, 'a successful empty deck source is complete, not an outage');
    assert.equal(enriched?.card.wiki.patch_changes[0].entries[0].manacost_title, 'Русское описание патча');

    sourceNow += 1_001;
    sourcesAvailable = false;
    const degradedSources = await sourceAware.service.loadCardDetail('standard', 'CARD_1');
    assert.equal(degradedSources?.partial, true,
      'a deck/patch source outage must not be cached or labelled as a complete fresh detail');
    assert.equal(degradedSources?.dataStatus, 'stale');
    assert.match(degradedSources?.warning || '', /колод|патч/i);
    assert.equal(degradedSources?.card.wiki.patch_changes[0].entries[0].manacost_title, 'Русское описание патча',
      'an expired good enriched detail must survive a secondary-source outage');
  } finally {
    rmSync(detailSourceDirectory, { recursive: true, force: true });
  }

  const deckPaginationDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-deck-pagination-'));
  try {
    let deckNow = now;
    let deckPageMode: 'valid' | 'duplicate-offset' = 'valid';
    const deckCode = encode({
      format: 2,
      heroes: [637],
      cards: Array.from({ length: 30 }, (_, index) => [index + 1, 1] as [number, number]),
    });
    const rows = Array.from({ length: 250 }, (_, index) => ({
      id: `deck-${index + 1}`,
      archetype: 'Test Mage',
      class: 'Mage',
      format: 'Standard',
      deck_code: deckCode,
      updated_at: '2026-07-21T08:00:00.000Z',
    }));
    const pagedDecks = serviceHarness({
      directory: deckPaginationDirectory,
      now: () => deckNow,
      cacheTtlMs: 1_000,
      decks: url => {
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const data = offset === 0
          ? rows.slice(0, 200)
          : deckPageMode === 'duplicate-offset' ? rows.slice(0, 200) : rows.slice(offset, offset + 200);
        return { data, meta: { count: rows.length, limit: 200, offset } };
      },
    });
    const completeDeckDetail = await pagedDecks.service.loadCardDetail('standard', 'CARD_1');
    assert.equal(completeDeckDetail?.partial, false);
    assert.equal(completeDeckDetail?.card.decks.length, 1);

    deckNow += 1_001;
    deckPageMode = 'duplicate-offset';
    const duplicatePageDetail = await pagedDecks.service.loadCardDetail('standard', 'CARD_1');
    assert.equal(duplicatePageDetail?.partial, true,
      'an oversized duplicate offset page must degrade detail instead of being cached as a complete deck source');
    assert.equal(duplicatePageDetail?.dataStatus, 'stale');
    assert.match(duplicatePageDetail?.warning || '', /Колоды с этой картой временно недоступны/);
    assert.equal(duplicatePageDetail?.card.decks.length, 1,
      'a malformed refresh must retain the bounded previous deck enrichment');
  } finally {
    rmSync(deckPaginationDirectory, { recursive: true, force: true });
  }

  const missingPageDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-missing-page-'));
  try {
    const missingPage = serviceHarness({
      directory: missingPageDirectory,
      now: () => now,
      catalog: (_format, page) => {
        if (page === 2) throw new ConstructedCardUpstreamError('page missing', 503);
        return { data: [baseCards[0]], pagination: { page: 1, total: 2, total_pages: 2 } };
      },
    });
    await assert.rejects(missingPage.service.loadCards('wild'), ConstructedCardCatalogUnavailableError);
    const route = await startRouter(missingPage.service);
    try {
      const unavailable = await fetch(`${route.origin}?format=wild`);
      assert.equal(unavailable.status, 503);
      assert.equal(unavailable.headers.get('retry-after'), '60');
      assert.equal(unavailable.headers.get('cache-control'), 'no-store');
    } finally {
      await route.close();
    }
  } finally {
    rmSync(missingPageDirectory, { recursive: true, force: true });
  }

  const multiPageDirectory = mkdtempSync(join(tmpdir(), 'arena-constructed-card-pages-'));
  try {
    const pagedCards = Array.from({ length: 6 }, (_, index) => ({
      ...baseCards[index % baseCards.length],
      card_id: `PAGE_CARD_${index + 1}`,
      dbf: 100 + index,
    }));
    const multiPage = serviceHarness({
      directory: multiPageDirectory,
      now: () => now,
      catalog: (_format, page) => ({
        data: pagedCards.slice((page - 1) * 2, page * 2),
        pagination: { page, total: pagedCards.length, total_pages: 3 },
      }),
    });
    const results = await Promise.all(Array.from({ length: 20 }, () => multiPage.service.loadCards('standard')));
    assert.equal(multiPage.calls.catalog, 3,
      '20 concurrent cold callers must cause one complete three-page fanout');
    assert.equal(multiPage.service.getCatalogHealth('standard').records, pagedCards.length,
      'the durable raw catalog must contain every page exactly once');
    assert.ok(results.every(result => pagedCards.every(card => result.cards.some(item => item.card_id === card.card_id))));
  } finally {
    rmSync(multiPageDirectory, { recursive: true, force: true });
  }

  for (const [label, catalog] of [
    ['duplicate-across-pages', (_format: string, page: number) => ({
      data: page === 1 ? [baseCards[0]] : [baseCards[0]],
      pagination: { page, total: 2, total_pages: 2 },
    })],
    ['inconsistent-page-total', (_format: string, page: number) => ({
      data: page === 1 ? [baseCards[0]] : [baseCards[1]],
      pagination: { page, total: page === 1 ? 2 : 3, total_pages: 2 },
    })],
    ['wrong-format-envelope', (_format: string, _page: number) => ({
      format: 'wild',
      data: baseCards,
      pagination: { page: 1, total: baseCards.length, total_pages: 1 },
    })],
  ] as const) {
    const invalidDirectory = mkdtempSync(join(tmpdir(), `arena-constructed-card-${label}-`));
    try {
      const invalid = serviceHarness({ directory: invalidDirectory, now: () => now, catalog });
      await assert.rejects(invalid.service.loadCards('standard'), ConstructedCardCatalogUnavailableError,
        `${label} must not seed a cold LKG`);
    } finally {
      rmSync(invalidDirectory, { recursive: true, force: true });
    }
  }

  for (const missingField of ['page', 'total', 'total_pages'] as const) {
    const invalidDirectory = mkdtempSync(join(tmpdir(), `arena-constructed-card-missing-${missingField}-`));
    try {
      const invalid = serviceHarness({
        directory: invalidDirectory,
        now: () => now,
        catalog: (_format, page) => {
          const pagination: Record<string, number> = { page, total: 2, total_pages: 2 };
          if (page === 2) delete pagination[missingField];
          return {
            data: [baseCards[page - 1]],
            pagination,
          };
        },
      });
      await assert.rejects(invalid.service.loadCards('standard'), ConstructedCardCatalogUnavailableError,
        `a later page without explicit pagination.${missingField} must not seed the LKG`);
    } finally {
      rmSync(invalidDirectory, { recursive: true, force: true });
    }
  }

  now = Date.parse('2026-07-21T08:00:00.000Z') + 48 * 60 * 60_000 + 2_000;
  const expired = serviceHarness({
    directory,
    now: () => now,
    catalog: () => { throw new ConstructedCardUpstreamError('catalog unavailable', 503); },
  });
  await assert.rejects(expired.service.loadCards('standard'), ConstructedCardCatalogUnavailableError,
    'an LKG older than 48 hours must fail closed');
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log('constructed-card catalog/detail resilience contracts passed');
