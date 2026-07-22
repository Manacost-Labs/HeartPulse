import assert from 'node:assert/strict';
import { DatasetContractError, datasetContractErrorMessage } from '../shared/datasetEnvelope.js';
import {
  parseStandardMetaApiResponse,
  parseStandardMetaEnvelope,
} from '../shared/standardMetaContract.js';
import {
  assertStandardMetaContinuity,
  createStandardMetaEnvelope,
  readStandardMetaPublication,
  resolveStandardMetaPublication,
  selectStandardMetaCandidate,
} from '../server/standardMetaDataset.js';

const sourceUpdatedAt = '2026-07-21T05:05:30.230Z';
const now = Date.parse('2026-07-21T10:00:00.000Z');

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    publicationMode: 'stable',
    publishedAt: sourceUpdatedAt,
    format: 'standard',
    formatLabel: 'Стандарт',
    rank: 'legend',
    rankLabel: 'Легенда',
    source: 'hsguru',
    sourceId: 'hsguru_meta_standard_legend',
    sourceUrl: 'https://www.hsguru.com/meta',
    translationSource: 'database',
    updatedAt: sourceUpdatedAt,
    items: Array.from({ length: 5 }, (_, index) => ({
      id: `deck-${index}`,
      archetype: `Deck ${index}`,
      archetypeLabel: `Колода ${index}`,
      translated: true,
      classKey: index % 2 ? 'shaman' : 'warrior',
      winrate: 55 - index,
      popularity: 20 - index,
      games: 1_000 - index * 100,
      turns: 8 + index / 10,
      durationMinutes: 7 + index / 10,
      climbingSpeed: 0.5 - index / 10,
    })),
    ...overrides,
  };
}

function legacyPayload(dataOverrides: Record<string, unknown> = {}) {
  return {
    state: 'ok',
    fetched_at: sourceUpdatedAt,
    data: {
      source_id: 'hsguru_meta_standard_legend',
      tables: [{ rows: [] }],
      ...dataOverrides,
    },
    runtime: { app: 'app', build_id: null, git_commit: null },
  };
}

function publicationControl(
  sourceOverrides: Record<string, unknown> = {},
  additionalSources: unknown[] = [],
) {
  return {
    policy: { effectiveMode: 'early' },
    sections: {
      standard: {
        sources: [{
          source_id: 'hsguru_meta_standard_legend',
          supports_early: false,
          published_fetched_at: sourceUpdatedAt,
          publication_channel: 'stable',
          ...sourceOverrides,
        }, ...additionalSources],
      },
    },
  };
}

