// Cases for scripts/production-monitor-alert.mjs, run from
// production-monitor.test.mjs (a registered suite file).
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ALERT_LABELS,
  ALERT_MARKER,
  failureFingerprint,
  planAlert,
  readMonitorReport,
  runAlert,
} from '../scripts/production-monitor-alert.mjs';

const runUrl = 'https://github.com/example/repo/actions/runs/1';
const red = (...labels) => ({
  status: 'error',
  checkedAt: '2026-11-16T01:00:00.000Z',
  failures: labels.map(label => ({ label, message: `/${label}/: HTTP 503 (12 ms)` })),
  warnings: [],
});
const green = { status: 'ok', checkedAt: '2026-11-16T01:05:00.000Z', failures: [], warnings: [{ label: 'x', message: 'slow' }] };

// A fake `gh`: one open alert issue at most, every call recorded.
function fakeGh(issues = []) {
  const calls = [];
  const gh = (args, input) => {
    calls.push({ args, input });
    if (args[1] === 'list') return JSON.stringify(issues);
    return '';
  };
  return { gh, calls };
}
const mutations = calls => calls.filter(call => call.args[1] !== 'list').map(call => call.args.slice(0, 3).join(' '));

// Green and no open alert: silent.
assert.equal(planAlert({ outcome: 'success', report: green, openIssue: null, runUrl }).type, 'noop');

// First red run opens exactly one issue with the required labels.
let fake = fakeGh();
let plan = runAlert({ outcome: 'failure', reportFile: writeReport(red('page template standard-card-detail')), runUrl, gh: fake.gh });
assert.equal(plan.type, 'open');
assert.deepEqual(mutations(fake.calls), ['issue create --title']);
const create = fake.calls.find(call => call.args[1] === 'create');
for (const label of ALERT_LABELS) assert.ok(create.args.includes(label));
assert.ok(create.input.includes(ALERT_MARKER) && create.input.includes('/page template standard-card-detail/'.slice(1, -1)));
assert.ok(create.input.split('\n').some(line => line === `Прогон: ${runUrl}`), 'the alert links the monitor run');
const openBody = create.input;

// The next red runs with the same failures change nothing (no duplicates).
fake = fakeGh([{ number: 7, body: openBody }]);
plan = runAlert({ outcome: 'failure', reportFile: writeReport(red('page template standard-card-detail')), runUrl, gh: fake.gh });
assert.equal(plan.type, 'noop');
assert.deepEqual(mutations(fake.calls), []);

// A different set of failures: one comment and a new fingerprint, never a second issue.
fake = fakeGh([{ number: 7, body: openBody }]);
plan = runAlert({ outcome: 'failure', reportFile: writeReport(red('page template standard-card-detail', 'SEO crawl contract')), runUrl, gh: fake.gh });
assert.equal(plan.type, 'update');
assert.deepEqual(mutations(fake.calls), ['issue comment 7', 'issue edit 7']);
const edited = fake.calls.find(call => call.args[1] === 'edit').input;
assert.ok(edited.includes(`fingerprint:${failureFingerprint(red('page template standard-card-detail', 'SEO crawl contract').failures)}`));
assert.ok(edited.includes(ALERT_MARKER));

// Green with an open alert: recovery comment and close.
fake = fakeGh([{ number: 7, body: openBody }]);
plan = runAlert({ outcome: 'success', reportFile: writeReport(green), runUrl, gh: fake.gh });
assert.equal(plan.type, 'recover');
assert.deepEqual(mutations(fake.calls), ['issue comment 7', 'issue close 7']);
assert.match(fake.calls.find(call => call.args[1] === 'comment').input, /снова зелёный/);

// An unrelated open issue with the same labels is never touched.
fake = fakeGh([{ number: 3, body: 'обычный баг' }]);
assert.equal(runAlert({ outcome: 'success', reportFile: writeReport(green), runUrl, gh: fake.gh }).type, 'noop');

// A probe that left no report still alerts.
assert.deepEqual(readMonitorReport('/nonexistent/report.json', 'failure').failures.map(failure => failure.label), ['monitor']);
fake = fakeGh();
assert.equal(runAlert({ outcome: 'failure', reportFile: '/nonexistent/report.json', runUrl, gh: fake.gh }).type, 'open');

// Warnings alone never open an issue; they land in the run summary.
const summaryFile = path.join(mkdtempSync(path.join(tmpdir(), 'monitor-alert-')), 'summary.md');
fake = fakeGh();
runAlert({ outcome: 'success', reportFile: writeReport(green), runUrl, summaryFile, gh: fake.gh });
assert.deepEqual(mutations(fake.calls), []);
assert.match(readFileSync(summaryFile, 'utf8'), /x: slow/);

// The fingerprint depends on the set of labels, not on the order or the text.
assert.equal(
  failureFingerprint([{ label: 'b', message: '1' }, { label: 'a', message: '2' }]),
  failureFingerprint([{ label: 'a', message: 'other' }, { label: 'b', message: '3' }]),
);

function writeReport(report) {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'monitor-alert-')), 'report.json');
  writeFileSync(file, JSON.stringify(report));
  return file;
}
