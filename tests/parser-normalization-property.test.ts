import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  normalizeParserAudit,
  normalizeParserControl,
  normalizeParserRuns,
  normalizeParserWarnings,
} from '../src/features/adminParserControl/normalize.js';

const propertyOptions = {
  numRuns: 500,
  seed: Number(process.env.FAST_CHECK_SEED || 20_260_724),
};

fc.assert(fc.property(fc.jsonValue(), value => {
  const snapshot = normalizeParserControl(value);
  assert.ok(Number.isFinite(snapshot.revision) && snapshot.revision >= 0);
  assert.ok(['stable', 'early'].includes(snapshot.policy.mode));
  assert.ok(Array.isArray(snapshot.sections));
  assert.ok(Array.isArray(snapshot.schedules));
  assert.ok(Array.isArray(snapshot.warnings));
  for (const section of snapshot.sections) {
    assert.equal(typeof section.id, 'string');
    assert.ok(Array.isArray(section.sources));
  }
}), propertyOptions);

fc.assert(fc.property(fc.jsonValue(), value => {
  const runs = normalizeParserRuns(value);
  assert.ok(Array.isArray(runs));
  for (const run of runs) {
    assert.equal(typeof run.id, 'string');
    assert.ok(['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled'].includes(run.status));
    assert.ok(run.totalSources >= 0);
    assert.ok(run.completedSources >= 0);
    assert.ok(run.failedSources >= 0);
  }
}), propertyOptions);

fc.assert(fc.property(fc.jsonValue(), value => {
  assert.ok(normalizeParserAudit(value).length <= 100);
  assert.ok(Array.isArray(normalizeParserWarnings(value)));
}), propertyOptions);

console.log(`parser normalization properties passed (seed ${propertyOptions.seed})`);
