import assert from 'node:assert/strict';
import test from 'node:test';
import { QA_BATCHES, QA_GROUPS, qaBatch, qaGroupFilter } from '../scripts/qa/groups.mjs';
import { screenshotCapture } from '../scripts/qa/screenshots.mjs';

test('standalone screenshots remain enabled and CI can omit optional diagnostics', async () => {
  const calls = [];
  const target = { screenshot: async options => { calls.push(options); return 'png'; } };
  assert.equal(await screenshotCapture()(target, { path: 'optional.png' }), 'png');
  assert.equal(await screenshotCapture('responsive')(target, { path: 'unused.png' }), undefined);
  assert.deepEqual(calls, [{ path: 'optional.png' }]);
  assert.equal(await screenshotCapture()(null, {}), undefined);
  assert.throws(() => screenshotCapture('typo'));
});

test('four batches cover all eight groups exactly once and keep paired groups isolated', () => {
  assert.equal(QA_BATCHES.length, 4);
  assert.equal(new Set(QA_BATCHES.flat()).size, 8);
  assert.deepEqual([1, 2, 3, 4].flatMap(qaBatch), QA_GROUPS);
  for (const selected of QA_GROUPS) {
    assert.deepEqual(QA_GROUPS.filter(group => qaGroupFilter(selected)(group)), [selected]);
  }
  assert.ok(QA_GROUPS.every(group => qaGroupFilter()(group)));
  assert.throws(() => qaGroupFilter('typo'));
  assert.throws(() => qaGroupFilter('home')('typo'));
  assert.throws(() => qaGroupFilter('home', 'routes'));
  assert.throws(() => qaGroupFilter('routes-desktop', 'interactions'));
  for (const value of ['0', '5', '1/2', '', undefined]) assert.throws(() => qaBatch(value));
});
