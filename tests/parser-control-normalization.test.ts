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
  schedule_inventory: {
    inventory_version: '2026-07-21.1',
    generated_at: '2026-07-20T10:00:00Z',
    time_semantics: 'nominal',
    runtime_timer_state_included: false,
    schedules: [{
      schedule_id: 'post-patch-five-hour',
      label: 'После балансного патча',
      is_active: true,
      systemd_unit: 'hs-data-api-docker-refresh-post-patch-tierlists.timer',
      on_calendar: ['каждые 5 часов', 'до конца 27 июля'],
      timezone: 'UTC',
      next_run_at: '2026-07-20T15:00:00Z',
      valid_until: '2026-07-27T23:59:59Z',
      section_ids: ['arena'],
      source_ids: ['hsreplay_arena'],
    }],
  },
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
assert.equal(normalized.schedules[0]?.id, 'post-patch-five-hour');
assert.equal(normalized.schedules[0]?.enabled, true);
assert.equal(normalized.schedules[0]?.trigger, '');
assert.deepEqual(normalized.schedules[0]?.calendarEntries, ['каждые 5 часов', 'до конца 27 июля']);
assert.equal(normalized.schedules[0]?.systemdUnit, 'hs-data-api-docker-refresh-post-patch-tierlists.timer');
assert.equal(normalized.schedules[0]?.temporaryUntil, '2026-07-27T23:59:59Z');
assert.deepEqual(normalized.schedules[0]?.sectionIds, ['arena']);
assert.equal(normalized.schedulesGeneratedAt, '2026-07-20T10:00:00Z');
assert.equal(normalized.scheduleInventoryVersion, '2026-07-21.1');
assert.equal(normalized.scheduleTimeSemantics, 'nominal');
assert.equal(normalized.scheduleRuntimeStateIncluded, false);
assert.equal(normalized.summary.failedSources, 0);
assert.equal(normalized.summary.earlyCapableSources, 1);

const safeEmpty = normalizeParserControl({ policy: { mode: 'unknown' }, sections: null });
assert.equal(safeEmpty.policy.mode, 'stable');
assert.deepEqual(safeEmpty.sections, []);
assert.deepEqual(safeEmpty.schedules, []);

const runs = normalizeParserRuns({
  jobs: [{
    run_id: 'job-1',
    status: 'in_progress',
    requested_at: '2026-07-20T09:00:00Z',
    source_ids: ['one', 'two', 'three', 'four'],
    requested_source_ids: ['one', 'two', 'three', 'four', 'already-running'],
    deduplicated_source_ids: ['already-running'],
    results: [
      { source_id: 'one', state: 'ok', rows_total: 120, duration_ms: 850 },
      {
        source_id: 'two',
        state: 'ok',
        serving_cached_dataset: true,
        error: 'Показан прошлый снимок',
        rows_total: null,
        duration_ms: '',
        errors: ['Ошибка 1'],
        errors_total: 75,
        errors_truncated: true,
      },
    ],
  }],
});
assert.equal(runs[0]?.id, 'job-1');
assert.equal(runs[0]?.status, 'running');
assert.equal(runs[0]?.totalSources, 4);
assert.equal(runs[0]?.completedSources, 2);
assert.equal(runs[0]?.failedSources, 1);
assert.equal(runs[0]?.deduplicated, true);
assert.deepEqual(runs[0]?.deduplicatedSourceIds, ['already-running']);
assert.equal(runs[0]?.results[0]?.sourceId, 'one');
assert.equal(runs[0]?.results[0]?.rowsTotal, 120);
assert.equal(runs[0]?.results[1]?.status, 'warning');
assert.equal(runs[0]?.results[1]?.message, 'Показан прошлый снимок');
assert.equal(runs[0]?.results[1]?.rowsTotal, null);
assert.equal(runs[0]?.results[1]?.durationMs, null);
assert.deepEqual(runs[0]?.results[1]?.errors, ['Ошибка 1']);
assert.equal(runs[0]?.results[1]?.errorsTotal, 75);
assert.equal(runs[0]?.results[1]?.errorsTruncated, true);

console.log('parser control normalization tests passed');