const envelope = createStandardMetaEnvelope(candidate(), now);
assert.equal(envelope.schemaVersion, 1);
assert.equal(envelope.dataset, 'standard-meta');
assert.equal(envelope.mode, 'stable');
assert.equal(envelope.freshness, 'fresh');
assert.equal(envelope.partial, false);
assert.equal(envelope.quality.status, 'pass');
assert.equal(envelope.quality.sampleSize, 4_000);
assert.match(envelope.datasetVersion, /^sm1-[a-f0-9]{20}$/);
assert.deepEqual(parseStandardMetaEnvelope(envelope, now), envelope);
assert.deepEqual(readStandardMetaPublication({
  fetched_at: sourceUpdatedAt,
  publication: {
    schema_version: 1,
    source_id: 'hsguru_meta_standard_legend',
    mode: 'early',
    published_at: sourceUpdatedAt,
  },
}, 'hsguru_meta_standard_legend'), { mode: 'early', publishedAt: sourceUpdatedAt });
assert.deepEqual(
  readStandardMetaPublication(legacyPayload(), 'hsguru_meta_standard_legend', publicationControl()),
  { mode: 'stable', publishedAt: sourceUpdatedAt },
  'the real N-1 payload uses its exact per-source publication row, not the global early policy',
);
assert.deepEqual(
  readStandardMetaPublication(
    legacyPayload(),
    'hsguru_meta_standard_legend',
    publicationControl({ publication_channel: 'stable_baseline' }),
  ),
  { mode: 'stable', publishedAt: sourceUpdatedAt },
);
assert.deepEqual(
  readStandardMetaPublication(
    legacyPayload({ structured: { provisional: true } }),
    'hsguru_meta_standard_legend',
    publicationControl({ publication_channel: 'early', supports_early: true }),
  ),
  { mode: 'early', publishedAt: sourceUpdatedAt },
);
assert.throws(
  () => readStandardMetaPublication(legacyPayload(), 'hsguru_meta_standard_legend'),
  /exactly one publication row/,
);
assert.throws(
  () => readStandardMetaPublication(
    legacyPayload(),
    'hsguru_meta_standard_legend',
    publicationControl({ published_fetched_at: '2026-07-21T04:00:00.000Z' }),
  ),
  /timestamp does not match/,
);
assert.throws(
  () => readStandardMetaPublication(
    legacyPayload({ source_id: 'hsguru_meta_wild_legend' }),
    'hsguru_meta_standard_legend',
    publicationControl(),
  ),
  /payload source identity does not match/,
  'matching control timestamps must not hide a misrouted public dataset',
);
assert.throws(
  () => readStandardMetaPublication(
    legacyPayload(),
    'hsguru_meta_standard_legend',
    publicationControl({}, [{
      source_id: 'hsguru_meta_standard_legend',
      supports_early: false,
      published_fetched_at: sourceUpdatedAt,
      publication_channel: 'stable',
    }]),
  ),
  /exactly one publication row/,
);
for (const publication_channel of ['unavailable', 'future-channel']) {
  assert.throws(
    () => readStandardMetaPublication(
      legacyPayload(),
      'hsguru_meta_standard_legend',
      publicationControl({ publication_channel }),
    ),
    /channel .* is incompatible/,
  );
}
assert.throws(
  () => readStandardMetaPublication(
    legacyPayload({ structured: { provisional: true } }),
    'hsguru_meta_standard_legend',
    publicationControl({ publication_channel: 'stable' }),
  ),
  /channel stable is incompatible/,
);
assert.throws(
  () => readStandardMetaPublication(
    legacyPayload({ structured: { provisional: true } }),
    'hsguru_meta_standard_legend',
    publicationControl({ publication_channel: 'early', supports_early: false }),
  ),
  /channel early is incompatible/,
);
assert.throws(
  () => readStandardMetaPublication({
    fetched_at: sourceUpdatedAt,
    publication: null,
    data: { source_id: 'hsguru_meta_standard_legend' },
  }, 'hsguru_meta_standard_legend'),
  /publication provenance is malformed/,
  'a present malformed publication field must fail closed instead of taking the N-1 branch',
);
assert.throws(
  () => readStandardMetaPublication({
    fetched_at: sourceUpdatedAt,
    publication: {
      schema_version: 1,
      source_id: 'another-source',
      mode: 'stable',
      published_at: sourceUpdatedAt,
    },
  }, 'hsguru_meta_standard_legend'),
  /does not match the source/,
);
let legacyControlReads = 0;
assert.deepEqual(await resolveStandardMetaPublication(
  legacyPayload(),
  'hsguru_meta_standard_legend',
  async () => {
    legacyControlReads += 1;
    return publicationControl();
  },
), { mode: 'stable', publishedAt: sourceUpdatedAt });
assert.equal(legacyControlReads, 1, 'legacy resolution must read parser-control exactly once');
let modernControlReads = 0;
assert.deepEqual(await resolveStandardMetaPublication({
  fetched_at: sourceUpdatedAt,
  publication: {
    schema_version: 1,
    source_id: 'hsguru_meta_standard_legend',
    mode: 'stable',
    published_at: sourceUpdatedAt,
  },
}, 'hsguru_meta_standard_legend', async () => {
  modernControlReads += 1;
  return publicationControl();
}), { mode: 'stable', publishedAt: sourceUpdatedAt });
assert.equal(modernControlReads, 0, 'modern provenance must not call the legacy control endpoint');
await assert.rejects(
  () => resolveStandardMetaPublication(
    legacyPayload(),
    'hsguru_meta_standard_legend',
    async () => { throw new Error('control unavailable'); },
  ),
  /control unavailable/,
  'an unavailable control plane must never make the server guess a publication mode',
);
assert.equal(createStandardMetaEnvelope(candidate(), now).datasetVersion, envelope.datasetVersion);
assert.notEqual(
  createStandardMetaEnvelope(candidate({
    items: (candidate().items as any[]).map((item, index) => index === 0
      ? { ...item, archetypeLabel: 'Другой перевод' }
      : item),
  }), now).datasetVersion,
  envelope.datasetVersion,
  'a translation change must produce a new deterministic dataset version',
);

const legacy = parseStandardMetaApiResponse(envelope.data, now);
assert.equal(legacy.legacy, true);
assert.equal(legacy.envelope, null);
assert.equal(legacy.data.items.length, 5);
assert.equal(
  parseStandardMetaApiResponse(candidate({ rank: 'all', rankLabel: 'Все ранги', coin: 'any_player' }), now).data.coin,
  'any_player',
);
assert.throws(
  () => parseStandardMetaApiResponse(candidate({ coin: 'on_coin' }), now),
  /coin is unsupported/,
);
assert.throws(
  () => parseStandardMetaApiResponse(candidate({
    items: (candidate().items as any[]).map(item => ({ ...item, winrate: 97 })),
  }), now),
  /widespread extreme winrates/,
  'legacy compatibility must keep the same plausibility gate',
);
assert.throws(
  () => parseStandardMetaApiResponse({
    ...envelope,
    data: candidate({
      items: (candidate().items as any[]).map(item => ({ ...item, winrate: 97 })),
    }),
  }, now),
  /widespread extreme winrates/,
  'versioned envelopes must not bypass the plausibility gate',
);
assert.throws(
  () => parseStandardMetaEnvelope({ ...envelope, partial: true }, now),
  /quality assessment does not match/,
  'versioned envelope quality must be derived from its payload',
);

