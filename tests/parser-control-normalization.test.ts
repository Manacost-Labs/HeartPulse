import assert from 'node:assert/strict';
import { normalizeParserControl, normalizeParserRuns } from '../src/features/adminParserControl/normalize.js';

const normalized = normalizeParserControl({
  revision: '7',
  generated_at: '2026-07-20T10:00:00Z',
  policy: {
    mode: 'early',
    effective_mode: 'stable',
    early_until: '2026-07-28T00:00:00Z',
    updated_by: 'admin@example.com',
  },
  warnings: [{ code: 'CACHE_INVALIDATION_FAILED', message: 'Настройка сохранена, кеш не очищен' }],
  sections: {
    arena: {
      label: 'Арена',
      enabled: true,
      status: 'healthy',
      sources: [
        {
          source_id: 'hsreplay_arena',
          label: 'HSReplay',
          supports_early: true,
          last_success_at: '2026-07-20T08:00:00Z',
          item_count: 731,
          health: 'warning',
          state: 'fetch_error',
          candidate_fetched_at: '2026-07-20T09:30:00Z',
          published_fetched_at: '2026-07-20T08:00:00Z',
          publication_channel: 'stable_baseline',
          stable_baseline_available: true,
          last_error: 'Источник вернул неполный снимок',
        },
      ],
    },
  },
});

assert.equal(normalized.revision, 7);
assert.equal(normalized.policy.mode, 'early');
assert.equal(normalized.policy.effectiveMode, 'stable');
assert.equal(normalized.policy.earlyUntil, '2026-07-28T00:00:00Z');
assert.equal(normalized.sections[0]?.id, 'arena');
assert.equal(normalized.sections[0]?.sources[0]?.supportsEarly, true);
assert.equal(normalized.sections[0]?.sources[0]?.itemCount, 731);
assert.equal(normalized.sections[0]?.sources[0]?.status, 'warning');
assert.equal(normalized.sections[0]?.sources[0]?.sourceState, 'fetch_error');
assert.equal(normalized.sections[0]?.sources[0]?.candidateFetchedAt, '2026-07-20T09:30:00Z');
assert.equal(normalized.sections[0]?.sources[0]?.publishedFetchedAt, '2026-07-20T08:00:00Z');
assert.equal(normalized.sections[0]?.sources[0]?.publicationChannel, 'stable_baseline');
assert.equal(normalized.sections[0]?.sources[0]?.stableBaselineAvailable, true);
assert.equal(normalized.sections[0]?.sources[0]?.lastError, 'Источник вернул неполный снимок');
assert.equal(normalized.warnings[0]?.code, 'CACHE_INVALIDATION_FAILED');
assert.equal(normalized.summary.failedSources, 0);
assert.equal(normalized.summary.earlyCapableSources, 1);

const safeEmpty = normalizeParserControl({ policy: { mode: 'unknown' }, sections: null });
assert.equal(safeEmpty.policy.mode, 'stable');
assert.deepEqual(safeEmpty.sections, []);

const runs = normalizeParserRuns({
  jobs: [{
    run_id: 'job-1',
    status: 'in_progress',
    requested_at: '2026-07-20T09:00:00Z',
    source_ids: ['one', 'two', 'three', 'four'],
    results: [
      { source_id: 'one', state: 'ok' },
      { source_id: 'two', state: 'ok', serving_cached_dataset: true },
    ],
  }],
});
assert.equal(runs[0]?.id, 'job-1');
assert.equal(runs[0]?.status, 'running');
assert.equal(runs[0]?.totalSources, 4);
assert.equal(runs[0]?.completedSources, 2);
assert.equal(runs[0]?.failedSources, 1);

console.log('parser control normalization tests passed');
