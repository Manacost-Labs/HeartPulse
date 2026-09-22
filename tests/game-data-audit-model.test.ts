import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAuditReport,
  evaluateCatalogRecords,
  isAuditDue,
  stateFromReport,
} from '../server/modules/gameDataAudit/model.js';
import type { AuditState, SourceObservation } from '../server/modules/gameDataAudit/types.js';

const NOW = new Date('2026-08-07T06:00:00.000Z');

function observation(overrides: Partial<SourceObservation> = {}): SourceObservation {
  return {
    id: 'cards',
    label: 'Карты Полей сражений',
    role: 'catalog',
    required: true,
    ok: true,
    checkedAt: NOW.toISOString(),
    fingerprint: 'same',
    recordCount: 1200,
    facts: {},
    issues: [],
    ...overrides,
  };
}

test('active battleground minions require localized names, image and golden variant', () => {
  const result = evaluateCatalogRecords('battlegroundCards', [
    {
      card_id: 'BG36_001',
      card_type: { slug: 'minion' },
      variant: { kind: 'base' },
      in_pool: true,
      name: { ru: 'Тест', en: 'Test' },
      images: { card: 'https://db.kolodahs.ru/card.png', art: 'a', framed: 'f' },
      golden_variant: null,
    },
  ]);

  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0]?.code, 'MISSING_GOLDEN_VARIANT');
  assert.equal(result.issues[0]?.severity, 'error');
});

test('duplicate card ids are reported without copying untrusted card text', () => {
  const result = evaluateCatalogRecords('darkGifts', [
    { card_id: 'BG36_X', name: { ru: 'Один', en: 'One' }, images: { card: 'x' } },
    { card_id: 'BG36_X', name: { ru: 'Два', en: 'Two' }, images: { card: 'y' } },
  ]);

  assert.equal(result.issues[0]?.code, 'DUPLICATE_ID');
  assert.equal(JSON.stringify(result).includes('Один'), false);
  assert.equal(JSON.stringify(result).includes('Два'), false);
});

test('a changed release signal opens a 72 hour fast audit window and escalates', () => {
  const previous: AuditState = {
    schemaVersion: 1,
    lastCompletedAt: '2026-08-07T00:00:00.000Z',
    fastModeUntil: null,
    sources: {
      hjson: { fingerprint: 'old', recordCount: null, checkedAt: '2026-08-07T00:00:00.000Z' },
    },
  };
  const report = buildAuditReport({
    now: NOW,
    previous,
    observations: [observation({ id: 'hjson', role: 'release-signal', fingerprint: 'new', recordCount: null })],
    fastModeHours: 72,
  });

  assert.equal(report.status, 'change_detected');
  assert.equal(report.shouldInvokeCodex, true);
  assert.equal(report.patchSignal, true);
  assert.equal(report.fastModeUntil, '2026-08-10T06:00:00.000Z');
});

test('failed required source is incomplete while a stale optional source is source_lag', () => {
  const incomplete = buildAuditReport({
    now: NOW,
    previous: null,
    observations: [observation({ ok: false, issues: [{ code: 'FETCH_FAILED', severity: 'error', message: 'Источник недоступен' }] })],
    fastModeHours: 72,
  });
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(incomplete.shouldInvokeCodex, true);

  const lag = buildAuditReport({
    now: NOW,
    previous: null,
    observations: [observation({ required: false, ok: false, issues: [{ code: 'SOURCE_LAG', severity: 'warning', message: 'Источник отстаёт' }] })],
    fastModeHours: 72,
  });
  assert.equal(lag.status, 'source_lag');
});

test('an unchanged incomplete condition is reported without repeating Codex review', () => {
  const failingObservation = observation({
    ok: false,
    fingerprint: null,
    recordCount: null,
    issues: [{ code: 'FETCH_FAILED', severity: 'error', message: 'Источник недоступен' }],
  });
  const first = buildAuditReport({ now: NOW, previous: null, observations: [failingObservation], fastModeHours: 72 });
  const second = buildAuditReport({
    now: new Date('2026-08-07T12:00:00.000Z'),
    previous: stateFromReport(first),
    observations: [{ ...failingObservation, checkedAt: '2026-08-07T12:00:00.000Z' }],
    fastModeHours: 72,
  });

  assert.equal(first.shouldInvokeCodex, true);
  assert.equal(second.status, 'incomplete');
  assert.equal(second.shouldInvokeCodex, false);
});