const unsupported = { ...envelope, schemaVersion: 2 };
assert.throws(
  () => parseStandardMetaApiResponse(unsupported, now),
  (error: unknown) => error instanceof DatasetContractError && error.code === 'UNSUPPORTED_SCHEMA_VERSION',
  'a present schemaVersion must never fall back to the legacy parser',
);
assert.match(datasetContractErrorMessage(new DatasetContractError('UNSUPPORTED_SCHEMA_VERSION', 'test')), /Обновите страницу/);

assert.throws(
  () => createStandardMetaEnvelope(candidate({ publicationMode: undefined }), now),
  /authoritative publicationMode/,
  'publication provenance must fail closed',
);
assert.throws(
  () => createStandardMetaEnvelope(candidate({
    items: (candidate().items as any[]).map((item, index) => index === 1
      ? { ...item, id: 'deck-0' }
      : item),
  }), now),
  /duplicate item id/,
);
assert.throws(
  () => createStandardMetaEnvelope(candidate({
    items: (candidate().items as any[]).map(item => ({ ...item, winrate: 100 })),
  }), now),
  /implausible exact winrate/,
);
assert.throws(
  () => createStandardMetaEnvelope(candidate({
    items: (candidate().items as any[]).map(item => ({ ...item, winrate: 97 })),
  }), now),
  /widespread extreme winrates/,
  'the historic 97% corruption pattern must be rejected',
);
assert.throws(
  () => createStandardMetaEnvelope(candidate({
    items: (candidate().items as any[]).map((item, index) => index === 0
      ? { ...item, popularity: 101 }
      : item),
  }), now),
  /outside 0\.\.100/,
);
assert.throws(
  () => createStandardMetaEnvelope(candidate({
    items: (candidate().items as any[]).map((item, index) => index === 0
      ? { ...item, games: -1 }
      : item),
  }), now),
  /non-negative integer/,
);

const early = createStandardMetaEnvelope(candidate({
  publicationMode: 'early',
  items: [(candidate().items as any[])[0]],
}), now);
assert.equal(early.mode, 'early');
assert.equal(early.partial, true);
assert.equal(early.quality.status, 'warning');
assert.match(early.quality.warnings[0], /Ранняя мета/);

const largeStable = createStandardMetaEnvelope(candidate({
  items: Array.from({ length: 12 }, (_, index) => ({
    ...(candidate().items as any[])[index % 5],
    id: `large-${index}`,
    archetype: `Large Deck ${index}`,
    archetypeLabel: `Большая колода ${index}`,
  })),
}), now);
assert.throws(
  () => assertStandardMetaContinuity(envelope, largeStable),
  /stable collection shrank unexpectedly \(12 -> 5\)/,
);
assert.doesNotThrow(() => assertStandardMetaContinuity(early, largeStable));

const corruptCandidate = candidate({
  items: (candidate().items as any[]).map(item => ({ ...item, winrate: 97 })),
});
const previousCandidate = candidate();
const selectedFallback = selectStandardMetaCandidate(corruptCandidate, previousCandidate, now);
assert.equal(selectedFallback.data, previousCandidate);
assert.notEqual(selectedFallback.rejectedError, null);
assert.equal(selectedFallback.envelope.datasetVersion, envelope.datasetVersion);
assert.throws(
  () => selectStandardMetaCandidate(corruptCandidate, null, now),
  /widespread extreme winrates/,
  'an invalid first candidate must fail closed when no last known good version exists',
);

assert.throws(
  () => createStandardMetaEnvelope(candidate({ publicationMode: 'early', items: [] }), now),
  /early snapshot has only 0 items/,
);
assert.throws(
  () => createStandardMetaEnvelope(candidate({
    items: Array.from({ length: 501 }, (_, index) => ({
      ...(candidate().items as any[])[index % 5],
      id: `oversized-${index}`,
      archetype: `Oversized Deck ${index}`,
      archetypeLabel: `Слишком большая колода ${index}`,
    })),
  }), now),
  /500-record safety limit/,
);
assert.throws(
  () => parseStandardMetaEnvelope({ ...early, partial: false }, now),
  /early mode requires partial data/,
);

console.log('standard meta versioned runtime contract tests passed');
