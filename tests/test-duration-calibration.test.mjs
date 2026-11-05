import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { calibrateTestDurations } from '../scripts/update-test-durations.mjs';

const files = ['tests/a.test.mjs', 'tests/b.test.mjs', 'tests/c.test.mjs'];
const registry = { suites: [{ id: 'unit', files }] };
const previous = { version: 1, source: 'old', defaultSeconds: 15, seconds: { [files[0]]: 1, [files[1]]: 5, [files[2]]: 7 } };
const observation = (id, milliseconds, overrides = {}) => ({
  version: 1,
  run: { id, attempt: '1', sha: 'a'.repeat(40), event: 'merge_group', ref: 'refs/heads/gh-readonly-queue/main/pr-1' },
  quarantine: null,
  results: [{ testFile: files[0], status: 'PASS', milliseconds }],
  ...overrides,
});

test('calibrates medians across distinct runs and preserves files without enough samples', () => {
  const reports = [observation('3', 100_000), observation('1', 2000), observation('2', 4000)];
  reports[0].results.push({ testFile: files[1], status: 'PASS', milliseconds: 80_000 });
  const updated = calibrateTestDurations(previous, reports, registry);
  assert.equal(updated.seconds[files[0]], 4);
  assert.equal(updated.seconds[files[1]], 5);
  assert.equal(updated.seconds[files[2]], 7);
  assert.equal(updated.defaultSeconds, 15);
  assert.deepEqual(previous.seconds, { [files[0]]: 1, [files[1]]: 5, [files[2]]: 7 });
  assert.match(updated.source, /1\/1.*2\/1.*3\/1/);
  assert.deepEqual(updated, calibrateTestDurations(previous, reports.toReversed(), registry));
});

test('ignores PR, quarantine, flaky and failed or incomplete shard observations', () => {
  const flaky = observation('3', 200_000);
  flaky.results[0].status = 'FLAKY';
  const failed = observation('4', 300_000);
  failed.results.push({ testFile: files[1], status: 'FAIL', milliseconds: 1000 });
  const incomplete = observation('5', 400_000);
  incomplete.results.push({ testFile: files[1], status: 'NOT RUN', milliseconds: null });
  const reports = [observation('1', 2000), observation('2', 4000), flaky, failed, incomplete,
    observation('6', 500_000, { run: { ...observation('6').run, event: 'pull_request' } }),
    observation('7', 600_000, { quarantine: 'only' }),
    observation('8', 700_000, { run: { ...observation('8').run, event: 'push', ref: 'refs/heads/feature' } }),
  ];
  assert.equal(calibrateTestDurations(previous, reports, registry).seconds[files[0]], 3);
});

test('rejects duplicate observations and malformed timings instead of biasing the median', () => {
  const report = observation('1', 2000);
  assert.throws(() => calibrateTestDurations(previous, [report, report], registry), /duplicate/);
  for (const milliseconds of [NaN, Infinity, -1, null, '1000']) {
    assert.throws(() => calibrateTestDurations(previous, [observation('1', milliseconds)], registry), /duration/);
  }
  assert.throws(() => calibrateTestDurations(previous, [{ ...report, version: 2 }], registry), /version/);
  assert.throws(() => calibrateTestDurations(previous, [report, observation('1', 2000, {
    run: { ...report.run, sha: 'b'.repeat(40) }, results: [],
  })], registry), /conflicting SHA/);
});

test('combines separate shards without counting a run twice and rejects insufficient evidence', () => {
  const reports = ['1', '2'].flatMap(id => [observation(id, 2000), observation(id, 4000, {
    results: [{ testFile: files[1], status: 'PASS', milliseconds: 4000 }],
  })]);
  assert.deepEqual(calibrateTestDurations(previous, reports, registry).seconds, {
    [files[0]]: 2, [files[1]]: 4, [files[2]]: 7,
  });
  assert.throws(() => calibrateTestDurations(previous, [reports[0]], registry), /at least two/);
});

test('counts only the latest attempt of each run and handles zero-time files', () => {
  const reports = [observation('1', 200_000), observation('1', 0, {
    run: { ...observation('1').run, attempt: '2' },
  }), observation('2', 0)];
  assert.equal(calibrateTestDurations(previous, reports, registry).seconds[files[0]], 0.001);
});

test('CLI updates a manifest from reports and leaves it intact on invalid input', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'test-durations-'));
  const script = new URL('../scripts/update-test-durations.mjs', import.meta.url).pathname;
  try {
    const manifestPath = path.join(directory, 'weights.json');
    const registryPath = path.join(directory, 'registry.json');
    const reportPath = path.join(directory, 'report.json');
    writeFileSync(manifestPath, JSON.stringify(previous));
    writeFileSync(registryPath, JSON.stringify(registry));
    writeFileSync(reportPath, JSON.stringify([observation('1', 2000), observation('2', 4000)]));
    const args = [script, '--reports', reportPath, '--output', manifestPath, '--registry', registryPath];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(manifestPath)).seconds[files[0]], 3);
    const accepted = readFileSync(manifestPath, 'utf8');
    writeFileSync(reportPath, '{invalid');
    const failed = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.notEqual(failed.status, 0);
    assert.equal(readFileSync(manifestPath, 'utf8'), accepted);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