test('actionable catalog change is not hidden by an unrelated source-lag warning', () => {
  const previous: AuditState = {
    schemaVersion: 1,
    lastCompletedAt: '2026-08-07T00:00:00.000Z',
    fastModeUntil: null,
    sources: { cards: { fingerprint: 'old', recordCount: 100, checkedAt: '2026-08-07T00:00:00.000Z' } },
  };
  const report = buildAuditReport({
    now: NOW,
    previous,
    observations: [
      observation({ fingerprint: 'new', escalateOnChange: true }),
      observation({ id: 'optional', required: false, ok: false, fingerprint: null, issues: [{ code: 'SOURCE_LAG', severity: 'warning', message: 'Отстаёт' }] }),
    ],
    fastModeHours: 72,
  });

  assert.equal(report.status, 'change_detected');
  assert.equal(report.shouldInvokeCodex, true);
});

test('hourly scheduler runs every six hours normally and hourly during fast mode', () => {
  const normal: AuditState = {
    schemaVersion: 1,
    lastCompletedAt: '2026-08-07T01:00:00.000Z',
    fastModeUntil: null,
    sources: {},
  };
  assert.equal(isAuditDue(normal, NOW, { normalIntervalHours: 6, fastIntervalHours: 1 }), false);
  assert.equal(isAuditDue(normal, new Date('2026-08-07T07:00:01.000Z'), { normalIntervalHours: 6, fastIntervalHours: 1 }), true);

  const fast = { ...normal, fastModeUntil: '2026-08-08T00:00:00.000Z' };
  assert.equal(isAuditDue(fast, new Date('2026-08-07T02:00:01.000Z'), { normalIntervalHours: 6, fastIntervalHours: 1 }), true);
  assert.equal(isAuditDue({ ...normal, lastCompletedAt: 'broken-date' }, NOW, { normalIntervalHours: 6, fastIntervalHours: 1 }), true);
});

test('failed source keeps its last known fingerprint for recovery comparison', () => {
  const previous: AuditState = {
    schemaVersion: 1,
    lastCompletedAt: '2026-08-07T00:00:00.000Z',
    fastModeUntil: null,
    sources: { cards: { fingerprint: 'known-good', recordCount: 10, checkedAt: '2026-08-07T00:00:00.000Z' } },
  };
  const report = buildAuditReport({
    now: NOW,
    previous,
    observations: [observation({ ok: false, fingerprint: null, recordCount: null, issues: [{ code: 'FETCH_FAILED', severity: 'error', message: 'Недоступно' }] })],
    fastModeHours: 72,
  });

  assert.equal(stateFromReport(report, previous).sources.cards?.fingerprint, 'known-good');
});

test('a failed invariant snapshot cannot replace the last-known-good fingerprint', () => {
  const previous: AuditState = {
    schemaVersion: 1,
    lastCompletedAt: '2026-08-07T00:00:00.000Z',
    fastModeUntil: null,
    sources: { cards: { fingerprint: 'known-good', recordCount: 100, checkedAt: '2026-08-07T00:00:00.000Z' } },
  };
  const report = buildAuditReport({
    now: NOW,
    previous,
    observations: [observation({
      ok: false,
      fingerprint: 'broken-snapshot',
      recordCount: 10,
      issues: [{ code: 'TOO_FEW_RECORDS', severity: 'error', message: 'Неполный источник' }],
    })],
    fastModeHours: 72,
  });

  const state = stateFromReport(report, previous);
  assert.equal(state.sources.cards?.fingerprint, 'known-good');
  assert.equal(state.sources.cards?.recordCount, 100);
});

test('untracked high-churn source does not create a catalog change', () => {
  const previous: AuditState = {
    schemaVersion: 1,
    lastCompletedAt: '2026-08-07T00:00:00.000Z',
    fastModeUntil: null,
    sources: { wiki: { fingerprint: 'old', recordCount: 100, checkedAt: '2026-08-07T00:00:00.000Z' } },
  };
  const report = buildAuditReport({
    now: NOW,
    previous,
    observations: [observation({ id: 'wiki', required: false, fingerprint: 'new', trackChanges: false })],
    fastModeHours: 72,
  });

  assert.equal(report.status, 'no_change');
  assert.equal(report.changes.length, 0);
  assert.equal(report.shouldInvokeCodex, false);
});
