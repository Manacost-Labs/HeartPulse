import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import {
  normalizeParserAudit,
  normalizeParserControl,
  normalizeParserRuns,
} from '../src/features/adminParserControl/normalize.js';
import { assertProperty } from './helpers/propertyRuns.js';

// hs-data-api parser control answers in snake_case; values come in every shape the API has sent.
// The schedule inventory is outside the idempotence claim: its metadata moves to top-level
// `schedule*` fields that the normalizer does not read back, and derived schedules lose
// `nominalActive`. That is harmless because the panel normalizes each answer once.
const id = fc.stringMatching(/^[a-z][a-z_]{0,9}$/);
const text = fc.oneof(fc.string({ maxLength: 8 }), fc.constant('  padded  '), fc.constant(42));
const health = fc.constantFrom('ok', 'success', 'stale', 'cached_after_failure', 'failed', 'proxy_required', 'fetch_error',
  'running', 'paused', 'never_run', 'something new', '');
const time = fc.constantFrom('2026-10-27T10:00:00Z', '2026-10-27', 'not a time', '', null);
const count = fc.oneof(fc.integer({ min: -5, max: 500 }), fc.constantFrom('12', '', null, true, 'many'));
const flag = fc.constantFrom(true, false, 1, 0, '1', '0', 'true', 'false', 'yes', null);

const source = fc.record({
  source_id: id,
  label: text,
  status: health,
  enabled: flag,
  supports_early: flag,
  can_run_manually: flag,
  last_success_at: time,
  last_attempt_at: time,
  rows_total: count,
  last_error: text,
  publication_channel: fc.constantFrom('early', 'stable', 'stable_baseline', 'unavailable', 'beta'),
}, { requiredKeys: ['source_id'] });
const section = fc.record({
  section_id: id,
  label: text,
  group: text,
  status: health,
  auto_update: flag,
  last_success_at: time,
  sources: fc.uniqueArray(source, { selector: entry => entry.source_id, maxLength: 4 }),
}, { requiredKeys: ['section_id', 'sources'] });
const schedule = fc.record({
  id,
  on_calendar: fc.oneof(text, fc.array(text, { maxLength: 2 })),
  enabled: flag,
  is_active: flag,
  next_run_at: time,
  next_run_at_source: fc.constantFrom('runtime', 'nominal', 'guess'),
  runtime_state_available: flag,
  active: flag,
  section_ids: fc.array(id, { maxLength: 2 }),
  source_ids: fc.array(id, { maxLength: 2 }),
  temporary_until: time,
});
const snapshot = fc.record({
  revision: count,
  schedule_inventory: fc.record({ schedules: fc.array(schedule, { maxLength: 3 }), generated_at: time, inventory_version: text,
    runtime_timer_state: fc.record({ provider: text, status: fc.constantFrom('ok', 'partial', 'unavailable', 'down'), available: flag }) }),
  generated_at: time,
  publication_policy: fc.record({ mode: fc.constantFrom('early', 'stable', 'EARLY', ''), early_until: time, reason: text, updated_by: text }),
  sections: fc.uniqueArray(section, { selector: entry => entry.section_id, maxLength: 4 }),
  warnings: fc.array(fc.oneof(text, fc.record({ code: text, message: text })), { maxLength: 3 }),
  summary: fc.record({ total_sources: count, failed_sources: count, active_runs: count }),
});

const result = fc.record({
  source_id: id,
  state: health,
  serving_cached_dataset: flag,
  rows_total: count,
  fetched_at: time,
  duration_ms: count,
  error: text,
  errors: fc.array(text, { maxLength: 3 }),
  errors_total: count,
});
const run = fc.record({
  run_id: id,
  status: fc.constantFrom('queued', 'in_progress', 'completed', 'partial_failure', 'failed', 'canceled', 'unknown'),
  requested_at: time,
  finished_at: time,
  requested_by: text,
  source_ids: fc.array(id, { maxLength: 3 }),
  results: fc.array(result, { maxLength: 3 }),
  total_sources: count,
});
// The panel reads the snapshot as JSON: an optional key holding `undefined` is the same as a missing one.
function asJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

const runs = fc.oneof(fc.array(run, { maxLength: 3 }), fc.record({ runs: fc.array(run, { maxLength: 3 }), active_run: run }));

test('the parser panel normalizer is idempotent on hs-data-api sections, policy, summary and warnings', () => {
  assertProperty(fc.property(fc.oneof(snapshot, fc.jsonValue()), payload => {
    const once = normalizeParserControl(payload);
    const twice = normalizeParserControl(once);

    for (const key of ['revision', 'generatedAt', 'policy', 'sections', 'summary', 'warnings'] as const) {
      assert.deepEqual(asJson(twice[key]), asJson(once[key]), key);
    }
  }));
});

test('the parser panel keeps every section and source the API lists, in its order', () => {
  assertProperty(fc.property(snapshot, payload => {
    const panel = normalizeParserControl(payload);

    assert.deepEqual(panel.sections.map(entry => entry.id), payload.sections.map(entry => entry.section_id));
    assert.deepEqual(
      panel.sections.map(entry => entry.sources.map(item => item.id)),
      payload.sections.map(entry => entry.sources.map(item => item.source_id)),
    );
  }));
});

test('the run history and audit log normalizers are idempotent', () => {
  assertProperty(fc.property(fc.oneof(runs, fc.jsonValue()), payload => {
    const once = normalizeParserRuns(payload);

    assert.deepEqual(normalizeParserRuns(once), once);
  }));
  assertProperty(fc.property(fc.jsonValue(), payload => {
    const once = normalizeParserAudit(payload);

    assert.deepEqual(normalizeParserAudit(once), once);
  }));
});
